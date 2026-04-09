// Support DOTENV_CONFIG_PATH for global installs where cwd is not the project root
import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const PKG_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const envPath = process.env.DOTENV_CONFIG_PATH
  || (existsSync(resolve(process.cwd(), '.env')) ? resolve(process.cwd(), '.env') : null)
  || resolve(PKG_DIR, '.env');

dotenvConfig({ path: envPath, quiet: true });

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
