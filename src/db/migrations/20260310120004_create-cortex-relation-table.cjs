exports.up = function (knex) {
  return knex.schema.createTable('relation', (table) => {
    table.increments('id').primary();
    table
      .integer('source_id')
      .notNullable()
      .references('id')
      .inTable('entity')
      .onDelete('CASCADE');
    table
      .integer('target_id')
      .notNullable()
      .references('id')
      .inTable('entity')
      .onDelete('CASCADE');
    table.text('relation_type').notNullable().index();
    table.integer('source_fact_id').references('id').inTable('fact');
    table.integer('mention_count').defaultTo(1);
    table.timestamp('valid_at');
    table.timestamp('invalid_at');
    table.timestamps(false, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('relation');
};
