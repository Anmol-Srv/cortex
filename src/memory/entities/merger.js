import { groupBy, sumBy, sortBy } from 'lodash-es';

import cortexDb from '../../db/cortex.js';
import { findById, updateEntityTypes } from './store.js';

async function mergeEntities(primaryId, duplicateId) {
  const [primary, duplicate] = await Promise.all([
    findById(primaryId),
    findById(duplicateId),
  ]);

  if (!primary || !duplicate) {
    throw new Error(`Entity ${primaryId} or ${duplicateId} not found`);
  }

  if (primaryId === duplicateId) return primary;

  // 1. Redirect all relations from duplicate to primary
  await cortexDb('relation')
    .where({ sourceId: duplicateId })
    .update({ sourceId: primaryId });

  await cortexDb('relation')
    .where({ targetId: duplicateId })
    .update({ targetId: primaryId });

  // Remove self-referencing relations created by redirect
  await cortexDb('relation').whereRaw('source_id = target_id').del();

  // Deduplicate relations that now share (source, target, type)
  await deduplicateRelations(primaryId);

  // 2. Merge fact_entity links via INSERT ON CONFLICT
  await cortexDb.raw(`
    INSERT INTO fact_entity (fact_id, entity_id, mention_type, mention_count, created_at, updated_at)
    SELECT fact_id, ?, mention_type, mention_count, NOW(), NOW()
    FROM fact_entity
    WHERE entity_id = ?
    ON CONFLICT (fact_id, entity_id, mention_type)
    DO UPDATE SET mention_count = fact_entity.mention_count + EXCLUDED.mention_count
  `, [primaryId, duplicateId]);

  await cortexDb('fact_entity').where({ entityId: duplicateId }).del();

  // 3. Merge entity types
  const duplicateTypes = duplicate.entityTypes
    ? JSON.parse(duplicate.entityTypes)
    : [duplicate.entityType];

  for (const type of duplicateTypes) {
    await updateEntityTypes(primaryId, type);
  }

  // 4. Sum mention counts
  const newMentionCount = (primary.mentionCount || 0) + (duplicate.mentionCount || 0);
  await cortexDb('entity')
    .where({ id: primaryId })
    .update({ mentionCount: newMentionCount });

  // 5. Mark duplicate as merged (non-lossy)
  await cortexDb('entity')
    .where({ id: duplicateId })
    .update({ mergedWith: primaryId });

  console.log(`[entity-merge] Merged ${duplicateId} (${duplicate.name}) into ${primaryId} (${primary.name})`);

  return { ...primary, mentionCount: newMentionCount };
}

async function deduplicateRelations(entityId) {
  const relations = await cortexDb('relation')
    .where(function () {
      this.where({ sourceId: entityId }).orWhere({ targetId: entityId });
    })
    .whereNull('invalidAt');

  const groups = groupBy(relations, (r) => `${r.sourceId}-${r.targetId}-${r.relationType}`);

  for (const group of Object.values(groups)) {
    if (group.length <= 1) continue;

    const [keep, ...dupes] = sortBy(group, 'id');
    const totalMentions = sumBy(group, 'mentionCount');

    await cortexDb('relation').where({ id: keep.id }).update({ mentionCount: totalMentions });
    await cortexDb('relation').whereIn('id', dupes.map((d) => d.id)).del();
  }
}

async function followMergeChain(entityId) {
  let entity = await findById(entityId);
  const chain = [entity?.id];

  while (entity?.mergedWith) {
    entity = await findById(entity.mergedWith);
    if (entity) chain.push(entity.id);
  }

  return { canonical: entity, chain };
}

export { mergeEntities, followMergeChain };
