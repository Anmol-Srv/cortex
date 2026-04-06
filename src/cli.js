#!/usr/bin/env node

import 'dotenv/config';

const [command, ...rest] = process.argv.slice(2);

const HELP = `cortex — Organizational memory and context layer for LLMs

Usage:
  cortex <command> [options]

Commands:
  ingest <file|url|glob>   Ingest documents into the knowledge base
  search "query"           Search the knowledge base
  status                   Show knowledge base statistics
  migrate                  Run database migrations
  reset                    Reset the database (drops all data)

Options:
  --help                   Show this help message

Run cortex <command> --help for command-specific options.`;

if (!command || command === '--help' || command === '-h') {
  console.log(HELP);
  process.exit(0);
}

const commands = {
  ingest: runIngest,
  search: runSearch,
  status: runStatus,
  migrate: runMigrate,
  reset: runReset,
};

const handler = commands[command];
if (!handler) {
  console.error(`Unknown command: ${command}\n`);
  console.log(HELP);
  process.exit(1);
}

try {
  await handler(rest);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}

async function runIngest(args) {
  const flags = args.filter((a) => a.startsWith('--'));
  const inputs = args.filter((a) => !a.startsWith('--'));

  if (!inputs.length || flags.includes('--help')) {
    console.log(`cortex ingest — Ingest documents into the knowledge base

Usage:
  cortex ingest <file|url|glob> [options]

Options:
  --namespace=<ns>    Target namespace (default: from config)
  --skip-facts        Skip fact extraction
  --skip-entities     Skip entity linking
  --skip-markdown     Skip markdown generation

Examples:
  cortex ingest ./docs/README.md
  cortex ingest "docs/**/*.md"
  cortex ingest https://example.com/page
  cortex ingest file1.md file2.md --namespace=engineering`);
    process.exit(0);
  }

  const { ingestDocument } = await import('./ingestion/pipeline.js');
  const { readSource, readSources } = await import('./ingestion/sources/file.js');
  const { fetchSource } = await import('./ingestion/sources/url.js');
  const cortexDb = (await import('./db/cortex.js')).default;

  const namespace = flags.find((f) => f.startsWith('--namespace='))?.split('=')[1];
  const skipFacts = flags.includes('--skip-facts');
  const skipEntities = flags.includes('--skip-entities');
  const skipMarkdown = flags.includes('--skip-markdown');

  const results = { success: [], failed: [], skipped: [] };
  const startTime = Date.now();

  for (const input of inputs) {
    try {
      let sources;

      if (input.startsWith('http://') || input.startsWith('https://')) {
        sources = [await fetchSource(input)];
      } else if (input.includes('*')) {
        sources = await readSources(input);
        if (!sources.length) {
          console.log(`No files matched: ${input}`);
          continue;
        }
      } else {
        sources = [await readSource(input)];
      }

      for (const source of sources) {
        console.log(`Ingesting: ${source.title}`);
        const result = await ingestDocument({
          content: source.content,
          title: source.title,
          sourcePath: source.sourcePath,
          sourceType: source.sourceType,
          contentType: source.contentType,
          namespace,
          metadata: source.metadata,
          skipFacts,
          skipEntities,
          skipMarkdown,
        });

        if (result.skipped) {
          results.skipped.push(source.title);
          console.log(`  Skipped (unchanged)`);
        } else {
          results.success.push(source.title);
          console.log(`  Done — ${result.chunkCount} chunks, ${result.facts.total} facts (${result.facts.added} new, ${result.facts.updated} updated)`);
        }
      }
    } catch (err) {
      console.error(`  Failed: ${input} — ${err.message}`);
      results.failed.push({ input, error: err.message });
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s — ${results.success.length} ingested, ${results.skipped.length} skipped, ${results.failed.length} failed`);

  await cortexDb.destroy();
}

async function runSearch(args) {
  const flags = args.filter((a) => a.startsWith('--'));
  const query = args.filter((a) => !a.startsWith('--')).join(' ');

  if (!query || flags.includes('--help')) {
    console.log(`cortex search — Search the knowledge base

Usage:
  cortex search "query" [options]

Options:
  --namespace=<ns>    Filter by namespace (comma-separated for multiple)
  --limit=<n>         Max results (default: 10)
  --no-graph          Disable graph enhancement

Examples:
  cortex search "authentication flow"
  cortex search "deploy process" --namespace=engineering
  cortex search "API design" --limit=5`);
    process.exit(0);
  }

  const { search } = await import('./memory/search/hybrid.js');
  const config = (await import('./config.js')).default;
  const cortexDb = (await import('./db/cortex.js')).default;

  const nsFlag = flags.find((f) => f.startsWith('--namespace='))?.split('=')[1];
  const namespaces = nsFlag ? nsFlag.split(',') : [config.defaults.namespace];
  const limit = Number(flags.find((f) => f.startsWith('--limit='))?.split('=')[1] || 10);
  const useGraph = !flags.includes('--no-graph');

  const { facts, chunks } = await search(query, { namespaces, limit, useGraph });

  if (facts.length) {
    console.log(`\nFacts (${facts.length}):`);
    for (const fact of facts) {
      const score = fact.rrfScore ? ` [${fact.rrfScore}]` : '';
      console.log(`  ${fact.content}${score}`);
    }
  }

  if (chunks.length) {
    console.log(`\nChunks (${chunks.length}):`);
    for (const chunk of chunks) {
      const preview = chunk.content?.slice(0, 120).replace(/\n/g, ' ');
      const score = chunk.rrfScore ? ` [${chunk.rrfScore}]` : '';
      console.log(`  ${preview}...${score}`);
    }
  }

  if (!facts.length && !chunks.length) {
    console.log('No results found.');
  }

  await cortexDb.destroy();
}

async function runStatus(args) {
  if (args.includes('--help')) {
    console.log(`cortex status — Show knowledge base statistics

Usage:
  cortex status [--namespace=<ns>]`);
    process.exit(0);
  }

  const { getStats } = await import('./memory/documents/store.js');
  const { getEntityCount } = await import('./memory/entities/store.js');
  const { getRelationCount } = await import('./memory/entities/relations.js');
  const { getFactCount } = await import('./memory/facts/store.js');
  const cortexDb = (await import('./db/cortex.js')).default;

  const namespace = args.find((a) => a.startsWith('--namespace='))?.split('=')[1];

  const [docStats, factCount, documents, people, topics, relations] = await Promise.all([
    getStats(namespace),
    getFactCount(namespace),
    getEntityCount('document'),
    getEntityCount('person'),
    getEntityCount('topic'),
    getRelationCount(),
  ]);

  console.log(`Cortex Knowledge Base${namespace ? ` (${namespace})` : ''}`);
  console.log(`  Documents:  ${docStats.documentCount}`);
  console.log(`  Chunks:     ${docStats.totalChunks}`);
  console.log(`  Facts:      ${factCount} active`);
  console.log(`  Entities:   ${documents} documents, ${people} people, ${topics} topics`);
  console.log(`  Relations:  ${relations}`);

  await cortexDb.destroy();
}

async function runMigrate(args) {
  if (args.includes('--help')) {
    console.log(`cortex migrate — Run database migrations

Usage:
  cortex migrate [--rollback]`);
    process.exit(0);
  }

  const cortexDb = (await import('./db/cortex.js')).default;

  const migrationConfig = { directory: './src/db/migrations' };

  if (args.includes('--rollback')) {
    const [batch, migrations] = await cortexDb.migrate.rollback(migrationConfig);
    console.log(`Rolled back batch ${batch}: ${migrations.length} migrations`);
    for (const m of migrations) console.log(`  ${m}`);
  } else {
    const [batch, migrations] = await cortexDb.migrate.latest(migrationConfig);
    if (migrations.length) {
      console.log(`Ran batch ${batch}: ${migrations.length} migrations`);
      for (const m of migrations) console.log(`  ${m}`);
    } else {
      console.log('Already up to date.');
    }
  }

  await cortexDb.destroy();
}

async function runReset(args) {
  if (args.includes('--help')) {
    console.log(`cortex reset — Reset the database (drops all data)

Usage:
  cortex reset [--confirm]

Requires --confirm flag to prevent accidental data loss.`);
    process.exit(0);
  }

  if (!args.includes('--confirm')) {
    console.error('This will delete ALL data. Run with --confirm to proceed.');
    process.exit(1);
  }

  const cortexDb = (await import('./db/cortex.js')).default;

  const migrationConfig = { directory: './src/db/migrations' };
  await cortexDb.migrate.rollback(migrationConfig, true);
  await cortexDb.migrate.latest(migrationConfig);

  console.log('Database reset complete. All migrations re-applied.');
  await cortexDb.destroy();
}

