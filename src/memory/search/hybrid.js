import { keyBy } from 'lodash-es';

import { embed } from '../../ingestion/embedder.js';
import * as vectorSearch from './vector.js';
import * as keywordSearch from './keyword.js';
import { extractEntitiesFromFacts, findRelatedFacts, rerank } from './graph-enhancement.js';

// K=20 gives good score spread for our result set sizes (5-50).
// K=60 (original paper) compresses scores into a ~0.001 band with small sets.
const RRF_K = 20;

// Vector results get higher weight — better for semantic/natural language queries.
const VECTOR_WEIGHT = 1.0;
const KEYWORD_WEIGHT = 0.7;

async function search(query, { namespaces, limit = 20, minConfidence = 'medium', useGraph = true }) {
  const queryEmbedding = await embed(query);

  const [vectorChunks, vectorFacts, kwChunks, kwFacts] = await Promise.all([
    vectorSearch.searchChunks(queryEmbedding, { namespaces, limit }),
    vectorSearch.searchFacts(queryEmbedding, { namespaces, limit, minConfidence }),
    keywordSearch.searchChunks(query, { namespaces, limit }),
    keywordSearch.searchFacts(query, { namespaces, limit, minConfidence }),
  ]);

  const chunks = rrfMerge(vectorChunks, kwChunks, limit);
  let facts = rrfMerge(vectorFacts, kwFacts, limit);

  if (useGraph && facts.length) {
    try {
      const mentionedEntities = await extractEntitiesFromFacts(facts.slice(0, 5));

      if (mentionedEntities.length) {
        const relatedFacts = await findRelatedFacts(
          mentionedEntities.map((e) => e.id),
          { limit: 10 },
        );
        facts = rerank(facts, relatedFacts, mentionedEntities.map((e) => e.id), limit);
      }
    } catch (err) {
      console.error('[graph-enhancement] Failed, falling back to base results:', err.message);
    }
  }

  return { facts, chunks };
}

function rrfMerge(vectorResults, keywordResults, limit) {
  const scores = {};
  const itemsById = {
    ...keyBy(vectorResults, 'id'),
    ...keyBy(keywordResults, 'id'),
  };

  vectorResults.forEach((item, rank) => {
    scores[item.id] = (scores[item.id] || 0) + VECTOR_WEIGHT / (RRF_K + rank + 1);
  });

  keywordResults.forEach((item, rank) => {
    scores[item.id] = (scores[item.id] || 0) + KEYWORD_WEIGHT / (RRF_K + rank + 1);
  });

  // Normalize scores to 0-1 range
  const entries = Object.entries(scores).sort(([, a], [, b]) => b - a);
  const maxScore = entries.length ? entries[0][1] : 1;

  return entries
    .slice(0, limit)
    .map(([id, score]) => ({
      ...itemsById[id],
      rrfScore: Math.round((score / maxScore) * 1000) / 1000,
    }));
}

export { search };
