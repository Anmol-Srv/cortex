import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mocks before any imports
vi.mock('../../lib/llm.js', () => ({
  promptJson: vi.fn(),
  prompt: vi.fn(),
  parseJson: vi.fn(),
}));

import { promptJson } from '../../lib/llm.js';
import { classifyInput } from './input-classifier.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('classifyInput — heuristic fast-paths (no LLM)', () => {
  it('empty string → noise', async () => {
    const result = await classifyInput('');
    expect(result.route).toBe('noise');
    expect(promptJson).not.toHaveBeenCalled();
  });

  it('whitespace only → noise', async () => {
    const result = await classifyInput('   ');
    expect(result.route).toBe('noise');
    expect(promptJson).not.toHaveBeenCalled();
  });

  it('2 chars → noise (below NOISE_MIN_LENGTH=3)', async () => {
    const result = await classifyInput('hi');
    expect(result.route).toBe('noise');
    expect(promptJson).not.toHaveBeenCalled();
  });

  it('content longer than 2000 chars → knowledge without LLM call', async () => {
    const longContent = 'a'.repeat(2001);
    const result = await classifyInput(longContent);
    expect(result.route).toBe('knowledge');
    expect(promptJson).not.toHaveBeenCalled();
  });
});

describe('classifyInput — LLM routing', () => {
  it('short preference → thought with facts', async () => {
    promptJson.mockResolvedValueOnce({
      route: 'thought',
      facts: [
        { content: 'I prefer mango over apple', category: 'preference', confidence: 'high', importance: 'vital' },
      ],
      entities: ['mango', 'apple'],
      reasoning: 'Personal food preference',
    });

    const result = await classifyInput('I prefer mango over apple');
    expect(result.route).toBe('thought');
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0].content).toBe('I prefer mango over apple');
    expect(result.facts[0].category).toBe('preference');
  });

  it('fact with invalid category is filtered out', async () => {
    promptJson.mockResolvedValueOnce({
      route: 'thought',
      facts: [
        { content: 'valid fact', category: 'preference', confidence: 'high', importance: 'vital' },
        { content: 'bad category fact', category: 'NOT_A_REAL_CATEGORY', confidence: 'high', importance: 'vital' },
      ],
      entities: [],
      reasoning: 'test',
    });

    const result = await classifyInput('some short text');
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0].content).toBe('valid fact');
  });

  it('invalid confidence value is coerced to high', async () => {
    promptJson.mockResolvedValueOnce({
      route: 'thought',
      facts: [{ content: 'test fact', category: 'preference', confidence: 'very_high', importance: 'vital' }],
      entities: [],
      reasoning: '',
    });

    const result = await classifyInput('test input');
    expect(result.facts[0].confidence).toBe('high');
  });

  it('LLM returns invalid route → fallback to knowledge', async () => {
    promptJson.mockResolvedValueOnce({ route: 'garbage', facts: [], entities: [], reasoning: '' });
    const result = await classifyInput('some content');
    expect(result.route).toBe('knowledge');
  });

  it('LLM throws error → fallback to knowledge', async () => {
    promptJson.mockRejectedValueOnce(new Error('API timeout'));
    const result = await classifyInput('some content');
    expect(result.route).toBe('knowledge');
  });

  it('knowledge route → facts array is empty (only thought route extracts facts)', async () => {
    promptJson.mockResolvedValueOnce({
      route: 'knowledge',
      facts: [{ content: 'fact that should be ignored', category: 'preference', confidence: 'high', importance: 'vital' }],
      entities: [],
      reasoning: 'document content',
    });

    const result = await classifyInput('some medium length content here');
    expect(result.route).toBe('knowledge');
    expect(result.facts).toHaveLength(0);
  });
});
