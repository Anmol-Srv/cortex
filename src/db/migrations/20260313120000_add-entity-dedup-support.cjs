exports.up = function (knex) {
  return knex.schema.table('entity', (table) => {
    table.text('entity_types').nullable();
    table.integer('merged_with').nullable().references('id').inTable('entity');
  });
};

exports.down = function (knex) {
  return knex.schema.table('entity', (table) => {
    table.dropColumn('entity_types');
    table.dropColumn('merged_with');
  });
};
