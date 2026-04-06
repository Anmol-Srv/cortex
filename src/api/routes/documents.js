import { listDocuments, findByUid, deleteDocument } from '../../memory/documents/store.js';
import { AppError } from '../../lib/errors.js';

const uidParam = {
  type: 'object',
  required: ['uid'],
  properties: {
    uid: { type: 'string', minLength: 1 },
  },
};

const listDocsSchema = {
  querystring: {
    type: 'object',
    properties: {
      namespace: { type: 'string' },
      sourceType: { type: 'string' },
      limit: { type: 'integer', default: 100, minimum: 1, maximum: 500 },
    },
  },
};

const getDocSchema = {
  params: uidParam,
};

const deleteDocSchema = {
  params: uidParam,
};

async function requireDocument(uid) {
  const doc = await findByUid(uid);
  if (!doc) throw new AppError({ errorCode: 'NOT_FOUND', message: 'Document not found' });
  return doc;
}

async function handleListDocuments(request) {
  const { namespace, sourceType, limit } = request.query;

  const documents = await listDocuments({ namespace, sourceType, limit });
  return { documents };
}

async function handleGetDocument(request) {
  const doc = await requireDocument(request.params.uid);
  return { document: doc };
}

async function handleDeleteDocument(request) {
  const doc = await requireDocument(request.params.uid);

  await deleteDocument(doc.id);
  return { deleted: true, uid: doc.uid };
}

async function documentRoutes(app) {
  app.get('/api/documents', { schema: listDocsSchema }, handleListDocuments);
  app.get('/api/documents/:uid', { schema: getDocSchema }, handleGetDocument);
  app.delete('/api/documents/:uid', { schema: deleteDocSchema }, handleDeleteDocument);
}

export default documentRoutes;
