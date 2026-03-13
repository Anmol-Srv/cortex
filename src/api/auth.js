import { createHash } from 'node:crypto';

import cortexDb from '../db/cortex.js';
import config from '../config.js';

function hashKey(key) {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Fastify plugin that adds API key authentication.
 *
 * Checks the Authorization header for a Bearer token,
 * looks up the key hash in the api_key table, and decorates
 * the request with `apiKey` (the row) and `namespaces` (allowed namespaces).
 *
 * If no api_key rows exist in the DB, auth is bypassed (open mode for dev).
 */
async function authPlugin(app) {
  app.decorateRequest('apiKey', null);
  app.decorateRequest('namespaces', null);

  app.addHook('onRequest', async (request, reply) => {
    // Health check is always open
    if (request.url === '/health') return;

    // Check if any keys exist — if not, bypass auth (dev mode)
    const [{ count }] = await cortexDb('api_key').count('id as count');
    if (Number(count) === 0) {
      request.namespaces = [config.defaults.namespace];
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'Missing API key. Use Authorization: Bearer <key>' });
      return;
    }

    const token = authHeader.slice(7);
    const hash = hashKey(token);

    const row = await cortexDb('api_key')
      .where({ keyHash: hash, active: true })
      .first();

    if (!row) {
      reply.code(401).send({ error: 'Invalid or inactive API key' });
      return;
    }

    request.apiKey = row;
    request.namespaces = row.namespaces?.length ? row.namespaces : [config.defaults.namespace];
  });
}

/**
 * Create a new API key. Returns the raw key (only shown once).
 */
async function createApiKey({ name, namespaces = [], role = 'reader' }) {
  const raw = `ctx_${randomHex(32)}`;
  const keyHash = hashKey(raw);

  const [row] = await cortexDb('api_key')
    .insert({ keyHash, name, namespaces, role })
    .returning('*');

  return { key: raw, id: row.id, name: row.name, namespaces: row.namespaces, role: row.role };
}

async function listApiKeys() {
  return cortexDb('api_key')
    .select('id', 'name', 'namespaces', 'role', 'active', 'createdAt')
    .orderBy('createdAt', 'desc');
}

async function revokeApiKey(id) {
  await cortexDb('api_key').where({ id }).update({ active: false });
}

function randomHex(length) {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export { authPlugin, createApiKey, listApiKeys, revokeApiKey };
