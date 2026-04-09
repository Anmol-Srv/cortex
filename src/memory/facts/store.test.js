import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted runs before vi.mock factories — safe to reference in both factory and tests
const { mockRaw, mockChain, mockFact } = vi.hoisted(() => {
  const mockFact = { id: 1, uid: 'fact-test-001', content: 'test fact', category: 'preference', status: 'active' };

  const mockChain = {
    insert: vi.fn(),
    where: vi.fn(),
    whereIn: vi.fn(),
    update: vi.fn(),
    returning: vi.fn(),
  };
  Object.values(mockChain).forEach((fn) => fn.mockReturnValue(mockChain));
  mockChain.returning.mockResolvedValue([mockFact]);
  mockChain.update.mockResolvedValue(1);

  const mockRaw = vi.fn();

  return { mockRaw, mockChain, mockFact };
});

vi.mock('../../ingestion/embedder.js', () => ({
  embed: vi.fn(),
  embedBatch: vi.fn(),
}));

vi.mock('../../lib/llm.js', () => ({
  prompt: vi.fn(),
  promptJson: vi.fn(),
  parseJson: vi.fn(),
}));

vi.mock('../../db/cortex.js', () => ({
  default: Object.assign(vi.fn(() => mockChain), {
    raw: mockRaw,
    fn: { now: () => 'NOW()' },
  }),
}));

import { embed } from '../../ingestion/embedder.js';
import { prompt as llmPrompt } from '../../lib/llm.js';
import { saveFact } from './store.js';

const FAKE_VEC = Array(768).fill(0.1);

beforeEach(() => {
  vi.clearAllMocks();
  // Restore chain defaults after clearAllMocks
  Object.values(mockChain).forEach((fn) => fn.mockReturnValue(mockChain));
  mockChain.returning.mockResolvedValue([mockFact]);
  mockChain.update.mockResolvedValue(1);
  embed.mockResolvedValue(FAKE_VEC);
});

const baseArgs = {
  content: 'I like mango better than apple',
  category: 'preference',
  confidence: 'high',
  importance: 'vital',
  namespace: 'default',
  sourceDocumentIds: [1],
  sourceSection: 'preference',
};

// findSimilar uses cortexDb.raw; insertFact also calls cortexDb.raw for search_vector update
function mockFindSimilar(rows) {
  mockRaw
    .mockResolvedValueOnce({ rows })      // findSimilar query
    .mockResolvedValueOnce({ rows: [] }); // UPDATE search_vector (after insertFact)
}

describe('saveFact — AUDM decision branches', () => {
  it('no similar facts → ADD', async () => {
    mockFindSimilar([]);
    const result = await saveFact(baseArgs);
    expect(result.action).toBe('ADD');
    expect(result.fact).toBeDefined();
  });

  it('uses pre-computed embedding when provided (no embed() call)', async () => {
    mockFindSimilar([]);
    await saveFact({ ...baseArgs, embedding: FAKE_VEC });
    expect(embed).not.toHaveBeenCalled();
  });

  it('similarity >= 0.88 → SKIP without LLM call', async () => {
    mockRaw.mockResolvedValueOnce({
      rows: [{ id: 2, uid: 'fact-existing', content: 'I like mango', similarity: 0.92, status: 'active' }],
    });

    const result = await saveFact(baseArgs);
    expect(result.action).toBe('SKIP');
    expect(llmPrompt).not.toHaveBeenCalled();
  });

  it('similarity < 0.65 → ADD without LLM call', async () => {
    mockRaw
      .mockResolvedValueOnce({
        rows: [{ id: 2, uid: 'fact-existing', content: 'completely unrelated', similarity: 0.50, status: 'active' }],
      })
      .mockResolvedValueOnce({ rows: [] }); // search_vector update

    const result = await saveFact(baseArgs);
    expect(result.action).toBe('ADD');
    expect(llmPrompt).not.toHaveBeenCalled();
  });

  it('similarity in [0.65, 0.88) + LLM says UPDATE → UPDATE (new fact inserted, old superseded)', async () => {
    mockRaw
      .mockResolvedValueOnce({
        rows: [{ id: 2, uid: 'fact-old', content: 'I like apples', similarity: 0.72, status: 'active' }],
      })
      .mockResolvedValueOnce({ rows: [] }); // search_vector for inserted fact
    llmPrompt.mockResolvedValueOnce('DECISION: UPDATE — new fact extends existing');

    const result = await saveFact(baseArgs);
    expect(result.action).toBe('UPDATE');
    expect(result.supersededId).toBe(2);
    expect(result.fact).toBeDefined();
    expect(llmPrompt).toHaveBeenCalledTimes(1);
  });

  it('similarity in [0.65, 0.88) + LLM says CONTRADICT → CONTRADICT', async () => {
    mockRaw
      .mockResolvedValueOnce({
        rows: [{ id: 3, uid: 'fact-stale', content: 'We use MySQL', similarity: 0.70, status: 'active' }],
      })
      .mockResolvedValueOnce({ rows: [] });
    llmPrompt.mockResolvedValueOnce('CONTRADICT — directly contradicts existing fact');

    const result = await saveFact(baseArgs);
    expect(result.action).toBe('CONTRADICT');
    expect(result.contradictedId).toBe(3);
    expect(result.fact).toBeDefined();
  });

  it('"CONTRADICTION" (longer form) also parses as CONTRADICT', async () => {
    mockRaw
      .mockResolvedValueOnce({
        rows: [{ id: 4, uid: 'fact-4', content: 'old content', similarity: 0.68, status: 'active' }],
      })
      .mockResolvedValueOnce({ rows: [] });
    llmPrompt.mockResolvedValueOnce('This is a CONTRADICTION of the existing fact');

    const result = await saveFact(baseArgs);
    expect(result.action).toBe('CONTRADICT');
  });

  it('similarity in [0.65, 0.88) + LLM returns neither UPDATE nor CONTRADICT → ADD', async () => {
    mockRaw
      .mockResolvedValueOnce({
        rows: [{ id: 5, uid: 'fact-5', content: 'related but different', similarity: 0.67, status: 'active' }],
      })
      .mockResolvedValueOnce({ rows: [] });
    llmPrompt.mockResolvedValueOnce('These are separate facts, add as new');

    const result = await saveFact(baseArgs);
    expect(result.action).toBe('ADD');
  });
});
