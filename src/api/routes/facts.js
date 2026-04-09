import cortexDb from '../../db/cortex.js';
import { findByUid, getHotFacts, listFacts } from '../../memory/facts/store.js';
import { getEntitiesForFact } from '../../memory/facts/entity-linker.js';
import { getRelationsByFact } from '../../memory/entities/relations.js';
import { AppError } from '../../lib/errors.js';

const listFactsSchema = {
  querystring: {
    type: 'object',
    properties: {
      namespace: { type: 'string' },
      limit: { type: 'integer', default: 50, minimum: 1, maximum: 200 },
      offset: { type: 'integer', default: 0, minimum: 0 },
      category: { type: 'string' },
    },
  },
};

const hotFactsSchema = {
  querystring: {
    type: 'object',
    properties: {
      namespace: { type: 'string' },
      limit: { type: 'integer', default: 10, minimum: 1, maximum: 100 },
      since: { type: 'string' },
    },
  },
};

const factByUidSchema = {
  params: {
    type: 'object',
    required: ['uid'],
    properties: {
      uid: { type: 'string', minLength: 1 },
    },
  },
};

async function handleListFacts(request) {
  const { namespace, limit, offset, category } = request.query;
  const facts = await listFacts({ namespace, limit, offset, category });
  return { facts };
}

async function handleHotFacts(request) {
  const { namespace, limit, since } = request.query;

  const facts = await getHotFacts(namespace, {
    limit,
    since: since ? new Date(since) : undefined,
  });

  return { facts };
}

async function handleGetFact(request) {
  const fact = await findByUid(request.params.uid);
  if (!fact) throw new AppError({ errorCode: 'NOT_FOUND', message: 'Fact not found' });

  const [entities, relations, documents] = await Promise.all([
    getEntitiesForFact(fact.id),
    getRelationsByFact(fact.id),
    fact.sourceDocumentIds?.length
      ? cortexDb('document').whereIn('id', fact.sourceDocumentIds).select('id', 'title', 'sourceType', 'sourcePath')
      : [],
  ]);

  return { fact, entities, relations, sourceDocuments: documents };
}

async function factRoutes(app) {
  app.get('/api/facts', { schema: listFactsSchema }, handleListFacts);
  app.get('/api/facts/hot', { schema: hotFactsSchema }, handleHotFacts);
  app.get('/api/facts/:uid', { schema: factByUidSchema }, handleGetFact);
}

export default factRoutes;
