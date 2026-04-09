#!/usr/bin/env node

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { execSync as _execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { config as dotenvConfig } from 'dotenv';

// Package root — works whether run from project dir or globally installed
const PKG_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

// Load env: project .env first, then ~/.cortex/.env as fallback for global installs
const projectEnv = resolve(process.cwd(), '.env');
const globalEnv = join(homedir(), '.cortex', '.env');

if (existsSync(projectEnv)) {
  dotenvConfig({ path: projectEnv, quiet: true });
} else if (existsSync(globalEnv)) {
  dotenvConfig({ path: globalEnv, quiet: true });
}

const [command, ...rest] = process.argv.slice(2);

const HELP = `cortex — Persistent memory for your Claude sessions

Usage:
  cortex <command> [options]

Commands:
  init                     Set up Cortex (DB, env, migrations, Claude integration)
  remember "text"          Save a fact or note to memory
  ingest <file|url|glob>   Ingest documents into the knowledge base
  search "query"           Search the knowledge base
  status                   Show knowledge base statistics
  migrate                  Run database migrations
  reset                    Reset the database (drops all data)
  keys                     Manage REST API keys
  register                 Register as a Claude Code MCP server (advanced)

Options:
  --help                   Show this help message

Run cortex <command> --help for command-specific options.`;

if (!command || command === '--help' || command === '-h') {
  console.log(HELP);
  process.exit(0);
}

const commands = {
  init: runInit,
  remember: runRemember,
  ingest: runIngest,
  search: runSearch,
  status: runStatus,
  migrate: runMigrate,
  reset: runReset,
  keys: runKeys,
  register: runRegister,
};

const handler = commands[command];
if (!handler) {
  console.error(`Unknown command: ${command}\n`);
  console.log(HELP);
  process.exit(1);
}

try {
  await handler(rest);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}

// ─── Init ────────────────────────────────────────────────────────────────────

async function runInit(args) {
  const { createInterface } = await import('node:readline/promises');
  const { stdin: input, stdout: output } = process;
  const fs = await import('node:fs/promises');

  const cortexHome = join(homedir(), '.cortex');
  const envPath = join(cortexHome, '.env');

  console.log('Cortex setup\n');

  // Check prerequisites
  const hasDocker = checkCommand('docker --version');
  if (!hasDocker) {
    console.error('Docker is required but not found. Install Docker Desktop: https://docker.com');
    process.exit(1);
  }

  const hasOllama = checkCommand('ollama --version');

  // Load existing env if present
  const existing = {};
  if (existsSync(envPath)) {
    const content = await fs.readFile(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const [k, ...v] = line.split('=');
      if (k && !k.startsWith('#')) existing[k.trim()] = v.join('=').trim();
    }
  }

  const rl = createInterface({ input, output });

  const llmProvider = await rl.question(
    `LLM provider [openai/ollama/anthropic] (${existing.LLM_PROVIDER || 'openai'}): `,
  ) || existing.LLM_PROVIDER || 'openai';

  let openaiKey = existing.OPENAI_API_KEY || '';
  let anthropicKey = existing.ANTHROPIC_API_KEY || '';

  if (llmProvider === 'openai') {
    openaiKey = await rl.question(`OpenAI API key (${openaiKey ? '***hidden***' : 'required'}): `) || openaiKey;
  } else if (llmProvider === 'anthropic') {
    anthropicKey = await rl.question(`Anthropic API key (${anthropicKey ? '***hidden***' : 'required'}): `) || anthropicKey;
  }

  const embeddingProvider = await rl.question(
    `Embedding provider [ollama/openai] (${existing.EMBEDDING_PROVIDER || (hasOllama ? 'ollama' : 'openai')}): `,
  ) || existing.EMBEDDING_PROVIDER || (hasOllama ? 'ollama' : 'openai');

  const namespace = await rl.question(
    `Default namespace (${existing.DEFAULT_NAMESPACE || 'default'}): `,
  ) || existing.DEFAULT_NAMESPACE || 'default';

  const dbPort = await rl.question(
    `DB port (${existing.CORTEX_DB_PORT || '5433'}): `,
  ) || existing.CORTEX_DB_PORT || '5433';

  rl.close();

  // Write ~/.cortex/.env
  await fs.mkdir(cortexHome, { recursive: true });

  const dbPassword = existing.CORTEX_DB_PASSWORD || generateSecret(24);
  const encryptionKey = existing.CORTEX_ENCRYPTION_KEY || generateSecret(64);

  const envContent = [
    `# Cortex configuration — ${new Date().toISOString().slice(0, 10)}`,
    '',
    `CORTEX_DB_HOST=localhost`,
    `CORTEX_DB_PORT=${dbPort}`,
    `CORTEX_DB_NAME=cortex`,
    `CORTEX_DB_USER=cortex_app`,
    `CORTEX_DB_PASSWORD=${dbPassword}`,
    '',
    `LLM_PROVIDER=${llmProvider}`,
    openaiKey ? `OPENAI_API_KEY=${openaiKey}` : '# OPENAI_API_KEY=sk-...',
    anthropicKey ? `ANTHROPIC_API_KEY=${anthropicKey}` : '# ANTHROPIC_API_KEY=sk-ant-...',
    '',
    `EMBEDDING_PROVIDER=${embeddingProvider}`,
    `OLLAMA_HOST=http://localhost:11434`,
    '',
    `DEFAULT_NAMESPACE=${namespace}`,
    `CORTEX_ENCRYPTION_KEY=${encryptionKey}`,
    '',
    `# Model overrides (leave empty to use provider defaults)`,
    `# LLM_EXTRACTION_MODEL=`,
    `# LLM_DECISION_MODEL=`,
    `# LLM_ENTITY_MODEL=`,
  ].join('\n');

  await fs.writeFile(envPath, envContent, 'utf8');
  console.log(`\nConfig written to ${envPath}`);

  // Start Docker container
  console.log('\nStarting PostgreSQL + pgvector...');
  const containerName = 'cortex-memory-db';
  const containerRunning = checkDockerContainer(containerName);

  if (!containerRunning) {
    const dockerRun = `docker run -d \
      --name ${containerName} \
      -p ${dbPort}:5432 \
      -e POSTGRES_DB=cortex \
      -e POSTGRES_USER=cortex_app \
      -e POSTGRES_PASSWORD=${dbPassword} \
      -v cortex_memory_data:/var/lib/postgresql/data \
      --restart unless-stopped \
      pgvector/pgvector:pg17`;

    try {
      _execSync(dockerRun, { stdio: 'pipe' });
      console.log('  Container started.');
    } catch (err) {
      // Container may already exist but be stopped
      try {
        _execSync(`docker start ${containerName}`, { stdio: 'pipe' });
        console.log('  Container restarted.');
      } catch {
        console.error(`  Failed to start container: ${err.message}`);
        process.exit(1);
      }
    }
  } else {
    console.log('  Container already running.');
  }

  // Wait for DB to be ready
  console.log('  Waiting for DB to be ready...');
  await waitForDb(dbPort, dbPassword, 30);
  console.log('  DB is ready.');

  // Reload env so migrations can find the DB
  dotenvConfig({ path: envPath, override: true });

  // Run migrations
  console.log('\nRunning migrations...');
  const migrationDir = join(PKG_DIR, 'src', 'db', 'migrations');
  const cortexDb = (await import('./db/cortex.js')).default;
  const [batch, migrations] = await cortexDb.migrate.latest({ directory: migrationDir });
  if (migrations.length) {
    console.log(`  Ran ${migrations.length} migration(s).`);
  } else {
    console.log('  Already up to date.');
  }
  await cortexDb.destroy();

  // Write ~/.claude/CLAUDE.md so Claude automatically uses cortex
  console.log('\nConfiguring Claude Code...');
  await writeClaudeMd();

  console.log(`
Setup complete!

  Config:  ${envPath}
  Data:    Docker volume 'cortex_memory_data'
  Claude:  ~/.claude/CLAUDE.md updated

Claude will now automatically use Cortex as its memory. Start a new Claude Code
session and it will search your knowledge base before answering and save
important things you tell it.

To save something now:
  cortex remember "I prefer TypeScript over JavaScript"

To ingest a document:
  cortex ingest <file-or-url>

To search manually:
  cortex search "your query"`);
}

// ─── Remember ────────────────────────────────────────────────────────────────

async function runRemember(args) {
  const flags = args.filter((a) => a.startsWith('--'));
  const textArgs = args.filter((a) => !a.startsWith('--'));

  if (flags.includes('--help')) {
    console.log(`cortex remember — Save a fact or note to memory

Usage:
  cortex remember "text"
  echo "text" | cortex remember

Examples:
  cortex remember "I prefer tabs over spaces"
  cortex remember "Project deadline is March 15"
  cortex remember "PostgreSQL runs on port 5434 in dev"`);
    process.exit(0);
  }

  // Accept text as argument or from stdin
  let text = textArgs.join(' ').trim();

  if (!text && !process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    text = Buffer.concat(chunks).toString('utf8').trim();
  }

  if (!text) {
    console.error('Provide text to remember: cortex remember "your fact"');
    process.exit(1);
  }

  const { ingestDocument } = await import('./ingestion/pipeline.js');
  const config = (await import('./config.js')).default;
  const cortexDb = (await import('./db/cortex.js')).default;

  const result = await ingestDocument({
    content: text,
    namespace: config.defaults.namespace,
    classify: true,
  });

  if (result.skipped) {
    console.log('Already known.');
  } else if (result.route === 'noise') {
    console.log('Too short to remember.');
  } else {
    const added = result.facts?.added ?? 0;
    const updated = result.facts?.updated ?? 0;
    if (added + updated > 0) {
      console.log(`Remembered. (${added} new${updated ? `, ${updated} updated` : ''})`);
    } else {
      console.log('Already known.');
    }
  }

  await cortexDb.destroy();
}

// ─── CLAUDE.md ───────────────────────────────────────────────────────────────

async function writeClaudeMd() {
  const fs = await import('node:fs/promises');
  const claudeDir = join(homedir(), '.claude');
  const claudeMdPath = join(claudeDir, 'CLAUDE.md');

  await fs.mkdir(claudeDir, { recursive: true });

  const marker = '<!-- cortex-memory -->';
  const block = `${marker}
## Memory (Cortex)

You have a persistent memory store available via the \`cortex\` CLI.

**Before answering** questions about this user's projects, preferences, past decisions,
or anything that might have been discussed before — search your memory first:
\`\`\`
! cortex search "relevant query"
\`\`\`

**When the user tells you something worth remembering** (a preference, a decision,
a fact about their work, something they want you to know) — save it:
\`\`\`
! cortex remember "the fact in one clear sentence"
\`\`\`

**When the user asks you to remember something explicitly** — always save it immediately.

**Rules:**
- Search before answering context-dependent questions, not factual/general ones
- Save facts as short, self-contained statements (not summaries of the conversation)
- Don't search or save for trivial exchanges (greetings, simple calculations, etc.)
- If search returns nothing relevant, answer from your own knowledge and say so
${marker}`;

  let existing = '';
  if (existsSync(claudeMdPath)) {
    existing = await fs.readFile(claudeMdPath, 'utf8');
  }

  // Replace existing cortex block if present, otherwise append
  if (existing.includes(marker)) {
    const updated = existing.replace(new RegExp(`${marker}[\\s\\S]*?${marker}`), block);
    await fs.writeFile(claudeMdPath, updated, 'utf8');
  } else {
    const separator = existing.trim() ? '\n\n' : '';
    await fs.writeFile(claudeMdPath, `${existing}${separator}${block}\n`, 'utf8');
  }

  console.log(`  Written to ${claudeMdPath}`);
}

// ─── Register MCP ────────────────────────────────────────────────────────────

async function runRegister(args) {
  if (args.includes('--help')) {
    console.log(`cortex register — Register Cortex as a Claude Code MCP server

Usage:
  cortex register [--print]

Options:
  --print   Print the config JSON without modifying files`);
    process.exit(0);
  }

  const globalEnvPath = join(homedir(), '.cortex', '.env');
  const envPath = existsSync(globalEnvPath) ? globalEnvPath : resolve(process.cwd(), '.env');
  await doRegister(PKG_DIR, envPath, args.includes('--print'));
}

async function doRegister(pkgDir, envPath, printOnly = false) {
  const fs = await import('node:fs/promises');

  const serverPath = join(pkgDir, 'src', 'server.js');

  const mcpEntry = {
    command: process.execPath,
    args: [serverPath, '--mcp'],
    env: { DOTENV_CONFIG_PATH: envPath },
  };

  const configJson = JSON.stringify({ mcpServers: { cortex: mcpEntry } }, null, 2);

  if (printOnly) {
    console.log('\nAdd this to your Claude Code MCP config:\n');
    console.log(configJson);
    return;
  }

  // Try to auto-register via `claude mcp add`
  const claudeAvailable = checkCommand('claude --version');
  if (claudeAvailable) {
    try {
      // Remove existing entry first (idempotent)
      try { _execSync('claude mcp remove cortex', { stdio: 'pipe' }); } catch { /* not registered yet */ }
      _execSync(
        `claude mcp add cortex -s user -- ${process.execPath} ${serverPath} --mcp`,
        { stdio: 'pipe', env: { ...process.env, DOTENV_CONFIG_PATH: envPath } },
      );
      console.log('Registered cortex MCP server via `claude mcp add`.');
      console.log(`  Server: ${serverPath}`);
      return;
    } catch {
      // Fall through to manual instructions
    }
  }

  // Auto-detect Claude config files and update them
  const configPaths = getClaudeConfigPaths();
  let registered = false;

  for (const configPath of configPaths) {
    if (!existsSync(configPath)) continue;

    try {
      const raw = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(raw);
      config.mcpServers = config.mcpServers || {};
      config.mcpServers.cortex = mcpEntry;
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
      console.log(`Registered cortex MCP server in ${configPath}`);
      registered = true;
      break;
    } catch {
      // Try next path
    }
  }

  if (!registered) {
    console.log('Could not auto-register. Add this to your Claude Code MCP configuration:\n');
    console.log(configJson);
    console.log('\nOr run: claude mcp add cortex -- node ' + serverPath + ' --mcp');
  }
}

function getClaudeConfigPaths() {
  const home = homedir();
  const platform = process.platform;

  const paths = [
    // Claude Code CLI config
    join(home, '.config', 'claude', 'claude_code_config.json'),
    join(home, '.claude', 'settings.json'),
  ];

  if (platform === 'darwin') {
    paths.push(
      join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
    );
  } else if (platform === 'linux') {
    paths.push(
      join(home, '.config', 'Claude', 'claude_desktop_config.json'),
    );
  } else if (platform === 'win32') {
    paths.push(
      join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json'),
    );
  }

  return paths;
}

// ─── Ingest ──────────────────────────────────────────────────────────────────

async function runIngest(args) {
  const flags = args.filter((a) => a.startsWith('--'));
  const inputs = args.filter((a) => !a.startsWith('--'));

  if (!inputs.length || flags.includes('--help')) {
    console.log(`cortex ingest — Ingest documents into the knowledge base

Usage:
  cortex ingest <file|url|glob> [options]

Options:
  --namespace=<ns>    Target namespace (default: from config)
  --skip-facts        Skip fact extraction
  --skip-entities     Skip entity linking

Examples:
  cortex ingest ./docs/README.md
  cortex ingest "docs/**/*.md"
  cortex ingest https://example.com/page
  cortex ingest file1.md file2.md --namespace=engineering`);
    process.exit(0);
  }

  const { ingestDocument } = await import('./ingestion/pipeline.js');
  const { readSource, readSources } = await import('./ingestion/sources/file.js');
  const { fetchSource } = await import('./ingestion/sources/url.js');
  const cortexDb = (await import('./db/cortex.js')).default;

  const namespace = flags.find((f) => f.startsWith('--namespace='))?.split('=')[1];
  const skipFacts = flags.includes('--skip-facts');
  const skipEntities = flags.includes('--skip-entities');

  const results = { success: [], failed: [], skipped: [] };
  const startTime = Date.now();

  for (const input of inputs) {
    try {
      let sources;

      if (input.startsWith('http://') || input.startsWith('https://')) {
        sources = [await fetchSource(input)];
      } else if (input.includes('*')) {
        sources = await readSources(input);
        if (!sources.length) {
          console.log(`No files matched: ${input}`);
          continue;
        }
      } else {
        sources = [await readSource(input)];
      }

      for (const source of sources) {
        console.log(`Ingesting: ${source.title}`);
        const result = await ingestDocument({
          content: source.content,
          title: source.title,
          sourcePath: source.sourcePath,
          sourceType: source.sourceType,
          contentType: source.contentType,
          namespace,
          metadata: source.metadata,
          skipFacts,
          skipEntities,
        });

        if (result.skipped) {
          results.skipped.push(source.title);
          console.log(`  Skipped (unchanged)`);
        } else {
          results.success.push(source.title);
          console.log(`  Done — ${result.chunkCount} chunks, ${result.facts.total} facts (${result.facts.added} new, ${result.facts.updated} updated)`);
        }
      }
    } catch (err) {
      console.error(`  Failed: ${input} — ${err.message}`);
      results.failed.push({ input, error: err.message });
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s — ${results.success.length} ingested, ${results.skipped.length} skipped, ${results.failed.length} failed`);

  await cortexDb.destroy();
}

// ─── Search ──────────────────────────────────────────────────────────────────

async function runSearch(args) {
  const flags = args.filter((a) => a.startsWith('--'));
  const query = args.filter((a) => !a.startsWith('--')).join(' ');

  if (!query || flags.includes('--help')) {
    console.log(`cortex search — Search the knowledge base

Usage:
  cortex search "query" [options]

Options:
  --namespace=<ns>    Filter by namespace (comma-separated for multiple)
  --limit=<n>         Max results (default: 10)
  --no-graph          Disable graph enhancement

Examples:
  cortex search "authentication flow"
  cortex search "deploy process" --namespace=engineering
  cortex search "API design" --limit=5`);
    process.exit(0);
  }

  const { search } = await import('./memory/search/hybrid.js');
  const config = (await import('./config.js')).default;
  const cortexDb = (await import('./db/cortex.js')).default;

  const nsFlag = flags.find((f) => f.startsWith('--namespace='))?.split('=')[1];
  const namespaces = nsFlag ? nsFlag.split(',') : [config.defaults.namespace];
  const limit = Number(flags.find((f) => f.startsWith('--limit='))?.split('=')[1] || 10);
  const useGraph = !flags.includes('--no-graph');

  const { facts, chunks } = await search(query, { namespaces, limit, useGraph });

  if (facts.length) {
    console.log(`\nFacts (${facts.length}):`);
    for (const fact of facts) {
      const score = fact.rrfScore ? ` [${fact.rrfScore}]` : '';
      console.log(`  ${fact.content}${score}`);
    }
  }

  if (chunks.length) {
    console.log(`\nChunks (${chunks.length}):`);
    for (const chunk of chunks) {
      const preview = chunk.content?.slice(0, 120).replace(/\n/g, ' ');
      const score = chunk.rrfScore ? ` [${chunk.rrfScore}]` : '';
      console.log(`  ${preview}...${score}`);
    }
  }

  if (!facts.length && !chunks.length) {
    console.log('No results found.');
  }

  await cortexDb.destroy();
}

// ─── Status ──────────────────────────────────────────────────────────────────

async function runStatus(args) {
  if (args.includes('--help')) {
    console.log(`cortex status — Show knowledge base statistics

Usage:
  cortex status [--namespace=<ns>]`);
    process.exit(0);
  }

  const { getStats } = await import('./memory/documents/store.js');
  const { getEntityCount } = await import('./memory/entities/store.js');
  const { getRelationCount } = await import('./memory/entities/relations.js');
  const { getFactCount } = await import('./memory/facts/store.js');
  const cortexDb = (await import('./db/cortex.js')).default;

  const namespace = args.find((a) => a.startsWith('--namespace='))?.split('=')[1];

  const [docStats, factCount, documents, people, topics, relations] = await Promise.all([
    getStats(namespace),
    getFactCount(namespace),
    getEntityCount('document'),
    getEntityCount('person'),
    getEntityCount('topic'),
    getRelationCount(),
  ]);

  console.log(`Cortex Knowledge Base${namespace ? ` (${namespace})` : ''}`);
  console.log(`  Documents:  ${docStats.documentCount}`);
  console.log(`  Chunks:     ${docStats.totalChunks}`);
  console.log(`  Facts:      ${factCount} active`);
  console.log(`  Entities:   ${documents} documents, ${people} people, ${topics} topics`);
  console.log(`  Relations:  ${relations}`);

  await cortexDb.destroy();
}

// ─── Migrate ─────────────────────────────────────────────────────────────────

async function runMigrate(args) {
  if (args.includes('--help')) {
    console.log(`cortex migrate — Run database migrations

Usage:
  cortex migrate [--rollback]`);
    process.exit(0);
  }

  const cortexDb = (await import('./db/cortex.js')).default;
  const migrationDir = join(PKG_DIR, 'src', 'db', 'migrations');

  if (args.includes('--rollback')) {
    const [batch, migrations] = await cortexDb.migrate.rollback({ directory: migrationDir });
    console.log(`Rolled back batch ${batch}: ${migrations.length} migrations`);
    for (const m of migrations) console.log(`  ${m}`);
  } else {
    const [batch, migrations] = await cortexDb.migrate.latest({ directory: migrationDir });
    if (migrations.length) {
      console.log(`Ran batch ${batch}: ${migrations.length} migrations`);
      for (const m of migrations) console.log(`  ${m}`);
    } else {
      console.log('Already up to date.');
    }
  }

  await cortexDb.destroy();
}

// ─── Reset ───────────────────────────────────────────────────────────────────

async function runReset(args) {
  if (args.includes('--help')) {
    console.log(`cortex reset — Reset the database (drops all data)

Usage:
  cortex reset [--confirm]

Requires --confirm flag to prevent accidental data loss.`);
    process.exit(0);
  }

  if (!args.includes('--confirm')) {
    console.error('This will delete ALL data. Run with --confirm to proceed.');
    process.exit(1);
  }

  const cortexDb = (await import('./db/cortex.js')).default;
  const migrationDir = join(PKG_DIR, 'src', 'db', 'migrations');

  await cortexDb.migrate.rollback({ directory: migrationDir }, true);
  await cortexDb.migrate.latest({ directory: migrationDir });

  console.log('Database reset complete. All migrations re-applied.');
  await cortexDb.destroy();
}

// ─── Keys ────────────────────────────────────────────────────────────────────

async function runKeys(args) {
  const subcommand = args[0];

  if (!subcommand || args.includes('--help')) {
    console.log(`cortex keys — Manage REST API keys

Usage:
  cortex keys list
  cortex keys create --name=<name>
  cortex keys revoke <key-prefix>`);
    process.exit(0);
  }

  const { listApiKeys, createApiKey, revokeApiKey } = await import('./api/auth.js');
  const cortexDb = (await import('./db/cortex.js')).default;

  if (subcommand === 'list') {
    const keys = await listApiKeys();
    if (!keys.length) {
      console.log('No API keys.');
    } else {
      for (const k of keys) {
        console.log(`  ${k.name} — ${k.prefix}*** (created ${k.createdAt?.toISOString?.().slice(0, 10) ?? 'unknown'})`);
      }
    }
  } else if (subcommand === 'create') {
    const name = args.find((a) => a.startsWith('--name='))?.split('=')[1] || 'default';
    const { key, record } = await createApiKey(name);
    console.log(`Created: ${key}`);
    console.log(`(Store this — it won't be shown again)`);
  } else if (subcommand === 'revoke') {
    const prefix = args[1];
    if (!prefix) { console.error('Provide a key prefix to revoke.'); process.exit(1); }
    await revokeApiKey(prefix);
    console.log(`Revoked key starting with: ${prefix}`);
  } else {
    console.error(`Unknown subcommand: ${subcommand}`);
    process.exit(1);
  }

  await cortexDb.destroy();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function checkCommand(cmd) {
  try {
    _execSync(cmd, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function checkDockerContainer(name) {
  try {
    const out = _execSync(`docker inspect --format '{{.State.Running}}' ${name}`, { stdio: 'pipe' }).toString().trim();
    return out === 'true';
  } catch {
    return false;
  }
}

async function waitForDb(port, password, maxSeconds) {
  for (let i = 0; i < maxSeconds; i++) {
    try {
      _execSync(`docker exec cortex-memory-db pg_isready -U cortex_app`, { stdio: 'pipe' });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('DB did not become ready in time');
}

function generateSecret(bytes) {
  return randomBytes(bytes).toString('hex');
}
