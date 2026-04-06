import 'dotenv/config';

import buildApp from './app.js';
import config from './config.js';
import cortexDb from './db/cortex.js';
import { startMcp } from './mcp/server.js';

const mode = process.argv[2];

if (mode === '--mcp') {
  await startMcp();
} else {
  const app = buildApp();

  await app.listen({ port: config.server.port, host: config.server.host });

  const shutdown = async (signal) => {
    console.log(`\n${signal} received — shutting down...`);
    await app.close();
    await cortexDb.destroy();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
