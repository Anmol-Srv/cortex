import { nanoid } from 'nanoid';

import cortexDb from '../../db/cortex.js';

async function createSyncRun({ connectionId, pipelineType, syncType, stateBefore }) {
  const uid = `sync-${nanoid(16)}`;

  const [row] = await cortexDb('sync_run')
    .insert({
      uid,
      connectionId,
      pipelineType,
      syncType,
      status: 'running',
      stateBefore: stateBefore ? JSON.stringify(stateBefore) : null,
      startedAt: cortexDb.fn.now(),
    })
    .returning('*');

  return row;
}

async function completeSyncRun(id, { stateAfter, recordsRead, recordsWritten }) {
  await cortexDb('sync_run').where({ id }).update({
    status: 'completed',
    stateAfter: stateAfter ? JSON.stringify(stateAfter) : null,
    recordsRead: recordsRead || 0,
    recordsWritten: recordsWritten || 0,
    completedAt: cortexDb.fn.now(),
  });
}

async function failSyncRun(id, errorMessage) {
  await cortexDb('sync_run').where({ id }).update({
    status: 'failed',
    errorMessage,
    completedAt: cortexDb.fn.now(),
  });
}

async function getLastCompletedRun(connectionId) {
  return cortexDb('sync_run')
    .where({ connectionId, status: 'completed' })
    .orderBy('completedAt', 'desc')
    .first();
}

async function listSyncRuns(connectionId, { limit = 20 } = {}) {
  return cortexDb('sync_run')
    .where({ connectionId })
    .orderBy('createdAt', 'desc')
    .limit(limit);
}

async function findSyncRunByUid(uid) {
  return cortexDb('sync_run').where({ uid }).first();
}

export {
  createSyncRun,
  completeSyncRun,
  failSyncRun,
  getLastCompletedRun,
  listSyncRuns,
  findSyncRunByUid,
};
