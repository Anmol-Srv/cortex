import { search } from '../../memory/search/hybrid.js';
import config from '../../config.js';

async function searchRoutes(app) {
  app.get('/api/search', async (request) => {
    const { query, limit = 10, minConfidence = 'medium', useGraph = true, namespaces } = request.query;

    if (!query) {
      return { error: 'query parameter is required' };
    }

    const ns = namespaces
      ? namespaces.split(',')
      : request.namespaces || [config.defaults.namespace];

    const { facts, chunks } = await search(query, {
      namespaces: ns,
      limit: Number(limit),
      minConfidence,
      useGraph: useGraph !== 'false',
    });

    return { query, facts, chunks };
  });
}

export default searchRoutes;
