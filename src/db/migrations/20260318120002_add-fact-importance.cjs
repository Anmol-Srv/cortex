exports.up = function (knex) {
  return knex.schema.alterTable('fact', (table) => {
    table.text('importance').defaultTo('supplementary');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('fact', (table) => {
    table.dropColumn('importance');
  });
};
