import { spawn } from 'node:child_process';

import config from '../config.js';
import cortexDb from '../db/cortex.js';

const CLI_MODEL_MAP = {
  'claude-haiku-4-5-20251001': 'haiku',
  'claude-sonnet-4-6': 'sonnet',
  'claude-opus-4-6': 'opus',
};

// Approximate cost per 1M tokens by model
const COST_PER_M = {
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4.1-nano': { input: 0.10, output: 0.40 },
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
};

function resolveModel(model) {
  if (model) return model;
  const { provider } = config.llm;
  if (provider === 'openai') return config.llm.openaiModel;
  if (provider === 'claude-cli') return config.llm.cliModel;
  if (provider === 'anthropic') return 'claude-haiku-4-5-20251001';
  return config.llm.ollamaModel;
}

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

function calcCost(model, inputTokens, outputTokens) {
  const rates = COST_PER_M[model];
  if (!rates) return 0;
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}

// --- Logging ---

function logCall({ provider, model, caller, input, response, inputTokens, outputTokens, cost, durationMs, status, error }) {
  cortexDb('llm_log')
    .insert({
      provider,
      model,
      caller,
      input: input?.slice(0, 10000),
      response: response?.slice(0, 10000),
      inputTokens,
      outputTokens,
      cost,
      durationMs,
      status,
      error: error?.slice(0, 2000),
    })
    .catch((err) => console.error('[llm-log] Write failed:', err.message));
}

// --- OpenAI provider ---

async function openaiChat(input, { model, jsonMode = false } = {}) {
  const resolved = resolveModel(model);
  const messages = [{ role: 'user', content: input }];

  // OpenAI requires "json" in the message when using json_object mode
  if (jsonMode && !input.toLowerCase().includes('json')) {
    messages.unshift({ role: 'system', content: 'Respond with valid JSON.' });
  }

  const body = { model: resolved, messages };
  if (jsonMode) body.response_format = { type: 'json_object' };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llm.openaiApiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const text = data.choices[0].message.content.trim();
  const usage = data.usage || {};

  return {
    text,
    inputTokens: usage.prompt_tokens || 0,
    outputTokens: usage.completion_tokens || 0,
    model: resolved,
  };
}

// --- Claude CLI provider ---

function claudeCliChat(input, { model } = {}) {
  const resolved = resolveModel(model);
  const cliModel = CLI_MODEL_MAP[resolved] || resolved;
  const args = ['-p', '--model', cliModel, '--output-format', 'text'];

  return new Promise((resolve, reject) => {
    const proc = spawn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('error', (err) => reject(new Error(`Failed to spawn claude CLI: ${err.message}`)));
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`claude CLI exited ${code}: ${stderr}`));
      else resolve({
        text: stdout.trim(),
        inputTokens: estimateTokens(input),
        outputTokens: estimateTokens(stdout),
        model: cliModel,
      });
    });

    proc.stdin.write(input);
    proc.stdin.end();
  });
}

// --- Ollama provider ---

async function ollamaChat(input, { model, format } = {}) {
  const resolved = resolveModel(model);
  const url = `${config.llm.ollamaHost}/api/chat`;
  const body = {
    model: resolved,
    messages: [{ role: 'user', content: input }],
    stream: false,
  };
  if (format) body.format = format;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama error ${response.status}: ${text}`);
  }

  const data = await response.json();

  return {
    text: data.message.content.trim(),
    inputTokens: data.prompt_eval_count || estimateTokens(input),
    outputTokens: data.eval_count || estimateTokens(data.message.content),
    model: resolved,
  };
}

// --- Anthropic provider ---

let anthropicClient = null;

async function anthropicChat(input, { model } = {}) {
  const resolved = resolveModel(model);
  if (!anthropicClient) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    anthropicClient = new Anthropic({ apiKey: config.llm.apiKey });
  }

  const message = await anthropicClient.messages.create({
    model: resolved,
    max_tokens: 4096,
    messages: [{ role: 'user', content: input }],
  });

  return {
    text: message.content[0].text.trim(),
    inputTokens: message.usage?.input_tokens || estimateTokens(input),
    outputTokens: message.usage?.output_tokens || estimateTokens(message.content[0].text),
    model: resolved,
  };
}

// --- Retry ---

async function withRetry(fn, retries = config.llm.maxRetries) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 10000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// --- Router ---

function chatRaw(input, opts = {}) {
  const { provider } = config.llm;
  if (provider === 'openai') return openaiChat(input, opts);
  if (provider === 'anthropic') return anthropicChat(input, opts);
  if (provider === 'ollama') return ollamaChat(input, opts);
  return claudeCliChat(input, opts);
}

// --- Public API ---

async function prompt(input, { model, caller } = {}) {
  const start = Date.now();
  const provider = config.llm.provider;

  try {
    const result = await withRetry(() => chatRaw(input, { model }));
    const cost = calcCost(result.model, result.inputTokens, result.outputTokens);

    logCall({
      provider, model: result.model, caller,
      input, response: result.text,
      inputTokens: result.inputTokens, outputTokens: result.outputTokens,
      cost, durationMs: Date.now() - start, status: 'success',
    });

    return result.text;
  } catch (err) {
    logCall({
      provider, model: resolveModel(model), caller,
      input, response: null,
      inputTokens: 0, outputTokens: 0,
      cost: 0, durationMs: Date.now() - start, status: 'error', error: err.message,
    });
    throw err;
  }
}

async function promptJson(input, { model, caller } = {}) {
  const start = Date.now();
  const provider = config.llm.provider;

  try {
    const result = await withRetry(() => {
      if (provider === 'openai') return openaiChat(input, { model, jsonMode: true });
      if (provider === 'ollama') return ollamaChat(input, { model, format: 'json' });
      return chatRaw(input, { model });
    });

    const cost = calcCost(result.model, result.inputTokens, result.outputTokens);

    logCall({
      provider, model: result.model, caller,
      input, response: result.text,
      inputTokens: result.inputTokens, outputTokens: result.outputTokens,
      cost, durationMs: Date.now() - start, status: 'success',
    });

    return parseJson(result.text);
  } catch (err) {
    logCall({
      provider, model: resolveModel(model), caller,
      input, response: null,
      inputTokens: 0, outputTokens: 0,
      cost: 0, durationMs: Date.now() - start, status: 'error', error: err.message,
    });
    throw err;
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text.trim());
  } catch { /* not raw JSON */ }

  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) {
    try {
      return JSON.parse(match[1].trim());
    } catch { /* invalid JSON in code block */ }
  }

  const jsonMatch = text.match(/[\[{][\s\S]*[\]}]/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch { /* not valid JSON */ }
  }

  return null;
}

export { prompt, promptJson, parseJson };
