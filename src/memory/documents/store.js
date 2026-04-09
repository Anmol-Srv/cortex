import { nanoid } from 'nanoid';

import cortexDb from '../../db/cortex.js';

async function findBySourcePath(sourcePath) {
  const [doc] = await cortexDb('document').where({ sourcePath });
  return doc || null;
}

async function findByUid(uid) {
  const [doc] = await cortexDb('document').where({ uid });
  return doc || null;
}

async function upsert({ sourcePath, sourceType, title = null, contentHash, namespace }) {
  const uid = `doc-${nanoid(16)}`;

  const { rows: [doc] } = await cortexDb.raw(`
    INSERT INTO document (uid, source_path, source_type, title, content_hash, namespace, last_ingested_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
    ON CONFLICT (source_path) DO UPDATE SET
      title = EXCLUDED.title,
      content_hash = EXCLUDED.content_hash,
      last_ingested_at = NOW(),
      updated_at = NOW()
    RETURNING *, (xmax = 0) AS "isNew", content_hash != ? AS "contentChanged"
  `, [uid, sourcePath, sourceType, title, contentHash, namespace, contentHash]);

  const isNew = doc.isNew;
  const changed = isNew || doc.contentChanged;

  return { doc, changed };
}

async function updateCounts(documentId, { chunkCount, factCount }) {
  await cortexDb('document')
    .where({ id: documentId })
    .update({ chunkCount, factCount });
}

async function getStats(namespace) {
  const query = cortexDb('document');
  if (namespace) query.where({ namespace });

  const docs = await query;
  return {
    documentCount: docs.length,
    totalChunks: docs.reduce((sum, d) => sum + (d.chunkCount || 0), 0),
    totalFacts: docs.reduce((sum, d) => sum + (d.factCount || 0), 0),
  };
}

async function listDocuments({ namespace, sourceType, limit = 100 } = {}) {
  const query = cortexDb('document').orderBy('createdAt', 'desc').limit(limit);
  if (namespace) query.where({ namespace });
  if (sourceType) query.where({ sourceType });
  return query;
}

async function deleteDocument(documentId) {
  await cortexDb('chunk').where({ documentId }).del();
  await cortexDb('document').where({ id: documentId }).del();
}

async function resetHash(documentId) {
  await cortexDb('document')
    .where({ id: documentId })
    .update({ contentHash: null });
}

export { findBySourcePath, findByUid, upsert, updateCounts, resetHash, getStats, listDocuments, deleteDocument };
