exports.up = function (knex) {
  return knex.schema.createTable('llm_log', (table) => {
    table.increments('id').primary();
    table.text('provider').notNullable().index();
    table.text('model').notNullable().index();
    table.text('caller').index();
    table.text('input');
    table.text('response');
    table.integer('input_tokens').defaultTo(0);
    table.integer('output_tokens').defaultTo(0);
    table.decimal('cost', 10, 6).defaultTo(0);
    table.integer('duration_ms').defaultTo(0);
    table.text('status').defaultTo('success').index();
    table.text('error');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('llm_log');
};
