import 'dotenv/config';

import { ingestDocument } from '../ingestion/pipeline.js';
import { readSource, readSources } from '../ingestion/sources/file.js';
import { fetchSource } from '../ingestion/sources/url.js';
import cortexDb from '../db/cortex.js';

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const inputs = args.filter((a) => !a.startsWith('--'));

const namespace = flags.find((f) => f.startsWith('--namespace='))?.split('=')[1];
const skipFacts = flags.includes('--skip-facts');
const skipEntities = flags.includes('--skip-entities');
const skipMarkdown = flags.includes('--skip-markdown');

if (!inputs.length) {
  console.error(`Usage: node src/scripts/ingest.js <file|url|glob> [options]

Options:
  --namespace=<ns>    Namespace (default: from config)
  --skip-facts        Skip fact extraction
  --skip-entities     Skip entity linking
  --skip-markdown     Skip markdown generation

Examples:
  node src/scripts/ingest.js ./docs/README.md
  node src/scripts/ingest.js "docs/**/*.md"
  node src/scripts/ingest.js https://example.com/page
  node src/scripts/ingest.js file1.md file2.md file3.md`);
  process.exit(1);
}

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
      console.log(`\nIngesting: ${source.title}`);
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
      } else {
        results.success.push(source.title);
      }
    }
  } catch (err) {
    console.error(`Failed: ${input} — ${err.message}`);
    results.failed.push({ input, error: err.message });
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

console.log(`\n${'='.repeat(50)}`);
console.log(`Done in ${elapsed}s — ${results.success.length} ingested, ${results.skipped.length} skipped, ${results.failed.length} failed`);

if (results.failed.length) {
  console.log('\nFailed:');
  for (const f of results.failed) {
    console.log(`  ${f.input}: ${f.error}`);
  }
}

await cortexDb.destroy();
