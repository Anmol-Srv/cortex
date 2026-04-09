import { search } from '../../memory/search/hybrid.js';
import config from '../../config.js';

const searchSchema = {
  querystring: {
    type: 'object',
    required: ['query'],
    properties: {
      query: { type: 'string', minLength: 1 },
      limit: { type: 'integer', default: 10, minimum: 1, maximum: 100 },
      minConfidence: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' },
      useGraph: { type: 'boolean', default: true },
      expand: { type: 'boolean', default: false },
      namespaces: { type: 'string' },
    },
  },
};

async function handleSearch(request) {
  const { query, limit, minConfidence, useGraph, expand, namespaces } = request.query;

  const ns = namespaces
    ? namespaces.split(',')
    : [config.defaults.namespace];

  const { facts, chunks } = await search(query, {
    namespaces: ns,
    limit,
    minConfidence,
    useGraph,
    expand,
  });

  return { query, facts, chunks };
}

async function searchRoutes(app) {
  app.get('/api/search', { schema: searchSchema }, handleSearch);
}

export default searchRoutes;
