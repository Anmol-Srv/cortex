import * as connectionStore from '../../ingestion/connectors/store.js';
import { getConnector, listConnectorTypes } from '../../ingestion/connectors/registry.js';
import { runSync } from '../../ingestion/sync/runner.js';
import * as syncState from '../../ingestion/sync/state.js';
import { AppError } from '../../lib/errors.js';

const uidParam = {
  type: 'object',
  required: ['uid'],
  properties: {
    uid: { type: 'string', minLength: 1 },
  },
};

const connectorTypeParam = {
  type: 'object',
  required: ['type'],
  properties: {
    type: { type: 'string', minLength: 1 },
  },
};

const listConnectionsSchema = {
  querystring: {
    type: 'object',
    properties: {
      namespace: { type: 'string' },
      connectorType: { type: 'string' },
    },
  },
};

const getConnectionSchema = {
  params: uidParam,
};

const createConnectionSchema = {
  body: {
    type: 'object',
    required: ['name', 'connectorType', 'namespace'],
    properties: {
      name: { type: 'string', minLength: 1 },
      connectorType: { type: 'string', minLength: 1 },
      namespace: { type: 'string', minLength: 1 },
      config: { type: 'object', default: {} },
      credentials: { type: 'object', default: {} },
    },
  },
};

const syncSchema = {
  params: uidParam,
  body: {
    type: 'object',
    properties: {
      syncType: { type: 'string', enum: ['full', 'incremental'], default: 'incremental' },
      streams: { type: 'array', items: { type: 'string' } },
    },
  },
};

const syncsListSchema = {
  params: uidParam,
  querystring: {
    type: 'object',
    properties: {
      limit: { type: 'integer', default: 20, minimum: 1, maximum: 200 },
    },
  },
};

const connectorSchemaRoute = {
  params: connectorTypeParam,
};

async function requireConnection(uid) {
  const connection = await connectionStore.findByUid(uid);
  if (!connection) throw new AppError({ errorCode: 'NOT_FOUND', message: 'Connection not found' });
  return connection;
}

function stripCredentials(connection) {
  const { credentialsEncrypted, ...rest } = connection;
  return { ...rest, hasCredentials: !!credentialsEncrypted };
}

async function handleListConnectorTypes() {
  return { connectors: listConnectorTypes() };
}

async function handleGetConnectorSchema(request) {
  try {
    const ConnectorClass = await getConnector(request.params.type);
    return { type: request.params.type, schema: ConnectorClass.configSchema() };
  } catch (err) {
    throw new AppError({ errorCode: 'NOT_FOUND', message: err.message });
  }
}

async function handleListConnections(request) {
  const { namespace, connectorType } = request.query;
  const connections = await connectionStore.listConnections({ namespace, connectorType });
  return { connections: connections.map(stripCredentials) };
}

async function handleGetConnection(request) {
  const connection = await requireConnection(request.params.uid);
  return { connection: stripCredentials(connection) };
}

async function handleCreateConnection(request) {
  const { name, connectorType, config, credentials, namespace } = request.body;

  const connection = await connectionStore.createConnection({
    name,
    connectorType,
    config,
    credentials,
    namespace,
  });

  return { connection: stripCredentials(connection) };
}

async function handleCheckConnection(request) {
  const connection = await requireConnection(request.params.uid);

  const ConnectorClass = await getConnector(connection.connectorType);
  const credentials = connectionStore.getCredentials(connection);
  const connector = new ConnectorClass(connection.config, credentials);

  const result = await connector.check();
  await connectionStore.updateStatus(connection.id, result.ok ? 'connected' : 'error');

  return result;
}

async function handleDiscover(request) {
  const connection = await requireConnection(request.params.uid);

  const ConnectorClass = await getConnector(connection.connectorType);
  const credentials = connectionStore.getCredentials(connection);
  const connector = new ConnectorClass(connection.config, credentials);

  const streams = await connector.discover();
  return { streams };
}

async function handleDeleteConnection(request) {
  const connection = await requireConnection(request.params.uid);

  await connectionStore.deleteConnection(connection.id);
  return { deleted: true, uid: connection.uid };
}

async function handleSync(request) {
  const connection = await requireConnection(request.params.uid);
  const { syncType, streams } = request.body;

  const result = await runSync(connection.id, { syncType, streams });
  return result;
}

async function handleListSyncs(request) {
  const connection = await requireConnection(request.params.uid);
  const { limit } = request.query;

  const runs = await syncState.listSyncRuns(connection.id, { limit });
  return { runs };
}

async function connectionRoutes(app) {
  app.get('/api/connectors', handleListConnectorTypes);
  app.get('/api/connectors/:type/schema', { schema: connectorSchemaRoute }, handleGetConnectorSchema);

  app.get('/api/connections', { schema: listConnectionsSchema }, handleListConnections);
  app.get('/api/connections/:uid', { schema: getConnectionSchema }, handleGetConnection);
  app.post('/api/connections', { schema: createConnectionSchema }, handleCreateConnection);
  app.post('/api/connections/:uid/check', { schema: { params: uidParam } }, handleCheckConnection);
  app.get('/api/connections/:uid/discover', { schema: { params: uidParam } }, handleDiscover);
  app.delete('/api/connections/:uid', { schema: { params: uidParam } }, handleDeleteConnection);
  app.post('/api/connections/:uid/sync', { schema: syncSchema }, handleSync);
  app.get('/api/connections/:uid/syncs', { schema: syncsListSchema }, handleListSyncs);
}

export default connectionRoutes;
