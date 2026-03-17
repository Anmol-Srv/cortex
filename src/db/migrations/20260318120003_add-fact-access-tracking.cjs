exports.up = function (knex) {
  return knex.schema.alterTable('fact', (table) => {
    table.integer('access_count').defaultTo(0);
    table.timestamp('last_accessed_at');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('fact', (table) => {
    table.dropColumn('access_count');
    table.dropColumn('last_accessed_at');
  });
};
