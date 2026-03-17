exports.up = function (knex) {
  return knex.schema
    .alterTable('fact', (table) => {
      table.timestamp('valid_from');
      table.timestamp('valid_until');
    })
    .then(() => knex.raw('UPDATE fact SET valid_from = created_at'));
};

exports.down = function (knex) {
  return knex.schema.alterTable('fact', (table) => {
    table.dropColumn('valid_from');
    table.dropColumn('valid_until');
  });
};
