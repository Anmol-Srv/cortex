import { ingestDocument } from '../../ingestion/pipeline.js';
import { readSource } from '../../ingestion/sources/file.js';
import { fetchSource } from '../../ingestion/sources/url.js';
import config from '../../config.js';
import { AppError } from '../../lib/errors.js';

const ingestSchema = {
  body: {
    type: 'object',
    properties: {
      content: { type: 'string' },
      url: { type: 'string', format: 'uri' },
      filePath: { type: 'string' },
      title: { type: 'string' },
      namespace: { type: 'string' },
      sourceType: { type: 'string' },
      sourcePath: { type: 'string' },
      metadata: { type: 'object' },
      skipFacts: { type: 'boolean', default: false },
      skipEntities: { type: 'boolean', default: false },
      skipMarkdown: { type: 'boolean', default: false },
      categories: {},
      entities: {},
    },
  },
};

const batchSchema = {
  body: {
    type: 'object',
    required: ['documents'],
    properties: {
      documents: {
        type: 'array',
        minItems: 1,
        items: { type: 'object' },
      },
    },
  },
};

async function handleIngest(request) {
  const {
    content, url, filePath,
    title, namespace, sourceType, sourcePath,
    metadata,
    skipFacts, skipEntities, skipMarkdown,
    categories, entities,
  } = request.body;

  if (!content && !url && !filePath) {
    throw new AppError({ errorCode: 'BAD_REQUEST', message: 'content, url, or filePath required' });
  }

  let source;
  if (url) {
    source = await fetchSource(url);
  } else if (filePath) {
    source = await readSource(filePath);
  } else {
    source = {
      content,
      title: title || 'Untitled',
      sourcePath: sourcePath || `raw/${Date.now()}`,
      sourceType: sourceType || 'raw',
      contentType: 'text/plain',
      metadata: metadata || {},
    };
  }

  const ns = namespace || config.defaults.namespace;

  const result = await ingestDocument({
    content: source.content,
    title: title || source.title,
    sourcePath: sourcePath || source.sourcePath,
    sourceType: sourceType || source.sourceType,
    contentType: source.contentType,
    namespace: ns,
    metadata: { ...source.metadata, ...metadata },
    skipFacts,
    skipEntities,
    skipMarkdown,
    categories,
    entities,
  });

  return result;
}

async function handleBatchIngest(request) {
  const { documents } = request.body;

  const results = [];
  for (const doc of documents) {
    try {
      const result = await ingestDocument({
        content: doc.content,
        title: doc.title,
        sourcePath: doc.sourcePath || `batch/${Date.now()}`,
        sourceType: doc.sourceType || 'raw',
        namespace: doc.namespace || config.defaults.namespace,
        metadata: doc.metadata || {},
        skipFacts: doc.skipFacts || false,
        skipEntities: doc.skipEntities || false,
        skipMarkdown: doc.skipMarkdown || false,
        categories: doc.categories,
        entities: doc.entities,
      });
      results.push({ title: doc.title, status: result.skipped ? 'skipped' : 'ingested', ...result });
    } catch (err) {
      results.push({ title: doc.title, status: 'error', error: err.message });
    }
  }

  return { results };
}

async function ingestRoutes(app) {
  app.post('/api/ingest', { schema: ingestSchema }, handleIngest);
  app.post('/api/ingest/batch', { schema: batchSchema }, handleBatchIngest);
}

export default ingestRoutes;
