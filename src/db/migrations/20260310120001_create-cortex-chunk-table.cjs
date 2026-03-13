exports.up = function (knex) {
  return knex.schema
    .createTable('chunk', (table) => {
      table.increments('id').primary();
      table
        .integer('document_id')
        .notNullable()
        .references('id')
        .inTable('document')
        .onDelete('CASCADE');
      table.integer('chunk_index').notNullable();
      table.text('content').notNullable();
      table.text('section_heading');
      table.text('namespace').notNullable().index();
      table.specificType('search_vector', 'tsvector');
      table.timestamps(false, true);
    })
    .then(() =>
      knex.raw(
        `ALTER TABLE chunk ADD COLUMN embedding vector(768)`
      )
    )
    .then(() =>
      knex.raw(
        `CREATE INDEX chunk_embedding_idx ON chunk USING hnsw (embedding vector_cosine_ops)`
      )
    )
    .then(() =>
      knex.raw(
        `CREATE INDEX chunk_search_idx ON chunk USING gin (search_vector)`
      )
    );
};

exports.down = function (knex) {
  return knex.schema.dropTable('chunk');
};
