import 'dotenv/config';

import { search } from '../memory/search/hybrid.js';
import cortexDb from '../db/cortex.js';

const query = process.argv[2];

if (!query) {
  console.error('Usage: node src/scripts/test-search.js "<query>"');
  process.exit(1);
}

try {
  console.log(`Searching: "${query}"\n`);
  const { facts, chunks } = await search(query, { namespaces: ['default'], limit: 5 });

  console.log(`Facts: ${facts.length}, Chunks: ${chunks.length}\n`);

  if (chunks.length) {
    console.log('=== Top Chunks ===');
    for (const c of chunks) {
      console.log(`\n[${c.sectionHeading || 'no section'}] score: ${c.rrfScore?.toFixed(4)}`);
      console.log(c.content?.slice(0, 200) + '...');
    }
  }

  if (facts.length) {
    console.log('\n=== Top Facts ===');
    for (const f of facts) {
      console.log(`\n[${f.category}] score: ${f.rrfScore?.toFixed(4)}`);
      console.log(f.content?.slice(0, 200));
    }
  }
} catch (err) {
  console.error('Error:', err.message);
} finally {
  await cortexDb.destroy();
}
