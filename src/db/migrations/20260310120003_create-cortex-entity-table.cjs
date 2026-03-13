exports.up = function (knex) {
  return knex.schema
    .createTable('entity', (table) => {
      table.increments('id').primary();
      table.text('uid').notNullable().unique();
      table.text('name').notNullable();
      table.text('entity_type').notNullable().index();
      table.text('description');
      table.integer('mention_count').defaultTo(0);
      table.timestamps(false, true);
    })
    .then(() =>
      knex.raw(
        `ALTER TABLE entity ADD COLUMN embedding vector(768)`
      )
    )
    .then(() =>
      knex.raw(
        `CREATE INDEX entity_embedding_idx ON entity USING hnsw (embedding vector_cosine_ops)`
      )
    );
};

exports.down = function (knex) {
  return knex.schema.dropTable('entity');
};
