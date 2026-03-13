exports.up = function (knex) {
  return knex.schema
    .alterTable('entity', (table) => {
      table.text('namespace').defaultTo('product/lms').index();
      table.text('external_id');
      table.unique(['name', 'entity_type', 'namespace']);
    })
    .then(() =>
      knex.raw(`
        CREATE INDEX relation_source_type_idx
          ON relation (source_id, relation_type)
          WHERE invalid_at IS NULL;
        CREATE INDEX relation_target_type_idx
          ON relation (target_id, relation_type)
          WHERE invalid_at IS NULL;
      `)
    );
};

exports.down = function (knex) {
  return knex.raw(`
    DROP INDEX IF EXISTS relation_target_type_idx;
    DROP INDEX IF EXISTS relation_source_type_idx;
  `)
    .then(() =>
      knex.schema.alterTable('entity', (table) => {
        table.dropUnique(['name', 'entity_type', 'namespace']);
        table.dropColumn('external_id');
        table.dropColumn('namespace');
      })
    );
};
