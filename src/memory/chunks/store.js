import cortexDb from '../../db/cortex.js';

async function insertChunks(documentId, chunks, namespace) {
  // Delete existing chunks for this document (re-ingestion)
  await cortexDb('chunk').where({ documentId }).del();

  if (!chunks.length) return [];

  const rows = chunks.map((chunk, i) => ({
    documentId,
    chunkIndex: i,
    content: chunk.content,
    sectionHeading: chunk.sectionHeading || null,
    namespace,
    embedding: chunk.embedding ? pgVector(chunk.embedding) : null,
  }));

  const inserted = await cortexDb('chunk')
    .insert(rows)
    .returning('*');

  // Update tsvector search_vector
  await cortexDb.raw(`
    UPDATE chunk
    SET search_vector = to_tsvector('english', content)
    WHERE document_id = ?
  `, [documentId]);

  return inserted;
}

async function deleteByDocument(documentId) {
  return cortexDb('chunk').where({ documentId }).del();
}

function pgVector(arr) {
  return `[${arr.join(',')}]`;
}

export { insertChunks, deleteByDocument };
