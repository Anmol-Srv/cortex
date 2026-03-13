import { uniqBy } from 'lodash-es';

import { getEntitiesForFact, getFactsForEntity } from '../facts/entity-linker.js';
import { listRelationsForEntity } from '../entities/relations.js';

async function extractEntitiesFromFacts(facts) {
  const allEntities = [];

  for (const fact of facts) {
    const entities = await getEntitiesForFact(fact.id);
    allEntities.push(...entities);
  }

  return uniqBy(allEntities, 'id');
}

async function findRelatedFacts(mentionedEntityIds, { limit = 10 } = {}) {
  const relatedFacts = [];
  const seenFactIds = new Set();

  for (const entityId of mentionedEntityIds) {
    const relations = await listRelationsForEntity(entityId, { limit: 5 });

    for (const rel of relations) {
      const facts = await getFactsForEntity(rel.entityId, { limit: 3 });

      for (const fact of facts) {
        if (seenFactIds.has(fact.id)) continue;
        seenFactIds.add(fact.id);

        relatedFacts.push({
          ...fact,
          relationPath: `${rel.name} (${rel.relationType})`,
          graphDistance: 1,
        });
      }
    }

    if (relatedFacts.length >= limit) break;
  }

  return relatedFacts.slice(0, limit);
}

function rerank(directFacts, relatedFacts, mentionedEntityIds, limit) {
  const entitySet = new Set(mentionedEntityIds);

  const boosted = directFacts.map((f) => ({
    ...f,
    resultType: 'direct',
  }));

  const related = relatedFacts
    .filter((rf) => !directFacts.some((df) => df.id === rf.id))
    .map((f) => ({
      ...f,
      rrfScore: (f.rrfScore || 0.1) * 0.5,
      resultType: 'related',
    }));

  return [...boosted, ...related].slice(0, limit);
}

export { extractEntitiesFromFacts, findRelatedFacts, rerank };
