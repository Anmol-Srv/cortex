import { nanoid } from 'nanoid';

// In-memory job store. Jobs live for 1 hour then are pruned.
// Good enough for a single-process deployment — no Redis required.
const store = new Map();
const JOB_TTL_MS = 3_600_000;

function create(payload) {
  const id = nanoid(12);
  store.set(id, {
    id,
    status: 'queued',
    payload,
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    result: null,
    error: null,
  });
  return id;
}

function get(id) {
  return store.get(id) || null;
}

function update(id, updates) {
  const job = store.get(id);
  if (job) store.set(id, { ...job, ...updates });
}

function prune() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of store.entries()) {
    if (job.createdAt < cutoff) store.delete(id);
  }
}

// Prune stale jobs every 10 minutes
setInterval(prune, 600_000).unref();

export { create, get, update };
