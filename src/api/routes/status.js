import { getStats } from '../../memory/documents/store.js';
import { getEntityCount } from '../../memory/entities/store.js';
import { getRelationCount } from '../../memory/entities/relations.js';
import { getFactCount } from '../../memory/facts/store.js';
import cortexDb from '../../db/cortex.js';

const statusSchema = {
  querystring: {
    type: 'object',
    properties: {
      namespace: { type: 'string' },
    },
  },
};

async function handleStatus(request) {
  const { namespace } = request.query;

  const [docStats, factCount, documents, people, topics, relations] = await Promise.all([
    getStats(namespace),
    getFactCount(namespace),
    getEntityCount('document'),
    getEntityCount('person'),
    getEntityCount('topic'),
    getRelationCount(),
  ]);

  return {
    namespace: namespace || 'all',
    documents: docStats.documentCount,
    chunks: docStats.totalChunks,
    facts: factCount,
    entities: { documents, people, topics },
    relations,
  };
}

async function handleReset() {
  const tables = ['fact_entity', 'history', 'relation', 'fact', 'chunk', 'entity', 'document'];
  for (const table of tables) {
    await cortexDb(table).del();
  }
  return { success: true, message: 'All data cleared' };
}

async function statusRoutes(app) {
  app.get('/api/status', { schema: statusSchema }, handleStatus);
  app.post('/api/reset', handleReset);
}

export default statusRoutes;
