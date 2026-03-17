exports.up = function (knex) {
  return knex.schema.alterTable('chunk', (table) => {
    table.text('contextual_prefix');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('chunk', (table) => {
    table.dropColumn('contextual_prefix');
  });
};
