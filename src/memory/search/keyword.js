import cortexDb from '../../db/cortex.js';

async function searchChunks(query, { namespaces, limit = 20 }) {
  const { rows } = await cortexDb.raw(`
    SELECT id, document_id AS "documentId", chunk_index AS "chunkIndex",
           content, section_heading AS "sectionHeading", namespace,
           ts_rank(search_vector, plainto_tsquery('english', ?)) as rank
    FROM chunk
    WHERE namespace = ANY(?)
      AND search_vector @@ plainto_tsquery('english', ?)
    ORDER BY rank DESC
    LIMIT ?
  `, [query, namespaces, query, limit]);

  return rows;
}

async function searchFacts(query, { namespaces, limit = 20, minConfidence = 'medium', pointInTime }) {
  const confidenceRank = { low: 0, medium: 1, high: 2 };
  const minRank = confidenceRank[minConfidence] ?? 1;

  const params = [query, namespaces, query, minRank];
  let temporalFilter = '';
  if (pointInTime) {
    temporalFilter = 'AND valid_from <= ? AND (valid_until IS NULL OR valid_until > ?)';
    params.push(pointInTime, pointInTime);
  }

  params.push(limit);

  const { rows } = await cortexDb.raw(`
    SELECT id, uid, content, category, confidence, importance, namespace, status,
           source_document_ids AS "sourceDocumentIds",
           source_section AS "sourceSection",
           ts_rank(search_vector, plainto_tsquery('english', ?)) as rank
    FROM fact
    WHERE namespace = ANY(?)
      AND status = 'active'
      AND search_vector @@ plainto_tsquery('english', ?)
      AND CASE confidence
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 1
            ELSE 0
          END >= ?
      ${temporalFilter}
    ORDER BY rank DESC
    LIMIT ?
  `, params);

  return rows;
}

export { searchChunks, searchFacts };
