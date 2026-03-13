exports.up = function (knex) {
  return knex.schema.createTable('api_key', (table) => {
    table.increments('id').primary();
    table.text('key_hash').notNullable().unique();
    table.text('name').notNullable();
    table.specificType('namespaces', 'text[]').notNullable().defaultTo('{}');
    table.text('role').notNullable().defaultTo('reader');
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamps(false, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('api_key');
};
