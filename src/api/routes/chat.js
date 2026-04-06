import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { AppError } from '../../lib/errors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_CONFIG = join(__dirname, '..', 'mcp-chat-config.json');

const SYSTEM_PROMPT = `You are a knowledge assistant powered by Cortex, an organizational memory system.

You have access to the Cortex MCP tools. Use them to answer questions:
- **search** — hybrid search across facts and document chunks. Always start here.
- **search_entity** — find entities (people, topics, documents) by name or type.
- **traverse_graph** — explore entity relationships (neighbors, paths, related entities).
- **get_fact_context** — get full detail on a specific fact (provenance, entities, source documents).
- **get_entity_context** — get full detail on an entity (relations, facts, mentions).
- **status** — check knowledge base statistics.

Guidelines:
- Always search the knowledge base before answering. Do not guess.
- Cite facts using [fact:uid] format when referencing specific knowledge.
- If multiple searches would help, do them.
- If the knowledge base doesn't have relevant information, say so honestly.
- Be concise and direct.`;

const chatSchema = {
  body: {
    type: 'object',
    required: ['messages'],
    properties: {
      messages: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['role', 'content'],
          properties: {
            role: { type: 'string', enum: ['user', 'assistant'] },
            content: { type: 'string', minLength: 1 },
          },
        },
      },
    },
  },
};

async function handleChat(request, reply) {
  const { messages } = request.body;

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage?.content) {
    throw new AppError({ errorCode: 'BAD_REQUEST', message: 'Last message must have content' });
  }

  const history = messages.slice(0, -1);
  const conversationContext = history.length
    ? history.map((m) => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`).join('\n\n') +
      '\n\nHuman: ' + lastMessage.content
    : lastMessage.content;

  reply.raw.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const proc = spawn('claude', [
    '-p',
    '--model', 'haiku',
    '--output-format', 'text',
    '--system-prompt', SYSTEM_PROMPT,
    '--mcp-config', MCP_CONFIG,
    '--allowedTools', 'mcp__cortex__search,mcp__cortex__search_entity,mcp__cortex__traverse_graph,mcp__cortex__get_fact_context,mcp__cortex__get_entity_context,mcp__cortex__status',
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: process.cwd(),
  });

  proc.stdout.on('data', (chunk) => {
    reply.raw.write(chunk);
  });

  proc.stderr.on('data', () => {
    // ignore stderr noise from MCP startup
  });

  proc.on('close', () => {
    reply.raw.end();
  });

  proc.on('error', (err) => {
    reply.raw.write(`Error: ${err.message}`);
    reply.raw.end();
  });

  proc.stdin.write(conversationContext);
  proc.stdin.end();
}

export default async function chatRoutes(app) {
  app.post('/api/chat', { schema: chatSchema }, handleChat);
}
