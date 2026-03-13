import { spawn } from 'node:child_process';

import config from '../config.js';

const MODEL_MAP = {
  'claude-haiku-4-5-20251001': 'haiku',
  'claude-sonnet-4-6': 'sonnet',
  'claude-opus-4-6': 'opus',
};

function resolveModel(model) {
  const m = model || config.llm.extractionModel;
  return MODEL_MAP[m] || m;
}

async function prompt(input, { model } = {}) {
  const resolvedModel = resolveModel(model);
  const args = ['-p', '--model', resolvedModel, '--output-format', 'text'];

  return new Promise((resolve, reject) => {
    const proc = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('error', (err) => reject(new Error(`Failed to spawn claude CLI: ${err.message}`)));
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`claude CLI exited ${code}: ${stderr}`));
      else resolve(stdout.trim());
    });

    proc.stdin.write(input);
    proc.stdin.end();
  });
}

async function promptJson(input, { model } = {}) {
  const text = await prompt(input, { model });
  return parseJson(text);
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
