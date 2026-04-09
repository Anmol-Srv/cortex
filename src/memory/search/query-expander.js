import { promptJson } from '../../lib/llm.js';
import config from '../../config.js';

const MAX_VARIANTS = 5;
const CACHE_MAX_SIZE = 100;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const cache = new Map();

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }

  return entry.value;
}

function setCached(key, value) {
  if (cache.size >= CACHE_MAX_SIZE) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  cache.set(key, { value, timestamp: Date.now() });
}

/**
 * Expand a user query into semantic variants for multi-query search.
 *
 * Given "what tech stack should I use?", produces:
 *   - "technology preferences"
 *   - "preferred programming languages"
 *   - "frameworks to avoid"
 *   - "recommended tools and libraries"
 *
 * This surfaces non-literally connected facts (e.g. "I don't prefer React").
 */
async function expandQuery(query) {
  const cached = getCached(query);
  if (cached) return cached;

  const prompt = `You are a search query expander for a personal knowledge base.

Given the user's query, generate 3-5 alternative search queries that would help find ALL relevant information — including facts that don't literally match the query but are semantically related.

Think about:
- Synonyms and rephrased versions
- Inverse/negative framings (if someone asks "what should I use", also search for "what to avoid")
- Related concepts that would inform the answer
- Specific terms someone might have used when storing this knowledge

User query: "${query}"

Respond with ONLY a JSON array of strings. Do not include the original query.`;

  try {
    const variants = await promptJson(prompt, { model: config.llm.extractionModel });

    if (!Array.isArray(variants)) return [query];

    const valid = variants
      .filter((v) => typeof v === 'string' && v.trim())
      .slice(0, MAX_VARIANTS);

    const result = valid.length ? [query, ...valid] : [query];
    setCached(query, result);
    return result;
  } catch (err) {
    console.error('[query-expander] Failed:', err.message);
    return [query];
  }
}

export { expandQuery };
