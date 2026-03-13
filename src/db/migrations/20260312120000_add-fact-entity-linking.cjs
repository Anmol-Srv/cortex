exports.up = function (knex) {
  return knex.schema
    .createTable('fact_entity', (table) => {
      table.increments('id').primary();
      table.integer('fact_id').notNullable().references('id').inTable('fact').onDelete('CASCADE');
      table.integer('entity_id').notNullable().references('id').inTable('entity').onDelete('CASCADE');
      table.text('mention_type').defaultTo('content');
      table.integer('mention_count').defaultTo(1);
      table.timestamps(false, true);
    })
    .then(() =>
      knex.raw(`
        CREATE INDEX fact_entity_fact_id_idx ON fact_entity (fact_id);
        CREATE INDEX fact_entity_entity_id_idx ON fact_entity (entity_id);
        CREATE UNIQUE INDEX fact_entity_unique_idx ON fact_entity (fact_id, entity_id, mention_type);
      `)
    );
};

exports.down = function (knex) {
  return knex.schema.dropTable('fact_entity');
};
