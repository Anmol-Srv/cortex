exports.up = function (knex) {
  return knex.schema
    .createTable('connection', (table) => {
      table.increments('id').primary();
      table.text('uid').notNullable().unique();
      table.text('name').notNullable();
      table.text('connector_type').notNullable();
      table.jsonb('config').notNullable().defaultTo('{}');
      table.binary('credentials_encrypted');
      table.text('namespace').notNullable();
      table.text('status').notNullable().defaultTo('pending');
      table.timestamp('last_check_at');
      table.timestamps(false, true);
    })
    .createTable('sync_run', (table) => {
      table.increments('id').primary();
      table.text('uid').notNullable().unique();
      table.integer('connection_id').notNullable().references('id').inTable('connection').onDelete('CASCADE');
      table.text('pipeline_type').notNullable();
      table.text('sync_type').notNullable().defaultTo('full');
      table.text('status').notNullable().defaultTo('pending');
      table.jsonb('state_before');
      table.jsonb('state_after');
      table.integer('records_read').defaultTo(0);
      table.integer('records_written').defaultTo(0);
      table.text('error_message');
      table.timestamp('started_at');
      table.timestamp('completed_at');
      table.timestamps(false, true);
    })
    .createTable('sync_schedule', (table) => {
      table.increments('id').primary();
      table.integer('connection_id').notNullable().references('id').inTable('connection').onDelete('CASCADE');
      table.text('cron_expression');
      table.text('sync_type').notNullable().defaultTo('incremental');
      table.boolean('enabled').notNullable().defaultTo(true);
      table.timestamps(false, true);
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('sync_schedule')
    .dropTableIfExists('sync_run')
    .dropTableIfExists('connection');
};
