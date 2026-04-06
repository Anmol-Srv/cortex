import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from './parsers/index.js';
import { chunkSections } from './chunker.js';
import { embedBatch } from './embedder.js';
import { contextualizeChunks } from './contextualizer.js';
import * as documentStore from '../memory/documents/store.js';
import * as chunkStore from '../memory/chunks/store.js';
import { extractFactsFromChunks } from '../memory/facts/extractor.js';
import { saveFact } from '../memory/facts/store.js';
import { DEFAULT_CATEGORIES } from '../memory/facts/categories.js';
import { classifyInput } from '../memory/cognitive/input-classifier.js';
import { linkDocumentEntities } from '../memory/entities/linker.js';
import { renderKnowledgeFile } from '../generators/markdown/renderer.js';
import { writeOutput } from '../generators/output.js';
import config from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROMPT_PATH = join(__dirname, '../../prompts/default-extraction.md');

/**
 * Ingest a document into the Cortex knowledge base.
 *
 * This is the single public API for ingestion. All sources (file, URL, raw)
 * produce a source object that gets passed here.
 */
async function ingestDocument({
  content,
  title,
  sourcePath,
  sourceType = 'raw',
  contentType,
  namespace,
  metadata = {},
  promptPath,
  categories,
  entities,
  skipFacts = false,
  skipEntities = false,
  skipMarkdown = false,
  skipContextualization = false,
  classify = true,
}) {
  const ns = namespace || config.defaults.namespace;
  const cats = categories || Object.keys(DEFAULT_CATEGORIES);
  const prompt = promptPath || DEFAULT_PROMPT_PATH;
  let finalTitle = title || sourcePath;

  // Step 0: Classify input (cognitive layer)
  let classification = null;
  if (classify) {
    console.log('[0/6] Classifying input...');
    classification = await classifyInput(content, { title: finalTitle });
    console.log(`  Route: ${classification.route} — ${classification.reasoning}`);

    if (classification.route === 'noise') {
      console.log('  Skipped — classified as noise.');
      return { documentId: null, title: finalTitle, skipped: true, route: 'noise' };
    }
  }

  // Step 1: Parse content into text + sections
  console.log('[1/6] Parsing content...');
  const parsed = parse(content, { format: metadata.format, filePath: sourcePath, contentType });
  finalTitle = title || parsed.metadata?.title || sourcePath;

  // Step 2: Hash for change detection + upsert document
  console.log('[2/6] Checking for changes...');
  const contentHash = createHash('sha256').update(content).digest('hex');
  const { doc, changed } = await documentStore.upsert({
    sourcePath,
    sourceType,
    title: finalTitle,
    contentHash,
    namespace: ns,
  });

  if (!changed) {
    console.log('  Skipped — content unchanged.');
    return { documentId: doc.id, title: finalTitle, skipped: true };
  }

  // Thought fast-path: store facts directly, skip chunking/extraction
  if (classification?.route === 'thought' && classification.facts.length) {
    console.log(`[thought] Storing ${classification.facts.length} facts directly...`);
    const thoughtResult = await storeDirectFacts(classification.facts, {
      documentId: doc.id,
      namespace: ns,
    });

    let entityResult = { entityCount: 0, relationCount: 0, factEntityLinks: 0, topics: [] };
    if (!skipEntities && thoughtResult.results.length) {
      entityResult = await linkDocumentEntities(
        { title: finalTitle, sourceType, metadata },
        thoughtResult.results,
        ns,
        entities,
      );
    }

    await documentStore.updateCounts(doc.id, { chunkCount: 0, factCount: thoughtResult.counts.added });

    console.log(`Done. Route: thought, ${thoughtResult.counts.total} facts (${thoughtResult.counts.added} new)`);
    return {
      documentId: doc.id,
      documentUid: doc.uid,
      title: finalTitle,
      skipped: false,
      route: 'thought',
      chunkCount: 0,
      facts: thoughtResult.counts,
      entities: entityResult,
      md: null,
    };
  }

  let chunks = [];
  let factResult = { counts: { total: 0, added: 0, skipped: 0, updated: 0, contradicted: 0 }, results: [] };
  let entityResult = { entityCount: 0, relationCount: 0, factEntityLinks: 0, topics: [] };
  let mdResult = null;

  try {
    // Step 3: Chunk + contextualize + embed
    console.log('[3/6] Chunking and embedding...');
    chunks = chunkSections(parsed.sections);
    console.log(`  ${chunks.length} chunks created`);

    if (!skipContextualization && chunks.length) {
      chunks = await contextualizeChunks(chunks, parsed.text, { title: finalTitle });
    }

    const texts = chunks.map((c) => {
      const prefix = c.contextualPrefix;
      return prefix ? `${prefix}\n${c.content}` : c.content;
    });
    const embeddings = await embedBatch(texts);

    const chunksWithEmbeddings = chunks.map((chunk, i) => ({
      ...chunk,
      embedding: embeddings[i],
    }));

    await chunkStore.insertChunks(doc.id, chunksWithEmbeddings, ns);

    // Step 4: Extract facts per chunk
    if (!skipFacts) {
      console.log('[4/6] Extracting facts...');
      factResult = await extractAndStoreFacts(chunks, {
        documentId: doc.id,
        namespace: ns,
        promptPath: prompt,
        categories: cats,
      });
    }

    await documentStore.updateCounts(doc.id, {
      chunkCount: chunks.length,
      factCount: factResult.counts.added + factResult.counts.updated + factResult.counts.contradicted,
    });

    // Step 5: Link entities
    if (!skipEntities && factResult.results.length) {
      console.log('[5/6] Linking entities...');
      entityResult = await linkDocumentEntities({
        title: finalTitle,
        sourceType,
        metadata,
      }, factResult.results, ns, entities);
      console.log(`  ${entityResult.entityCount} entities, ${entityResult.relationCount} relations`);
    }

    // Step 6: Generate markdown
    if (!skipMarkdown) {
      console.log('[6/6] Generating markdown...');
      mdResult = await generateMd({
        uid: doc.uid,
        title: finalTitle,
        sourceType,
        sourcePath,
        namespace: ns,
        sections: parsed.sections,
        factResult,
        entityResult,
        metadata,
      });
    }
  } catch (err) {
    // Reset content hash so re-ingest doesn't skip this document
    console.error(`[pipeline] Failed after document upsert: ${err.message}`);
    await documentStore.resetHash(doc.id).catch(() => {});
    throw err;
  }

  console.log(`Done. ${chunks.length} chunks, ${factResult.counts.total} facts, ${entityResult.entityCount} entities`);

  return {
    documentId: doc.id,
    documentUid: doc.uid,
    title: finalTitle,
    skipped: false,
    chunkCount: chunks.length,
    facts: factResult.counts,
    entities: entityResult,
    md: mdResult,
  };
}

async function storeDirectFacts(facts, { documentId, namespace }) {
  const counts = { total: facts.length, added: 0, skipped: 0, updated: 0, contradicted: 0 };
  const results = [];

  for (const raw of facts) {
    const result = await saveFact({
      content: raw.content,
      category: raw.category,
      confidence: raw.confidence || 'high',
      importance: raw.importance || 'vital',
      namespace,
      sourceDocumentIds: documentId ? [documentId] : [],
      sourceSection: raw.category,
    });

    results.push(result);
    const action = result.action.toLowerCase();
    if (action === 'add') counts.added++;
    else if (action === 'skip') counts.skipped++;
    else if (action === 'update') counts.updated++;
    else if (action === 'contradict') counts.contradicted++;
  }

  return { counts, results };
}

async function extractAndStoreFacts(chunks, { documentId, namespace, promptPath, categories }) {
  const counts = { total: 0, added: 0, skipped: 0, updated: 0, contradicted: 0 };
  const results = [];

  const rawFacts = await extractFactsFromChunks(chunks, { promptPath, categories });
  counts.total = rawFacts.length;
  console.log(`  ${rawFacts.length} facts extracted from ${chunks.length} chunks`);

  for (const raw of rawFacts) {
    const result = await saveFact({
      content: raw.content,
      category: raw.category,
      confidence: raw.confidence,
      importance: raw.importance || 'supplementary',
      namespace,
      sourceDocumentIds: documentId ? [documentId] : [],
      sourceSection: raw.sourceSection || raw.category,
    });

    results.push(result);
    const action = result.action.toLowerCase();
    if (action === 'add') counts.added++;
    else if (action === 'skip') counts.skipped++;
    else if (action === 'update') counts.updated++;
    else if (action === 'contradict') counts.contradicted++;
  }

  return { counts, results };
}

async function generateMd({ uid, title, sourceType, sourcePath, namespace, sections, factResult, entityResult, metadata }) {
  const document = {
    uid,
    type: sourceType,
    title,
    date: new Date().toISOString().split('T')[0],
    frontmatter: {
      source: sourcePath,
      source_type: sourceType,
      namespace,
      fact_count: factResult.counts.added + factResult.counts.updated,
      entity_count: entityResult.entityCount,
      topics: entityResult.topics?.length ? entityResult.topics.join(', ') : null,
    },
    headerLinks: [
      { label: 'Source', text: sourcePath },
      { label: 'Type', text: sourceType },
    ],
    sections: sections
      .filter((s) => s.text)
      .map((s) => ({ heading: s.heading, body: s.text.slice(0, 2000) })),
    relatedLinks: [],
    sources: [{ label: 'Source path', url: sourcePath }],
  };

  const markdown = renderKnowledgeFile(document);
  const slug = slugify(title);
  const key = `cortex/${sourceType}/${slug}.md`;

  return writeOutput(key, markdown);
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export { ingestDocument };
