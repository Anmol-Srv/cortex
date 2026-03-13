import { randomUUID } from 'node:crypto';

import cortexDb from '../../db/cortex.js';

async function findBySourcePath(sourcePath) {
  const [doc] = await cortexDb('document').where({ sourcePath });
  return doc || null;
}

async function findByUid(uid) {
  const [doc] = await cortexDb('document').where({ uid });
  return doc || null;
}

async function upsert({ sourcePath, sourceType, title, contentHash, namespace }) {
  const existing = await findBySourcePath(sourcePath);

  if (existing) {
    if (existing.contentHash === contentHash) return { doc: existing, changed: false };

    await cortexDb('document')
      .where({ id: existing.id })
      .update({ contentHash, title, lastIngestedAt: cortexDb.fn.now() });

    const [updated] = await cortexDb('document').where({ id: existing.id });
    return { doc: updated, changed: true };
  }

  const uid = `doc-${randomUUID().slice(0, 8)}`;
  const [doc] = await cortexDb('document')
    .insert({ uid, sourcePath, sourceType, title, contentHash, namespace, lastIngestedAt: cortexDb.fn.now() })
    .returning('*');

  return { doc, changed: true };
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

export { findBySourcePath, findByUid, upsert, updateCounts, getStats, listDocuments, deleteDocument };
