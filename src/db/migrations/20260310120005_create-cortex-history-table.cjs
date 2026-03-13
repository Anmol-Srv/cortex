exports.up = function (knex) {
  return knex.schema.createTable('history', (table) => {
    table.increments('id').primary();
    table.text('target_type').notNullable();
    table.integer('target_id').notNullable();
    table.text('event').notNullable();
    table.text('old_content');
    table.text('new_content');
    table.text('triggered_by');
    table.timestamps(false, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('history');
};
