import cortexDb from '../../db/cortex.js';
import { findByUid, getHotFacts } from '../../memory/facts/store.js';
import { getEntitiesForFact } from '../../memory/facts/entity-linker.js';
import { getRelationsByFact } from '../../memory/entities/relations.js';

async function factRoutes(app) {
  app.get('/api/facts/hot', async (request) => {
    const { namespace, limit, since } = request.query;
    const facts = await getHotFacts(namespace, {
      limit: limit ? Number(limit) : 10,
      since: since ? new Date(since) : undefined,
    });
    return { facts };
  });

  app.get('/api/facts/:uid', async (request, reply) => {
    const fact = await findByUid(request.params.uid);
    if (!fact) return reply.code(404).send({ error: 'Fact not found' });

    const [entities, relations, documents] = await Promise.all([
      getEntitiesForFact(fact.id),
      getRelationsByFact(fact.id),
      fact.sourceDocumentIds?.length
        ? cortexDb('document').whereIn('id', fact.sourceDocumentIds).select('id', 'title', 'sourceType', 'sourcePath')
        : [],
    ]);

    return { fact, entities, relations, sourceDocuments: documents };
  });
}

export default factRoutes;
