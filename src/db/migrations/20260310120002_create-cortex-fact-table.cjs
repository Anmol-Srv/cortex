exports.up = function (knex) {
  return knex.schema
    .createTable('fact', (table) => {
      table.increments('id').primary();
      table.text('uid').notNullable().unique();
      table.text('content').notNullable();
      table.text('category').notNullable().index();
      table.text('confidence').defaultTo('medium');
      table.text('namespace').notNullable().index();
      table.text('status').notNullable().defaultTo('active').index();
      table.integer('contradicted_by_id').references('id').inTable('fact');
      table.integer('superseded_by_id').references('id').inTable('fact');
      table.specificType('source_document_ids', 'integer[]');
      table.text('source_section');
      table.specificType('search_vector', 'tsvector');
      table.timestamps(false, true);
    })
    .then(() =>
      knex.raw(
        `ALTER TABLE fact ADD COLUMN embedding vector(768)`
      )
    )
    .then(() =>
      knex.raw(
        `CREATE INDEX fact_embedding_idx ON fact USING hnsw (embedding vector_cosine_ops)`
      )
    )
    .then(() =>
      knex.raw(
        `CREATE INDEX fact_search_idx ON fact USING gin (search_vector)`
      )
    );
};

exports.down = function (knex) {
  return knex.schema.dropTable('fact');
};
