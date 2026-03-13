import { getStats, listDocuments } from '../../memory/documents/store.js';
import { getEntityCount } from '../../memory/entities/store.js';
import { getRelationCount } from '../../memory/entities/relations.js';
import { getFactCount } from '../../memory/facts/store.js';

async function statusRoutes(app) {
  app.get('/api/status', async (request) => {
    const namespace = request.query.namespace;

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
  });
}

export default statusRoutes;
