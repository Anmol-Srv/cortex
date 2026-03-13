import knex from 'knex';
import { groupBy } from 'lodash-es';

import { SourceConnector } from '../base.js';

class PostgresSource extends SourceConnector {
  static configSchema() {
    return {
      type: 'object',
      properties: {
        host: { type: 'string', description: 'Database host' },
        port: { type: 'number', default: 5432, description: 'Database port' },
        database: { type: 'string', description: 'Database name' },
        schemas: {
          type: 'array',
          items: { type: 'string' },
          default: ['public'],
          description: 'Schemas to expose for discovery',
        },
        queries: {
          type: 'array',
          description: 'Named queries to execute during sync',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Stream name for this query' },
              sql: { type: 'string', description: 'SELECT query to execute' },
              cursorField: { type: 'string', description: 'Column for incremental sync (timestamp or auto-increment)' },
              title: { type: 'string', description: 'Template for document title. Use {{column}} for interpolation.' },
              rowLimit: { type: 'number', default: 10000, description: 'Max rows per query' },
            },
            required: ['name', 'sql'],
          },
        },
      },
      required: ['host', 'database'],
      credentials: {
        type: 'object',
        properties: {
          user: { type: 'string' },
          password: { type: 'string', secret: true },
        },
        required: ['user', 'password'],
      },
    };
  }

  async check() {
    const db = this.#createConnection();
    try {
      await db.raw('SELECT 1');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      await db.destroy();
    }
  }

  async discover() {
    const db = this.#createConnection();
    try {
      const schemas = this.config.schemas || ['public'];
      const { rows } = await db.raw(
        `SELECT table_schema, table_name, column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = ANY(?)
         ORDER BY table_schema, table_name, ordinal_position`,
        [schemas],
      );

      const tables = groupBy(rows, 'table_name');

      return Object.entries(tables).map(([tableName, cols]) => ({
        name: tableName,
        schema: {
          type: 'object',
          properties: Object.fromEntries(
            cols.map((c) => [c.column_name, {
              type: pgTypeToJsonType(c.data_type),
              nullable: c.is_nullable === 'YES',
            }]),
          ),
        },
        supportedSyncModes: ['full_refresh', 'incremental'],
      }));
    } finally {
      await db.destroy();
    }
  }

  async *read(state, options) {
    const db = this.#createConnection();
    const queries = this.config.queries || [];

    if (!queries.length) {
      await db.destroy();
      return;
    }

    try {
      for (const queryDef of queries) {
        const { name, sql, cursorField, rowLimit = 10000 } = queryDef;

        // Skip if streams filter is set and this query isn't in it
        if (options.streams?.length && !options.streams.includes(name)) continue;

        const cursorValue = state?.[name]?.cursor ?? null;

        // Build the query with safety guardrails
        let finalSql;
        let params;

        if (options.syncType === 'incremental' && cursorField && cursorValue) {
          finalSql = `SELECT * FROM (${sql}) AS _q WHERE "${cursorField}" > ? ORDER BY "${cursorField}" LIMIT ${Number(rowLimit)}`;
          params = [cursorValue];
        } else {
          finalSql = `SELECT * FROM (${sql}) AS _q LIMIT ${Number(rowLimit)}`;
          params = [];
        }

        await db.raw('SET LOCAL statement_timeout = \'30s\'');
        await db.raw('SET LOCAL default_transaction_read_only = true');

        const { rows } = await db.raw(finalSql, params);

        console.log(`[postgres] ${name}: ${rows.length} rows`);

        let maxCursor = cursorValue;

        for (const row of rows) {
          yield { stream: name, record: row };

          if (cursorField && row[cursorField] != null) {
            const val = row[cursorField];
            if (maxCursor == null || val > maxCursor) {
              maxCursor = val;
            }
          }
        }

        // Checkpoint per query
        yield {
          state: {
            ...state,
            [name]: { cursor: maxCursor, lastRowCount: rows.length },
          },
        };
      }
    } finally {
      await db.destroy();
    }
  }

  /**
   * Transform a database row into a document for the ingestion pipeline.
   * Connectors can override this to customize how records become documents.
   */
  toDocument(stream, record, connection) {
    const queryDef = (this.config.queries || []).find((q) => q.name === stream);
    const title = queryDef?.title
      ? interpolateTitle(queryDef.title, record)
      : `${connection.name}/${stream}`;

    // Render the row as readable key-value text
    const content = renderRow(record);

    return {
      content,
      title,
      sourcePath: `postgres://${connection.uid}/${stream}/${recordId(record)}`,
      sourceType: 'database',
      contentType: 'text/plain',
      metadata: { connectionId: connection.id, stream, connectorType: 'postgres' },
    };
  }

  #createConnection() {
    return knex({
      client: 'pg',
      connection: {
        host: this.config.host,
        port: this.config.port || 5432,
        database: this.config.database,
        user: this.credentials.user,
        password: this.credentials.password,
      },
      pool: { min: 0, max: 3 },
    });
  }
}

function renderRow(record) {
  return Object.entries(record)
    .map(([key, value]) => {
      if (value == null) return `${key}: (empty)`;
      if (typeof value === 'object') return `${key}: ${JSON.stringify(value)}`;
      return `${key}: ${value}`;
    })
    .join('\n');
}

function interpolateTitle(template, record) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => record[key] ?? key);
}

function recordId(record) {
  return record.id || record.uid || record.uuid || Date.now();
}

function pgTypeToJsonType(pgType) {
  const map = {
    integer: 'number', bigint: 'number', smallint: 'number',
    numeric: 'number', real: 'number', 'double precision': 'number',
    boolean: 'boolean',
    json: 'object', jsonb: 'object',
    'ARRAY': 'array',
  };
  return map[pgType] || 'string';
}

export default PostgresSource;
