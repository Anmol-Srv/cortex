import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/llm.js', () => ({
  promptJson: vi.fn(),
  prompt: vi.fn(),
  parseJson: vi.fn(),
}));

import { promptJson } from '../../lib/llm.js';
import { routeQuery } from './query-router.js';

beforeEach(() => {
  vi.clearAllMocks();
  // Reset the module-level LRU cache between tests by varying the query string
});

describe('routeQuery — intent mapping', () => {
  it('preference intent → personal category filters, no graph', async () => {
    promptJson.mockResolvedValueOnce({
      intent: 'preference',
      categories: [],
      entities: [],
      expand: false,
      pointInTime: null,
      reasoning: 'asking about personal preference',
    });

    const result = await routeQuery('what fruit do I like?');
    expect(result.intent).toBe('preference');
    expect(result.categories).toContain('preference');
    expect(result.categories).toContain('opinion');
    expect(result.useGraph).toBe(false);
  });

  it('exploratory intent → graph enabled, expand enabled, higher limit', async () => {
    promptJson.mockResolvedValueOnce({
      intent: 'exploratory',
      categories: [],
      entities: [],
      expand: true,
      pointInTime: null,
      reasoning: 'broad question',
    });

    const result = await routeQuery('tell me everything about our architecture');
    expect(result.intent).toBe('exploratory');
    expect(result.useGraph).toBe(true);
    expect(result.expand).toBe(true);
    expect(result.limit).toBe(15);
  });

  it('entity_lookup intent → useGraph enabled', async () => {
    promptJson.mockResolvedValueOnce({
      intent: 'entity_lookup',
      categories: [],
      entities: ['React'],
      expand: false,
      pointInTime: null,
      reasoning: 'looking up specific entity',
    });

    const result = await routeQuery('React');
    expect(result.intent).toBe('entity_lookup');
    expect(result.useGraph).toBe(true);
  });

  it('temporal intent → pointInTime passed through', async () => {
    promptJson.mockResolvedValueOnce({
      intent: 'temporal',
      categories: [],
      entities: [],
      expand: false,
      pointInTime: '2024-01-01',
      reasoning: 'historical query',
    });

    const result = await routeQuery('what was our stack in January 2024?');
    expect(result.intent).toBe('temporal');
    expect(result.pointInTime).toBe('2024-01-01');
  });

  it('invalid intent from LLM → fallback to factual', async () => {
    promptJson.mockResolvedValueOnce({
      intent: 'INVALID_INTENT',
      categories: [],
      entities: [],
      expand: false,
      pointInTime: null,
      reasoning: '',
    });

    const result = await routeQuery('some query xyz123');
    expect(result.intent).toBe('factual');
    expect(result.useGraph).toBe(false);
  });

  it('LLM throws → fallback to factual', async () => {
    promptJson.mockRejectedValueOnce(new Error('network error'));
    const result = await routeQuery('query that fails abc999');
    expect(result.intent).toBe('factual');
  });
});

describe('routeQuery — LRU cache', () => {
  it('same query hits cache on second call (LLM called only once)', async () => {
    promptJson.mockResolvedValue({
      intent: 'factual',
      categories: [],
      entities: [],
      expand: false,
      pointInTime: null,
      reasoning: '',
    });

    const query = 'unique cache test query ' + Date.now();
    await routeQuery(query);
    await routeQuery(query);
    await routeQuery(query);

    expect(promptJson).toHaveBeenCalledTimes(1);
  });

  it('different queries each call LLM', async () => {
    promptJson.mockResolvedValue({
      intent: 'factual',
      categories: [],
      entities: [],
      expand: false,
      pointInTime: null,
      reasoning: '',
    });

    const ts = Date.now();
    await routeQuery(`query A ${ts}`);
    await routeQuery(`query B ${ts}`);

    expect(promptJson).toHaveBeenCalledTimes(2);
  });
});
