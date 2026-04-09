import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external deps before importing hybrid
vi.mock('../../ingestion/embedder.js', () => ({
  embed: vi.fn().mockResolvedValue(Array(768).fill(0.1)),
  embedBatch: vi.fn().mockResolvedValue([Array(768).fill(0.1)]),
}));

vi.mock('../facts/store.js', () => ({
  recordAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../entities/store.js', () => ({
  findByName: vi.fn().mockResolvedValue(null),
  searchByName: vi.fn().mockResolvedValue([]),
}));

vi.mock('../facts/entity-linker.js', () => ({
  getFactsForEntity: vi.fn().mockResolvedValue([]),
}));

vi.mock('../entities/relations.js', () => ({
  listRelationsForEntity: vi.fn().mockResolvedValue([]),
}));

vi.mock('./graph-enhancement.js', () => ({
  extractEntitiesFromFacts: vi.fn().mockResolvedValue([]),
  findRelatedFacts: vi.fn().mockResolvedValue([]),
  rerank: vi.fn((facts) => facts),
}));

vi.mock('./query-expander.js', () => ({
  expandQuery: vi.fn().mockResolvedValue(['original query']),
}));

vi.mock('../cognitive/query-router.js', () => ({
  routeQuery: vi.fn().mockResolvedValue({
    intent: 'factual',
    categories: [],
    useGraph: false,
    expand: false,
    limit: null,
    pointInTime: null,
    reasoning: 'factual query',
  }),
}));

vi.mock('./vector.js', () => ({
  searchFacts: vi.fn(),
  searchChunks: vi.fn().mockResolvedValue([]),
}));

vi.mock('./keyword.js', () => ({
  searchFacts: vi.fn(),
  searchChunks: vi.fn().mockResolvedValue([]),
}));

import * as vectorSearch from './vector.js';
import * as keywordSearch from './keyword.js';
import { routeQuery } from '../cognitive/query-router.js';
import { search } from './hybrid.js';

const makeFactList = (ids) =>
  ids.map((id) => ({
    id,
    uid: `fact-${id}`,
    content: `Fact number ${id}`,
    category: 'domain_knowledge',
    confidence: 'high',
    importance: 'supplementary',
    namespace: 'default',
    status: 'active',
  }));

beforeEach(() => {
  vi.clearAllMocks();
  // Restore defaults
  routeQuery.mockResolvedValue({
    intent: 'factual',
    categories: [],
    useGraph: false,
    expand: false,
    limit: null,
    pointInTime: null,
    reasoning: '',
  });
});

describe('RRF merge — result deduplication and ranking', () => {
  it('deduplicates facts that appear in both vector and keyword results', async () => {
    const sharedFact = makeFactList([1])[0];
    vectorSearch.searchFacts.mockResolvedValue([sharedFact, ...makeFactList([2, 3])]);
    keywordSearch.searchFacts.mockResolvedValue([sharedFact, ...makeFactList([4, 5])]);

    const result = await search('test query', { namespaces: ['default'], limit: 10 });
    const ids = result.facts.map((f) => f.id);
    const unique = new Set(ids);
    expect(ids.length).toBe(unique.size);  // no duplicates
    expect(ids).toContain(1);               // shared fact is present
  });

  it('fact appearing in both vector and keyword ranks higher than one appearing in only one', async () => {
    const overlap = { ...makeFactList([1])[0], content: 'overlap fact' };
    const vectorOnly = { ...makeFactList([2])[0], content: 'vector only' };
    const keywordOnly = { ...makeFactList([3])[0], content: 'keyword only' };

    vectorSearch.searchFacts.mockResolvedValue([overlap, vectorOnly]);
    keywordSearch.searchFacts.mockResolvedValue([overlap, keywordOnly]);

    const result = await search('some query', { namespaces: ['default'], limit: 5 });
    const ids = result.facts.map((f) => f.id);
    // overlap (id=1) should rank first because it appears in both lists
    expect(ids[0]).toBe(1);
  });

  it('returns empty facts when both searches return nothing', async () => {
    vectorSearch.searchFacts.mockResolvedValue([]);
    keywordSearch.searchFacts.mockResolvedValue([]);

    const result = await search('no results query', { namespaces: ['default'] });
    expect(result.facts).toHaveLength(0);
  });

  it('respects limit parameter', async () => {
    vectorSearch.searchFacts.mockResolvedValue(makeFactList([1, 2, 3, 4, 5, 6, 7, 8]));
    keywordSearch.searchFacts.mockResolvedValue(makeFactList([1, 2, 3]));

    const result = await search('test', { namespaces: ['default'], limit: 3 });
    expect(result.facts.length).toBeLessThanOrEqual(3);
  });
});

describe('RRF merge — result field preservation', () => {
  it('importance field is preserved on merged results', async () => {
    const vitalFact = { ...makeFactList([10])[0], importance: 'vital' };
    const suppFact = { ...makeFactList([11])[0], importance: 'supplementary' };

    vectorSearch.searchFacts.mockResolvedValue([vitalFact, suppFact]);
    keywordSearch.searchFacts.mockResolvedValue([]);

    const result = await search('test', { namespaces: ['default'], limit: 5 });
    const byId = Object.fromEntries(result.facts.map((f) => [f.id, f]));
    expect(byId[10].importance).toBe('vital');
    expect(byId[11].importance).toBe('supplementary');
  });

  it('higher-ranked fact in vector list has higher RRF score than lower-ranked', async () => {
    const top = makeFactList([20])[0];
    const bottom = makeFactList([21])[0];

    // top is rank 0, bottom is rank 5 — significant score difference
    vectorSearch.searchFacts.mockResolvedValue([top, ...makeFactList([99, 98, 97, 96]), bottom]);
    keywordSearch.searchFacts.mockResolvedValue([]);

    const result = await search('test', { namespaces: ['default'], limit: 10 });
    const topFact = result.facts.find((f) => f.id === 20);
    const bottomFact = result.facts.find((f) => f.id === 21);
    expect(topFact.rrfScore).toBeGreaterThan(bottomFact.rrfScore);
  });
});

describe('search — routing integration', () => {
  it('preference route filters by personal categories', async () => {
    routeQuery.mockResolvedValue({
      intent: 'preference',
      categories: ['preference', 'opinion', 'personal'],
      useGraph: false,
      expand: false,
      limit: null,
      pointInTime: null,
      reasoning: '',
    });

    vectorSearch.searchFacts.mockResolvedValue([]);
    keywordSearch.searchFacts.mockResolvedValue([]);

    await search('what fruit do I like?', { namespaces: ['default'] });

    // Verify category filter was passed to vector search
    const vectorCall = vectorSearch.searchFacts.mock.calls[0][1];
    expect(vectorCall.categories).toEqual(['preference', 'opinion', 'personal']);
  });

  it('result includes rrfScore field', async () => {
    const fact = makeFactList([42])[0];
    vectorSearch.searchFacts.mockResolvedValue([fact]);
    keywordSearch.searchFacts.mockResolvedValue([]);

    const result = await search('test', { namespaces: ['default'], limit: 5 });
    expect(result.facts[0]).toHaveProperty('rrfScore');
    expect(typeof result.facts[0].rrfScore).toBe('number');
  });
});
