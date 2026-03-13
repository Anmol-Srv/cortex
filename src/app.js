import Fastify from 'fastify';

import config from './config.js';
import { authPlugin } from './api/auth.js';
import ingestRoutes from './api/routes/ingest.js';
import searchRoutes from './api/routes/search.js';
import entityRoutes from './api/routes/entities.js';
import factRoutes from './api/routes/facts.js';
import statusRoutes from './api/routes/status.js';
import documentRoutes from './api/routes/documents.js';

function buildApp() {
  const app = Fastify({
    logger: {
      level: config.server.logLevel,
    },
  });

  app.get('/health', async () => ({ status: 'ok' }));

  app.register(authPlugin);
  app.register(ingestRoutes);
  app.register(searchRoutes);
  app.register(entityRoutes);
  app.register(factRoutes);
  app.register(statusRoutes);
  app.register(documentRoutes);

  return app;
}

export default buildApp;
