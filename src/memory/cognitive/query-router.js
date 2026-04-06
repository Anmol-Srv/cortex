import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { promptJson } from '../../lib/llm.js';
import config from '../../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = join(__dirname, '../../../prompts/query-router.md');

const CACHE_MAX_SIZE = 200;
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

const VALID_INTENTS = ['preference', 'factual', 'entity_lookup', 'exploratory', 'temporal'];

const INTENT_DEFAULTS = {
  preference: { categories: ['preference', 'opinion', 'personal'], expand: false, useGraph: false, limit: null },
  factual: { categories: [], expand: false, useGraph: false, limit: null },
  entity_lookup: { categories: [], expand: false, useGraph: true, limit: null },
  exploratory: { categories: [], expand: true, useGraph: true, limit: 15 },
  temporal: { categories: [], expand: false, useGraph: false, limit: null },
};

async function routeQuery(query) {
  const cacheKey = query.trim().toLowerCase();
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const systemPrompt = await readFile(PROMPT_PATH, 'utf8');

  const input = `${systemPrompt}

---

Query: ${query}

---

Respond with ONLY a JSON object: { "intent": "preference|factual|entity_lookup|exploratory|temporal", "categories": [...], "entities": [...], "expand": bool, "pointInTime": null or "YYYY-MM-DD", "reasoning": "..." }`;

  try {
    const result = await promptJson(input, { model: config.llm.extractionModel });

    if (!result || !VALID_INTENTS.includes(result.intent)) {
      const fb = buildDecision('factual', {});
      setCached(cacheKey, fb);
      return fb;
    }

    const defaults = INTENT_DEFAULTS[result.intent];
    const decision = {
      intent: result.intent,
      categories: Array.isArray(result.categories) && result.categories.length ? result.categories : defaults.categories,
      entities: Array.isArray(result.entities) ? result.entities : [],
      expand: typeof result.expand === 'boolean' ? result.expand : defaults.expand,
      useGraph: defaults.useGraph,
      limit: defaults.limit,
      pointInTime: result.pointInTime || null,
      reasoning: result.reasoning || '',
    };

    setCached(cacheKey, decision);
    return decision;
  } catch (err) {
    console.error('[query-router] Failed:', err.message);
    return buildDecision('factual', { reasoning: `Fallback — ${err.message}` });
  }
}

function buildDecision(intent, overrides = {}) {
  const defaults = INTENT_DEFAULTS[intent];
  return {
    intent,
    categories: defaults.categories,
    entities: [],
    expand: defaults.expand,
    useGraph: defaults.useGraph,
    limit: defaults.limit,
    pointInTime: null,
    reasoning: '',
    ...overrides,
  };
}

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

export { routeQuery };
