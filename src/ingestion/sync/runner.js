import { getConnector } from '../connectors/registry.js';
import * as connectionStore from '../connectors/store.js';
import * as syncState from './state.js';
import { ingestDocument } from '../pipeline.js';

/**
 * Run a sync for a connection. Instantiates the connector, reads records,
 * and feeds each one through the ingestion pipeline.
 *
 * @param {number} connectionId
 * @param {{ syncType?: 'full'|'incremental', streams?: string[] }} options
 */
async function runSync(connectionId, { syncType = 'incremental', streams } = {}) {
  const connection = await connectionStore.findById(connectionId);
  if (!connection) throw new Error(`Connection ${connectionId} not found`);

  const ConnectorClass = await getConnector(connection.connectorType);
  const credentials = connectionStore.getCredentials(connection);
  const connector = new ConnectorClass(connection.config, credentials);

  // Get state from last completed run (null for full sync)
  const lastRun = await syncState.getLastCompletedRun(connectionId);
  const state = syncType === 'full' ? null : lastRun?.stateAfter || null;

  const run = await syncState.createSyncRun({
    connectionId,
    pipelineType: connection.connectorType,
    syncType,
    stateBefore: state,
  });

  console.log(`[sync] Starting ${syncType} sync for ${connection.name} (${run.uid})`);

  try {
    let currentState = state;
    let recordsRead = 0;
    let recordsWritten = 0;

    for await (const message of connector.read(currentState, { syncType, streams })) {
      // State checkpoint
      if (message.state) {
        currentState = message.state;
        continue;
      }

      recordsRead++;

      // Transform record into a document for the ingestion pipeline
      const doc = connector.toDocument
        ? connector.toDocument(message.stream, message.record, connection)
        : defaultToDocument(message.stream, message.record, connection);

      const result = await ingestDocument({
        content: doc.content,
        title: doc.title,
        sourcePath: doc.sourcePath,
        sourceType: doc.sourceType || connection.connectorType,
        contentType: doc.contentType,
        namespace: connection.namespace,
        metadata: doc.metadata,
        skipFacts: doc.skipFacts ?? false,
        skipEntities: doc.skipEntities ?? false,
        skipMarkdown: doc.skipMarkdown ?? false,
      });

      if (!result.skipped) recordsWritten++;

      if (recordsRead % 50 === 0) {
        console.log(`[sync] ${run.uid}: ${recordsRead} records read, ${recordsWritten} written`);
      }
    }

    await syncState.completeSyncRun(run.id, {
      stateAfter: currentState,
      recordsRead,
      recordsWritten,
    });

    console.log(`[sync] Completed ${run.uid}: ${recordsRead} read, ${recordsWritten} written`);

    return {
      syncRunId: run.id,
      syncRunUid: run.uid,
      status: 'completed',
      recordsRead,
      recordsWritten,
    };
  } catch (err) {
    await syncState.failSyncRun(run.id, err.message);
    console.error(`[sync] Failed ${run.uid}: ${err.message}`);
    throw err;
  }
}

function defaultToDocument(stream, record, connection) {
  const content = typeof record === 'string' ? record : JSON.stringify(record, null, 2);
  return {
    content,
    title: `${connection.name}/${stream}`,
    sourcePath: `${connection.connectorType}://${connection.uid}/${stream}/${Date.now()}`,
    sourceType: connection.connectorType,
    contentType: 'application/json',
    metadata: { connectionId: connection.id, stream },
  };
}

export { runSync };
