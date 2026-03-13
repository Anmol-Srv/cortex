import config from '../config.js';

const { provider, model, dimensions, ollamaHost, openaiApiKey } = config.embedding;

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
  const embeddings = [];
  for (const text of texts) {
    const res = await fetch(`${ollamaHost}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: text }),
    });
    if (!res.ok) {
      throw new Error(`Ollama embed failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    embeddings.push(data.embeddings[0]);
  }
  return embeddings;
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
