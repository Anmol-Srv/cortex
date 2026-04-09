import Fastify from 'fastify';
import cors from '@fastify/cors';

import config from './config.js';
import errorHandler from './api/plugins/error-handler.js';
import ingestRoutes from './api/routes/ingest.js';
import searchRoutes from './api/routes/search.js';
import entityRoutes from './api/routes/entities.js';
import factRoutes from './api/routes/facts.js';
import statusRoutes from './api/routes/status.js';
import documentRoutes from './api/routes/documents.js';
import chatRoutes from './api/routes/chat.js';

function buildApp() {
  const app = Fastify({
    logger: {
      level: config.server.logLevel,
    },
    ajv: {
      customOptions: { removeAdditional: 'all', coerceTypes: true },
    },
  });

  app.register(cors, { origin: true });
  app.register(errorHandler);

  app.get('/health', async () => ({ status: 'ok' }));

  app.register(ingestRoutes);
  app.register(searchRoutes);
  app.register(entityRoutes);
  app.register(factRoutes);
  app.register(statusRoutes);
  app.register(documentRoutes);
  app.register(chatRoutes);

  return app;
}

export default buildApp;
