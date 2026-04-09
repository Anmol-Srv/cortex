import { nanoid } from 'nanoid';

import cortexDb from '../../db/cortex.js';
import { encryptJson, decryptJson } from '../../lib/crypto.js';

async function createConnection({ name, connectorType, config, credentials, namespace }) {
  const uid = `conn-${nanoid(16)}`;
  const credentialsEncrypted = credentials ? encryptJson(credentials) : null;

  const [row] = await cortexDb('connection')
    .insert({
      uid,
      name,
      connectorType,
      config: JSON.stringify(config || {}),
      credentialsEncrypted,
      namespace,
      status: 'pending',
    })
    .returning('*');

  return row;
}

async function findById(id) {
  return cortexDb('connection').where({ id }).first();
}

async function findByUid(uid) {
  return cortexDb('connection').where({ uid }).first();
}

async function listConnections({ namespace, connectorType } = {}) {
  const query = cortexDb('connection').orderBy('createdAt', 'desc');
  if (namespace) query.where({ namespace });
  if (connectorType) query.where({ connectorType });
  return query;
}

async function updateStatus(id, status) {
  await cortexDb('connection').where({ id }).update({ status, lastCheckAt: cortexDb.fn.now() });
}

async function deleteConnection(id) {
  await cortexDb('connection').where({ id }).del();
}

function getCredentials(connection) {
  if (!connection.credentialsEncrypted) return {};
  return decryptJson(connection.credentialsEncrypted);
}

async function updateConnection(id, { name, config, credentials }) {
  const updates = {};
  if (name) updates.name = name;
  if (config) updates.config = JSON.stringify(config);
  if (credentials) updates.credentialsEncrypted = encryptJson(credentials);
  await cortexDb('connection').where({ id }).update(updates);
}

export {
  createConnection,
  findById,
  findByUid,
  listConnections,
  updateStatus,
  deleteConnection,
  getCredentials,
  updateConnection,
};
