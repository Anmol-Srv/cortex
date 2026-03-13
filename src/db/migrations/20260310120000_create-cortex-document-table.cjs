exports.up = function (knex) {
  return knex.raw('CREATE EXTENSION IF NOT EXISTS vector').then(() =>
    knex.schema.createTable('document', (table) => {
      table.increments('id').primary();
      table.text('uid').notNullable().unique();
      table.text('source_path').notNullable();
      table.text('source_type').notNullable();
      table.text('title');
      table.text('content_hash');
      table.text('namespace').notNullable().index();
      table.integer('chunk_count').defaultTo(0);
      table.integer('fact_count').defaultTo(0);
      table.timestamp('last_ingested_at');
      table.timestamps(false, true);
    })
  );
};

exports.down = function (knex) {
  return knex.schema.dropTable('document');
};
