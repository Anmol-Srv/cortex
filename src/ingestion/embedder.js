import { chunk } from 'lodash-es';

import config from '../config.js';

const { provider, model, dimensions, ollamaHost, openaiApiKey } = config.embedding;

const OLLAMA_BATCH_SIZE = 50;

async function embed(text) {
  const [result] = await embedBatch([text]);
  return result;
}

async function embedBatch(texts) {
  if (provider === 'openai') {
    return embedOpenAI(texts);
  }
  return embedOllama(texts);
}

async function embedOllama(texts) {
  const batches = chunk(texts, OLLAMA_BATCH_SIZE);
  const allEmbeddings = [];

  for (const batch of batches) {
    const res = await fetch(`${ollamaHost}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: batch }),
    });
    if (!res.ok) {
      throw new Error(`Ollama embed failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    allEmbeddings.push(...data.embeddings);
  }

  return allEmbeddings;
}

async function embedOpenAI(texts) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({ model, input: texts }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI embed failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

export { embed, embedBatch, dimensions };
