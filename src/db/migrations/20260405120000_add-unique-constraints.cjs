exports.up = async function (knex) {
  // Remove duplicate source_path entries (keep the latest)
  await knex.raw(`
    DELETE FROM document
    WHERE id NOT IN (
      SELECT MAX(id) FROM document GROUP BY source_path
    )
  `);

  await knex.schema.alterTable('document', (table) => {
    table.unique('source_path');
  });

  // Remove duplicate relations (keep the one with highest mention_count)
  await knex.raw(`
    DELETE FROM relation
    WHERE id NOT IN (
      SELECT MAX(id) FROM relation
      WHERE invalid_at IS NULL
      GROUP BY source_id, target_id, relation_type
    )
  `);

  await knex.schema.alterTable('relation', (table) => {
    table.unique(['source_id', 'target_id', 'relation_type']);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('relation', (table) => {
    table.dropUnique(['source_id', 'target_id', 'relation_type']);
  });

  await knex.schema.alterTable('document', (table) => {
    table.dropUnique('source_path');
  });
};
