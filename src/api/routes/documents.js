import { listDocuments, findByUid, deleteDocument } from '../../memory/documents/store.js';

async function documentRoutes(app) {
  app.get('/api/documents', async (request) => {
    const { namespace, sourceType, limit = 100 } = request.query;

    const documents = await listDocuments({
      namespace,
      sourceType,
      limit: Number(limit),
    });

    return { documents };
  });

  app.get('/api/documents/:uid', async (request, reply) => {
    const doc = await findByUid(request.params.uid);
    if (!doc) return reply.code(404).send({ error: 'Document not found' });
    return { document: doc };
  });

  app.delete('/api/documents/:uid', async (request, reply) => {
    const doc = await findByUid(request.params.uid);
    if (!doc) return reply.code(404).send({ error: 'Document not found' });

    await deleteDocument(doc.id);
    return { deleted: true, uid: doc.uid };
  });
}

export default documentRoutes;
