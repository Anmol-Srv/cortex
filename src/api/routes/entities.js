import { searchByName, listByType, findById } from '../../memory/entities/store.js';
import { listRelationsForEntity } from '../../memory/entities/relations.js';
import { getFactsForEntity } from '../../memory/facts/entity-linker.js';
import { getEntityNeighborhood, findPath, findRelated } from '../../memory/entities/traversal.js';
import { AppError } from '../../lib/errors.js';

const idParam = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'integer' },
  },
};

const listEntitiesSchema = {
  querystring: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      entityType: { type: 'string' },
      namespace: { type: 'string' },
      limit: { type: 'integer', default: 20, minimum: 1, maximum: 200 },
    },
  },
};

const getEntitySchema = {
  params: idParam,
};

const neighborsSchema = {
  params: idParam,
  querystring: {
    type: 'object',
    properties: {
      depth: { type: 'integer', default: 1, minimum: 1, maximum: 3 },
      limit: { type: 'integer', default: 50, minimum: 1, maximum: 200 },
    },
  },
};

const relatedSchema = {
  params: idParam,
  querystring: {
    type: 'object',
    properties: {
      maxDepth: { type: 'integer', default: 2, minimum: 1, maximum: 3 },
      relationType: { type: 'string' },
      limit: { type: 'integer', default: 30, minimum: 1, maximum: 200 },
    },
  },
};

const graphPathSchema = {
  querystring: {
    type: 'object',
    required: ['from', 'to'],
    properties: {
      from: { type: 'integer' },
      to: { type: 'integer' },
      maxDepth: { type: 'integer', default: 4, minimum: 1, maximum: 4 },
    },
  },
};

async function requireEntity(id) {
  const entity = await findById(id);
  if (!entity) throw new AppError({ errorCode: 'NOT_FOUND', message: 'Entity not found' });
  return entity;
}

async function handleListEntities(request) {
  const { query, entityType, namespace, limit } = request.query;

  if (!query && !entityType) {
    throw new AppError({ errorCode: 'BAD_REQUEST', message: 'Provide query or entityType parameter' });
  }

  const results = query
    ? await searchByName(query, { entityType, namespace, limit })
    : await listByType(entityType, { namespace, limit });

  return { entities: results };
}

async function handleGetEntity(request) {
  const entity = await requireEntity(request.params.id);

  const [relations, facts] = await Promise.all([
    listRelationsForEntity(entity.id, { limit: 50 }),
    getFactsForEntity(entity.id, { limit: 20 }),
  ]);

  return { entity, relations, facts };
}

async function handleNeighbors(request) {
  const entity = await requireEntity(request.params.id);
  const { depth, limit } = request.query;

  const result = await getEntityNeighborhood(entity.id, { depth, limit });
  return result;
}

async function handleRelated(request) {
  const entity = await requireEntity(request.params.id);
  const { maxDepth, relationType, limit } = request.query;

  const related = await findRelated(entity.id, { maxDepth, relationType, limit });
  return { entity, related };
}

async function handleGraphPath(request) {
  const { from, to, maxDepth } = request.query;

  const result = await findPath(from, to, { maxDepth });
  if (!result) return { path: null, message: 'No path found' };
  return result;
}

async function entityRoutes(app) {
  app.get('/api/entities', { schema: listEntitiesSchema }, handleListEntities);
  app.get('/api/entities/:id', { schema: getEntitySchema }, handleGetEntity);
  app.get('/api/entities/:id/neighbors', { schema: neighborsSchema }, handleNeighbors);
  app.get('/api/entities/:id/related', { schema: relatedSchema }, handleRelated);
  app.get('/api/graph/path', { schema: graphPathSchema }, handleGraphPath);
}

export default entityRoutes;
