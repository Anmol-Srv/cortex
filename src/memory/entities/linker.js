import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { resolveEntity, resolveTopicsFromFacts } from './resolver.js';
import { createRelation } from './relations.js';
import { linkEntitiesToFact } from '../facts/entity-linker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTITY_PROMPT = path.join(__dirname, '../../../prompts/entity-extraction.md');

/**
 * Orchestrates entity linking for a document ingestion.
 * Resolves structured entities from document metadata + LLM-extracted topics,
 * then creates typed relations between them.
 */
async function linkDocumentEntities(document, factResults, namespace) {
  const { title, sourceType, metadata = {} } = document;

  // 1. Resolve document entity
  const docEntity = await resolveEntity({
    name: title,
    entityType: 'document',
    description: `${sourceType} document: ${title}`,
    namespace,
  });

  // 2. Resolve author entity if metadata provides one
  let authorEntity = null;
  if (metadata.author) {
    authorEntity = await resolveEntity({
      name: metadata.author,
      entityType: 'person',
      namespace,
    });
  }

  // 3. Extract and resolve topic entities from facts (LLM call)
  const activeFacts = factResults.filter((r) => r.action === 'ADD' || r.action === 'UPDATE');
  const factObjects = activeFacts
    .map((r) => r.fact || r.existing)
    .filter(Boolean);

  const topics = factObjects.length
    ? await resolveTopicsFromFacts(factObjects, { promptPath: ENTITY_PROMPT, namespace })
    : [];

  // 4. Create relations
  let relationCount = 0;
  const firstFact = activeFacts.find((r) => r.fact)?.fact;
  const firstFactId = firstFact?.id || null;
  const today = new Date().toISOString().split('T')[0];

  // document AUTHORED_BY author
  if (authorEntity) {
    await createRelation({
      sourceId: docEntity.id,
      targetId: authorEntity.id,
      relationType: 'AUTHORED_BY',
      sourceFactId: firstFactId,
      validAt: today,
    });
    relationCount++;
  }

  // document COVERS topic
  for (const topic of topics) {
    const topicFact = findFactMentioning(factObjects, topic.name);
    await createRelation({
      sourceId: docEntity.id,
      targetId: topic.id,
      relationType: 'COVERS',
      sourceFactId: topicFact?.id || firstFactId,
      validAt: today,
    });
    relationCount++;
  }

  // 5. Link facts ↔ entities
  const allEntities = [docEntity, authorEntity, ...topics].filter(Boolean);
  let factEntityLinks = 0;

  for (const fact of factObjects) {
    const mentioned = allEntities.filter(
      (e) => fact.content?.toLowerCase().includes(e.name.toLowerCase()),
    );
    if (mentioned.length) {
      await linkEntitiesToFact(fact.id, mentioned);
      factEntityLinks += mentioned.length;
    }
  }

  return {
    entityCount: allEntities.length,
    relationCount,
    factEntityLinks,
    topics: topics.map((t) => t.name),
  };
}

function findFactMentioning(facts, term) {
  if (!term) return null;
  const lower = term.toLowerCase();
  return facts.find((f) => f.content?.toLowerCase().includes(lower)) || null;
}

export { linkDocumentEntities };
