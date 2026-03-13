import 'dotenv/config';

import buildApp from './app.js';
import config from './config.js';
import { startMcp } from './mcp/server.js';

const mode = process.argv[2];

if (mode === '--mcp') {
  await startMcp();
} else {
  const app = buildApp();
  await app.listen({ port: config.server.port, host: config.server.host });
}
