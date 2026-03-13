import cortexDb from '../../db/cortex.js';

async function createRelation({ sourceId, targetId, relationType, sourceFactId, validAt }) {
  const existing = await findRelation(sourceId, targetId, relationType);

  if (existing) {
    await cortexDb('relation')
      .where({ id: existing.id })
      .increment('mentionCount', 1);

    if (sourceFactId) {
      await cortexDb('relation')
        .where({ id: existing.id })
        .update({ sourceFactId });
    }

    return { ...existing, mentionCount: existing.mentionCount + 1 };
  }

  const [relation] = await cortexDb('relation')
    .insert({
      sourceId,
      targetId,
      relationType,
      sourceFactId: sourceFactId || null,
      mentionCount: 1,
      validAt: validAt || null,
      invalidAt: null,
    })
    .returning('*');

  return relation;
}

async function findRelation(sourceId, targetId, relationType) {
  return cortexDb('relation')
    .where({ sourceId, targetId, relationType })
    .whereNull('invalidAt')
    .first() || null;
}

async function invalidateRelation(relationId, { invalidAt } = {}) {
  await cortexDb('relation')
    .where({ id: relationId })
    .update({ invalidAt: invalidAt || new Date() });
}

async function listRelationsForEntity(entityId, { direction = 'both', relationType, limit = 50 } = {}) {
  const buildQuery = (dir) => {
    const fkCol = dir === 'outgoing' ? 'source_id' : 'target_id';
    const joinCol = dir === 'outgoing' ? 'target_id' : 'source_id';

    return cortexDb.raw(`
      SELECT r.id AS "relationId", r.relation_type AS "relationType",
             r.mention_count AS "mentionCount", r.valid_at AS "validAt",
             e.id AS "entityId", e.uid, e.name, e.entity_type AS "entityType",
             e.description, '${dir}' AS direction
      FROM relation r
      JOIN entity e ON e.id = r.${joinCol}
      WHERE r.${fkCol} = ?
        AND r.invalid_at IS NULL
        AND e.merged_with IS NULL
        ${relationType ? 'AND r.relation_type = ?' : ''}
      ORDER BY r.mention_count DESC
      LIMIT ?
    `, relationType
      ? [entityId, relationType, limit]
      : [entityId, limit]);
  };

  if (direction === 'outgoing') {
    const { rows } = await buildQuery('outgoing');
    return rows;
  }
  if (direction === 'incoming') {
    const { rows } = await buildQuery('incoming');
    return rows;
  }

  // Both directions
  const [outgoing, incoming] = await Promise.all([
    buildQuery('outgoing'),
    buildQuery('incoming'),
  ]);

  return [...outgoing.rows, ...incoming.rows];
}

async function getRelationsByFact(factId) {
  const { rows } = await cortexDb.raw(`
    SELECT r.id, r.relation_type AS "relationType",
           r.mention_count AS "mentionCount",
           s.name AS "sourceName", s.entity_type AS "sourceType",
           t.name AS "targetName", t.entity_type AS "targetType"
    FROM relation r
    JOIN entity s ON s.id = r.source_id
    JOIN entity t ON t.id = r.target_id
    WHERE r.source_fact_id = ?
      AND r.invalid_at IS NULL
      AND s.merged_with IS NULL
      AND t.merged_with IS NULL
  `, [factId]);

  return rows;
}

async function getRelationCount() {
  const [{ count }] = await cortexDb('relation')
    .whereNull('invalidAt')
    .count('id as count');
  return Number(count);
}

export {
  createRelation,
  findRelation,
  invalidateRelation,
  listRelationsForEntity,
  getRelationsByFact,
  getRelationCount,
};
