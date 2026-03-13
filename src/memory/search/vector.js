import cortexDb from '../../db/cortex.js';

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

async function searchFacts(embedding, { namespaces, limit = 20, minConfidence = 'medium' }) {
  const vec = `[${embedding.join(',')}]`;
  const confidenceRank = { low: 0, medium: 1, high: 2 };
  const minRank = confidenceRank[minConfidence] ?? 1;

  const { rows } = await cortexDb.raw(`
    SELECT id, uid, content, category, confidence, namespace, status,
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
    ORDER BY embedding <=> ?
    LIMIT ?
  `, [vec, namespaces, minRank, vec, limit]);

  return rows;
}

export { searchChunks, searchFacts };
