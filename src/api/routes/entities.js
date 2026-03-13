import { searchByName, listByType, findById } from '../../memory/entities/store.js';
import { listRelationsForEntity } from '../../memory/entities/relations.js';
import { getFactsForEntity } from '../../memory/facts/entity-linker.js';
import { getEntityNeighborhood, findPath, findRelated } from '../../memory/entities/traversal.js';

async function entityRoutes(app) {
  app.get('/api/entities', async (request) => {
    const { query, entityType, namespace, limit = 20 } = request.query;

    if (!query && !entityType) {
      return { error: 'Provide query or entityType parameter' };
    }

    const results = query
      ? await searchByName(query, { entityType, namespace, limit: Number(limit) })
      : await listByType(entityType, { namespace, limit: Number(limit) });

    return { entities: results };
  });

  app.get('/api/entities/:id', async (request, reply) => {
    const entity = await findById(Number(request.params.id));
    if (!entity) return reply.code(404).send({ error: 'Entity not found' });

    const [relations, facts] = await Promise.all([
      listRelationsForEntity(entity.id, { limit: 50 }),
      getFactsForEntity(entity.id, { limit: 20 }),
    ]);

    return { entity, relations, facts };
  });

  app.get('/api/entities/:id/neighbors', async (request, reply) => {
    const { depth = 1, limit = 50 } = request.query;
    const entity = await findById(Number(request.params.id));
    if (!entity) return reply.code(404).send({ error: 'Entity not found' });

    const result = await getEntityNeighborhood(entity.id, {
      depth: Math.min(Number(depth), 3),
      limit: Number(limit),
    });

    return result;
  });

  app.get('/api/entities/:id/related', async (request, reply) => {
    const { maxDepth = 2, relationType, limit = 30 } = request.query;
    const entity = await findById(Number(request.params.id));
    if (!entity) return reply.code(404).send({ error: 'Entity not found' });

    const related = await findRelated(entity.id, {
      maxDepth: Math.min(Number(maxDepth), 3),
      relationType,
      limit: Number(limit),
    });

    return { entity, related };
  });

  app.get('/api/graph/path', async (request) => {
    const { from, to, maxDepth = 4 } = request.query;

    if (!from || !to) {
      return { error: 'from and to parameters are required (entity IDs)' };
    }

    const result = await findPath(Number(from), Number(to), {
      maxDepth: Math.min(Number(maxDepth), 4),
    });

    if (!result) return { path: null, message: 'No path found' };
    return result;
  });
}

export default entityRoutes;
