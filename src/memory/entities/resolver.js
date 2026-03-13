import { readFile } from 'node:fs/promises';

import { embed } from '../../ingestion/embedder.js';
import { prompt as llmPrompt, parseJson } from '../../lib/llm.js';
import config from '../../config.js';
import { insertEntity, findByName, incrementMentionCount, updateEntityTypes, getCanonicalEntity } from './store.js';
import { findFuzzyMatch, verifyFuzzyMatch } from './fuzzy-matcher.js';
import { findEmbeddingMatch, verifyEmbeddingMatch } from './embedding-matcher.js';

/**
 * Resolve a single entity via 4-stage deduplication cascade:
 *   Stage 1: Exact name match (any type) — fast O(1)
 *   Stage 2: Fuzzy string match + LLM verify — catches typos/variations
 *   Stage 3: Embedding similarity + LLM verify — catches semantic equivalents
 *   Stage 4: Create new entity
 */
async function resolveEntity({ name, entityType, description, namespace, externalId, embedding }) {
  const ns = namespace || config.defaults.namespace;

  // Stage 1: Exact Name Match
  let existing = await findByName(name, ns);
  if (existing) {
    existing = await getCanonicalEntity(existing.id);
    await incrementMentionCount(existing.id);

    if (existing.entityType !== entityType) {
      await updateEntityTypes(existing.id, entityType);
    }

    return existing;
  }

  const nameEmbedding = embedding || await embed(`${entityType}: ${name}`);

  // Stage 2: Fuzzy String Match
  const fuzzyMatches = await findFuzzyMatch(name, { namespace: ns, limit: 3 });

  for (const match of fuzzyMatches) {
    const isSame = await verifyFuzzyMatch(name, entityType, match);

    if (isSame) {
      const canonical = await getCanonicalEntity(match.id);
      await incrementMentionCount(canonical.id);
      await updateEntityTypes(canonical.id, entityType);
      return canonical;
    }
  }

  // Stage 3: Embedding Similarity
  const embeddingMatches = await findEmbeddingMatch(name, nameEmbedding, {
    namespace: ns,
    limit: 3,
  });

  for (const match of embeddingMatches) {
    const isSame = await verifyEmbeddingMatch(name, entityType, match);

    if (isSame) {
      const canonical = await getCanonicalEntity(match.id);
      await incrementMentionCount(canonical.id);
      await updateEntityTypes(canonical.id, entityType);
      return canonical;
    }
  }

  // Stage 4: Create New Entity
  return insertEntity({
    name,
    entityType,
    description,
    namespace: ns,
    externalId,
    embedding: nameEmbedding,
  });
}

/**
 * LLM-based topic extraction from facts.
 * Takes extracted facts, asks Claude for topic entities, resolves each.
 */
async function resolveTopicsFromFacts(facts, { promptPath, namespace }) {
  if (!facts.length) return [];

  const factsText = facts.map((f) => `- [${f.category}] ${f.content}`).join('\n');
  const systemPrompt = await readFile(promptPath, 'utf8');
  const fullPrompt = `${systemPrompt}\n\n---\n\n${factsText}`;

  const response = await llmPrompt(fullPrompt, { model: config.llm.entityModel });
  const parsed = parseJson(response);

  if (!Array.isArray(parsed)) return [];

  const validTopics = parsed.filter((t) => t.name);
  if (!validTopics.length) return [];

  const topics = [];
  for (const item of validTopics) {
    const entity = await resolveEntity({
      name: item.name,
      entityType: 'topic',
      description: item.description || null,
      namespace,
    });
    topics.push(entity);
  }

  return topics;
}

export { resolveEntity, resolveTopicsFromFacts };
