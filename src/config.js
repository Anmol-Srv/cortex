const config = {
  db: {
    host: process.env.CORTEX_DB_HOST || 'localhost',
    port: Number(process.env.CORTEX_DB_PORT) || 5432,
    database: process.env.CORTEX_DB_NAME || 'cortex',
    user: process.env.CORTEX_DB_USER || 'cortex_app',
    password: process.env.CORTEX_DB_PASSWORD || '',
  },

  embedding: {
    provider: process.env.EMBEDDING_PROVIDER || 'ollama',
    model: process.env.EMBEDDING_MODEL || 'nomic-embed-text',
    dimensions: Number(process.env.EMBEDDING_DIMENSIONS) || 768,
    ollamaHost: process.env.OLLAMA_HOST || 'http://localhost:11434',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
  },

  llm: {
    provider: process.env.LLM_PROVIDER || 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    extractionModel: process.env.LLM_EXTRACTION_MODEL || 'claude-haiku-4-5-20251001',
    decisionModel: process.env.LLM_DECISION_MODEL || 'claude-sonnet-4-6',
    entityModel: process.env.LLM_ENTITY_MODEL || 'claude-haiku-4-5-20251001',
    maxRetries: Number(process.env.LLM_MAX_RETRIES) || 3,
  },

  output: {
    storage: process.env.OUTPUT_STORAGE || 'local',
    dir: process.env.OUTPUT_DIR || './output',
    s3: {
      endpoint: process.env.S3_ENDPOINT || '',
      bucket: process.env.S3_BUCKET || '',
      region: process.env.S3_REGION || 'us-east-1',
      accessKey: process.env.S3_ACCESS_KEY || '',
      secretKey: process.env.S3_SECRET_KEY || '',
      publicUrl: process.env.S3_PUBLIC_URL || '',
    },
  },

  server: {
    port: Number(process.env.PORT) || 3100,
    host: process.env.HOST || '0.0.0.0',
    logLevel: process.env.LOG_LEVEL || 'info',
  },

  defaults: {
    namespace: process.env.DEFAULT_NAMESPACE || 'default',
  },
};

export default config;
