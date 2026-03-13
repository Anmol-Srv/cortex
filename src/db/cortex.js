import knex from 'knex';

import config from '../config.js';

const cortexDb = knex({
  client: 'pg',
  connection: {
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
  },
  pool: { min: 2, max: 10 },
  postProcessResponse(result) {
    // snake_case → camelCase for JS consumption
    if (Array.isArray(result)) return result.map(toCamel);
    if (result && typeof result === 'object') return toCamel(result);
    return result;
  },
  wrapIdentifier(value, origImpl) {
    // camelCase → snake_case for SQL
    return origImpl(toSnake(value));
  },
});

function toCamel(obj) {
  if (!obj || typeof obj !== 'object' || obj instanceof Date) return obj;
  if (Array.isArray(obj)) return obj.map(toCamel);
  const out = {};
  for (const [key, val] of Object.entries(obj)) {
    out[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = val;
  }
  return out;
}

function toSnake(str) {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export default cortexDb;
