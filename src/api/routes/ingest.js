import { ingestDocument } from '../../ingestion/pipeline.js';
import { readSource } from '../../ingestion/sources/file.js';
import { fetchSource } from '../../ingestion/sources/url.js';

async function ingestRoutes(app) {
  app.post('/api/ingest', async (request, reply) => {
    const { content, url, filePath, title, namespace, sourceType, skipFacts, skipEntities, skipMarkdown } = request.body || {};

    if (!content && !url && !filePath) {
      return reply.code(400).send({ error: 'Provide content, url, or filePath' });
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
        sourcePath: `raw/${Date.now()}`,
        sourceType: sourceType || 'raw',
        contentType: 'text/plain',
        metadata: {},
      };
    }

    const ns = namespace || (request.namespaces?.[0]);

    const result = await ingestDocument({
      content: source.content,
      title: title || source.title,
      sourcePath: source.sourcePath,
      sourceType: sourceType || source.sourceType,
      contentType: source.contentType,
      namespace: ns,
      metadata: source.metadata,
      skipFacts: skipFacts || false,
      skipEntities: skipEntities || false,
      skipMarkdown: skipMarkdown || false,
    });

    return result;
  });

  app.post('/api/ingest/batch', async (request, reply) => {
    const { documents } = request.body || {};

    if (!Array.isArray(documents) || !documents.length) {
      return reply.code(400).send({ error: 'Provide a documents array' });
    }

    const results = [];
    for (const doc of documents) {
      try {
        const result = await ingestDocument({
          content: doc.content,
          title: doc.title,
          sourcePath: doc.sourcePath || `batch/${Date.now()}`,
          sourceType: doc.sourceType || 'raw',
          namespace: doc.namespace || request.namespaces?.[0],
          metadata: doc.metadata || {},
          skipFacts: doc.skipFacts || false,
          skipEntities: doc.skipEntities || false,
          skipMarkdown: doc.skipMarkdown || false,
        });
        results.push({ title: doc.title, status: result.skipped ? 'skipped' : 'ingested', ...result });
      } catch (err) {
        results.push({ title: doc.title, status: 'error', error: err.message });
      }
    }

    return { results };
  });
}

export default ingestRoutes;
