import { AppError } from '../../lib/errors.js';

const CONNECTOR_REGISTRY = {
  postgres: {
    name: 'PostgreSQL',
    module: () => import('./database/postgres.js'),
  },
};

async function getConnector(type) {
  const entry = CONNECTOR_REGISTRY[type];
  if (!entry) {
    throw new AppError({ errorCode: 'NOT_FOUND', message: `No connector registered for type: ${type}` });
  }
  const mod = await entry.module();
  return mod.default;
}

function listConnectorTypes() {
  return Object.entries(CONNECTOR_REGISTRY).map(([type, entry]) => ({
    type,
    name: entry.name,
  }));
}

export { getConnector, listConnectorTypes, CONNECTOR_REGISTRY };
