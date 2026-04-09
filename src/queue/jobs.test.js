import { describe, it, expect, vi, beforeEach } from 'vitest';

// jobs.js is pure in-memory — no mocks needed
import { create, get, update } from './jobs.js';

describe('jobs', () => {
  it('create() returns a string id and stores the job as queued', () => {
    const id = create({ type: 'ingest', url: 'https://example.com' });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);

    const job = get(id);
    expect(job).not.toBeNull();
    expect(job.status).toBe('queued');
    expect(job.result).toBeNull();
    expect(job.error).toBeNull();
    expect(job.createdAt).toBeLessThanOrEqual(Date.now());
  });

  it('get() returns null for unknown id', () => {
    expect(get('does-not-exist')).toBeNull();
  });

  it('update() patches job fields', () => {
    const id = create({ type: 'ingest' });
    update(id, { status: 'running', startedAt: Date.now() });
    const job = get(id);
    expect(job.status).toBe('running');
    expect(job.startedAt).toBeDefined();
  });

  it('update() sets result and completed status', () => {
    const id = create({ type: 'ingest' });
    update(id, { status: 'completed', result: { factsExtracted: 10 }, completedAt: Date.now() });
    const job = get(id);
    expect(job.status).toBe('completed');
    expect(job.result.factsExtracted).toBe(10);
  });

  it('update() on unknown id is a no-op', () => {
    expect(() => update('ghost-id', { status: 'failed' })).not.toThrow();
  });

  it('each create() returns a unique id', () => {
    const ids = new Set(Array.from({ length: 20 }, () => create({})));
    expect(ids.size).toBe(20);
  });
});
