import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from './parsers/index.js';
import { chunkSections } from './chunker.js';
import { embedBatch } from './embedder.js';
import * as documentStore from '../memory/documents/store.js';
import * as chunkStore from '../memory/chunks/store.js';
import { extractFacts } from '../memory/facts/extractor.js';
import { saveFact } from '../memory/facts/store.js';
import { DEFAULT_CATEGORIES } from '../memory/facts/categories.js';
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
}) {
  const ns = namespace || config.defaults.namespace;
  const cats = categories || Object.keys(DEFAULT_CATEGORIES);
  const prompt = promptPath || DEFAULT_PROMPT_PATH;

  // Step 1: Parse content into text + sections
  console.log('[1/6] Parsing content...');
  const parsed = parse(content, { format: metadata.format, filePath: sourcePath, contentType });
  const resolvedTitle = title || parsed.metadata?.title || sourcePath;

  // Step 2: Hash for change detection + upsert document
  console.log('[2/6] Checking for changes...');
  const contentHash = createHash('sha256').update(content).digest('hex');
  const { doc, changed } = await documentStore.upsert({
    sourcePath,
    sourceType,
    title: resolvedTitle,
    contentHash,
    namespace: ns,
  });

  if (!changed) {
    console.log('  Skipped — content unchanged.');
    return { documentId: doc.id, title: resolvedTitle, skipped: true };
  }

  // Step 3: Chunk + embed
  console.log('[3/6] Chunking and embedding...');
  const chunks = chunkSections(parsed.sections);
  console.log(`  ${chunks.length} chunks created`);

  const texts = chunks.map((c) => c.content);
  const embeddings = await embedBatch(texts);

  const chunksWithEmbeddings = chunks.map((chunk, i) => ({
    ...chunk,
    embedding: embeddings[i],
  }));

  await chunkStore.insertChunks(doc.id, chunksWithEmbeddings, ns);

  // Step 4: Extract facts
  let factResult = { counts: { total: 0, added: 0, skipped: 0, updated: 0, contradicted: 0 }, results: [] };

  if (!skipFacts) {
    console.log('[4/6] Extracting facts...');
    factResult = await extractAndStoreFacts(parsed.text, {
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
  let entityResult = { entityCount: 0, relationCount: 0, factEntityLinks: 0, topics: [] };

  if (!skipEntities && factResult.results.length) {
    console.log('[5/6] Linking entities...');
    entityResult = await linkDocumentEntities({
      title: resolvedTitle,
      sourceType,
      metadata,
    }, factResult.results, ns, entities);
    console.log(`  ${entityResult.entityCount} entities, ${entityResult.relationCount} relations`);
  }

  // Step 6: Generate markdown
  let mdResult = null;

  if (!skipMarkdown) {
    console.log('[6/6] Generating markdown...');
    mdResult = await generateMd({
      uid: doc.uid,
      title: resolvedTitle,
      sourceType,
      sourcePath,
      namespace: ns,
      sections: parsed.sections,
      factResult,
      entityResult,
      metadata,
    });
  }

  console.log(`Done. ${chunks.length} chunks, ${factResult.counts.total} facts, ${entityResult.entityCount} entities`);

  return {
    documentId: doc.id,
    documentUid: doc.uid,
    title: resolvedTitle,
    skipped: false,
    chunkCount: chunks.length,
    facts: factResult.counts,
    entities: entityResult,
    md: mdResult,
  };
}

async function extractAndStoreFacts(text, { documentId, namespace, promptPath, categories }) {
  const counts = { total: 0, added: 0, skipped: 0, updated: 0, contradicted: 0 };
  const results = [];

  const rawFacts = await extractFacts(text, { promptPath, categories });
  counts.total = rawFacts.length;
  console.log(`  ${rawFacts.length} facts extracted`);

  for (const raw of rawFacts) {
    const result = await saveFact({
      content: raw.content,
      category: raw.category,
      confidence: raw.confidence,
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
