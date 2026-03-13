import 'dotenv/config';

export default {
  client: 'pg',
  connection: {
    host: process.env.CORTEX_DB_HOST || 'localhost',
    port: Number(process.env.CORTEX_DB_PORT) || 5432,
    database: process.env.CORTEX_DB_NAME || 'cortex',
    user: process.env.CORTEX_DB_USER || 'cortex_app',
    password: process.env.CORTEX_DB_PASSWORD || '',
  },
  migrations: {
    directory: './src/db/migrations',
  },
};
