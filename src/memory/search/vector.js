import cortexDb from '../../db/cortex.js';

// Minimum cosine similarity for facts to be considered relevant.
// Below this threshold, facts are unrelated to the query even if they're the "best" in the DB.
const MIN_FACT_SIMILARITY = 0.45;

async function searchChunks(embedding, { namespaces, limit = 20 }) {
  const vec = `[${embedding.join(',')}]`;

  const { rows } = await cortexDb.raw(`
    SELECT id, document_id AS "documentId", chunk_index AS "chunkIndex",
           content, section_heading AS "sectionHeading", namespace,
           1 - (embedding <=> ?) as similarity
    FROM chunk
    WHERE namespace = ANY(?)
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ?
    LIMIT ?
  `, [vec, namespaces, vec, limit]);

  return rows;
}

async function searchFacts(embedding, { namespaces, limit = 20, minConfidence = 'medium', pointInTime, categories }) {
  const vec = `[${embedding.join(',')}]`;
  const confidenceRank = { low: 0, medium: 1, high: 2 };
  const minRank = confidenceRank[minConfidence] ?? 1;

  const params = [vec, namespaces, minRank];
  let temporalFilter = '';
  if (pointInTime) {
    temporalFilter = 'AND valid_from <= ? AND (valid_until IS NULL OR valid_until > ?)';
    params.push(pointInTime, pointInTime);
  }

  let categoryFilter = '';
  if (categories?.length) {
    categoryFilter = 'AND category = ANY(?)';
    params.push(categories);
  }

  params.push(vec, MIN_FACT_SIMILARITY, vec, limit);

  const { rows } = await cortexDb.raw(`
    SELECT id, uid, content, category, confidence, importance, namespace, status,
           source_document_ids AS "sourceDocumentIds",
           source_section AS "sourceSection",
           1 - (embedding <=> ?) as similarity
    FROM fact
    WHERE namespace = ANY(?)
      AND status = 'active'
      AND embedding IS NOT NULL
      AND CASE confidence
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 1
            ELSE 0
          END >= ?
      ${temporalFilter}
      ${categoryFilter}
      AND 1 - (embedding <=> ?) >= ?
    ORDER BY embedding <=> ?
    LIMIT ?
  `, params);

  return rows;
}

export { searchChunks, searchFacts };
