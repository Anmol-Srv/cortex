import { readFile } from 'node:fs/promises';

import { prompt, parseJson } from '../../lib/llm.js';
import config from '../../config.js';

/**
 * Generic fact extraction. Takes plain text + a prompt file + valid categories.
 * The calling pipeline is responsible for formatting its domain data into text.
 */
async function extractFacts(text, { promptPath, categories }) {
  const systemPrompt = await readFile(promptPath, 'utf8');

  const fullPrompt = `${systemPrompt}

---

${text}

---

Respond with ONLY a JSON array of facts. Each fact object must have exactly these fields:
- "content" (string): the atomic fact statement
- "category" (string): one of ${categories.join(', ')}
- "confidence" (string): one of high, medium, low

Output the JSON array directly, no explanation or wrapping.`;

  const response = await prompt(fullPrompt, { model: config.llm.extractionModel });
  const parsed = parseJson(response);

  if (!Array.isArray(parsed)) return [];

  return parsed.filter((f) =>
    f.content && categories.includes(f.category) && ['high', 'medium', 'low'].includes(f.confidence),
  );
}

export { extractFacts };
