import * as connectionStore from '../../ingestion/connectors/store.js';
import { getConnector, listConnectorTypes } from '../../ingestion/connectors/registry.js';
import { runSync } from '../../ingestion/sync/runner.js';
import * as syncState from '../../ingestion/sync/state.js';

async function connectionRoutes(app) {
  // List available connector types
  app.get('/api/connectors', async () => {
    return { connectors: listConnectorTypes() };
  });

  // Get connector config schema
  app.get('/api/connectors/:type/schema', async (request, reply) => {
    try {
      const ConnectorClass = await getConnector(request.params.type);
      return { type: request.params.type, schema: ConnectorClass.configSchema() };
    } catch (err) {
      return reply.code(404).send({ error: err.message });
    }
  });

  // List connections
  app.get('/api/connections', async (request) => {
    const { namespace, connectorType } = request.query;
    const connections = await connectionStore.listConnections({ namespace, connectorType });
    // Strip encrypted credentials from response
    return {
      connections: connections.map(stripCredentials),
    };
  });

  // Get connection detail
  app.get('/api/connections/:uid', async (request, reply) => {
    const connection = await connectionStore.findByUid(request.params.uid);
    if (!connection) return reply.code(404).send({ error: 'Connection not found' });
    return { connection: stripCredentials(connection) };
  });

  // Create connection
  app.post('/api/connections', async (request, reply) => {
    const { name, connectorType, config, credentials, namespace } = request.body || {};

    if (!name || !connectorType || !namespace) {
      return reply.code(400).send({ error: 'name, connectorType, and namespace are required' });
    }

    const connection = await connectionStore.createConnection({
      name,
      connectorType,
      config: config || {},
      credentials: credentials || {},
      namespace,
    });

    return { connection: stripCredentials(connection) };
  });

  // Test connection
  app.post('/api/connections/:uid/check', async (request, reply) => {
    const connection = await connectionStore.findByUid(request.params.uid);
    if (!connection) return reply.code(404).send({ error: 'Connection not found' });

    const ConnectorClass = await getConnector(connection.connectorType);
    const credentials = connectionStore.getCredentials(connection);
    const connector = new ConnectorClass(connection.config, credentials);

    const result = await connector.check();
    await connectionStore.updateStatus(connection.id, result.ok ? 'connected' : 'error');

    return result;
  });

  // Discover streams/tables
  app.get('/api/connections/:uid/discover', async (request, reply) => {
    const connection = await connectionStore.findByUid(request.params.uid);
    if (!connection) return reply.code(404).send({ error: 'Connection not found' });

    const ConnectorClass = await getConnector(connection.connectorType);
    const credentials = connectionStore.getCredentials(connection);
    const connector = new ConnectorClass(connection.config, credentials);

    const streams = await connector.discover();
    return { streams };
  });

  // Delete connection
  app.delete('/api/connections/:uid', async (request, reply) => {
    const connection = await connectionStore.findByUid(request.params.uid);
    if (!connection) return reply.code(404).send({ error: 'Connection not found' });

    await connectionStore.deleteConnection(connection.id);
    return { deleted: true, uid: connection.uid };
  });

  // Trigger sync
  app.post('/api/connections/:uid/sync', async (request, reply) => {
    const connection = await connectionStore.findByUid(request.params.uid);
    if (!connection) return reply.code(404).send({ error: 'Connection not found' });

    const { syncType = 'incremental', streams } = request.body || {};

    const result = await runSync(connection.id, { syncType, streams });
    return result;
  });

  // List sync runs for a connection
  app.get('/api/connections/:uid/syncs', async (request, reply) => {
    const connection = await connectionStore.findByUid(request.params.uid);
    if (!connection) return reply.code(404).send({ error: 'Connection not found' });

    const { limit = 20 } = request.query;
    const runs = await syncState.listSyncRuns(connection.id, { limit: Number(limit) });
    return { runs };
  });
}

function stripCredentials(connection) {
  const { credentialsEncrypted, ...rest } = connection;
  return { ...rest, hasCredentials: !!credentialsEncrypted };
}

export default connectionRoutes;
