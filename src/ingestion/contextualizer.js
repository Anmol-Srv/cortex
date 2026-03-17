import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { promptJson } from '../lib/llm.js';
import config from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = join(__dirname, '../../prompts/chunk-context.md');

async function contextualizeChunks(chunks, documentText, { title }) {
  if (!chunks.length) return chunks;

  const systemPrompt = await readFile(PROMPT_PATH, 'utf8');

  const excerpts = chunks.map((c, i) => `Chunk ${i + 1}: ${c.content.slice(0, 200)}`);

  const fullPrompt = `${systemPrompt}

---

**Document title:** ${title}

**Full document:**
${documentText.slice(0, 8000)}

**Chunks (${chunks.length}):**
${excerpts.join('\n')}

---

Respond with a JSON array of ${chunks.length} context prefix strings.`;

  try {
    const prefixes = await promptJson(fullPrompt, { model: config.llm.extractionModel });

    if (!Array.isArray(prefixes) || prefixes.length !== chunks.length) {
      console.warn('[contextualizer] Prefix count mismatch — skipping contextual enrichment');
      return chunks;
    }

    return chunks.map((chunk, i) => ({
      ...chunk,
      contextualPrefix: typeof prefixes[i] === 'string' ? prefixes[i] : null,
    }));
  } catch (err) {
    console.error('[contextualizer] Failed:', err.message);
    return chunks;
  }
}

export { contextualizeChunks };
