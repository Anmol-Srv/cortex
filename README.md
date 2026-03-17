<div align="center">

# Cortex

**Organizational memory for LLMs.**

Ingest documents, code, and URLs. Extract structured knowledge. Answer any org question via MCP or REST.

[![Node](https://img.shields.io/badge/Node.js-24-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![pgvector](https://img.shields.io/badge/pgvector-768d-4169E1)](https://github.com/pgvector/pgvector)
[![MCP](https://img.shields.io/badge/MCP-v0.2.0-blueviolet)](https://modelcontextprotocol.io/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

[The Problem](#the-problem) · [What Cortex Does](#what-cortex-does) · [Getting Started](#getting-started) · [How It Works](#how-it-works) · [MCP Tools](#mcp-tools) · [FAQ](#faq)

</div>

---

## The Problem

The answer to most org questions lives across 3–4 sources simultaneously.

A developer asks: *"How does our deploy pipeline handle rollbacks?"*
The answer requires the CI/CD config in the codebase, the runbook in a doc, and a past incident postmortem with the workaround. No single place has the full picture. Every team member, every AI tool starts from zero.

Cortex fixes this. It pulls from every source, distills knowledge into atomic, searchable facts, and serves it to any LLM-powered tool over MCP or REST — with a single query.

---

## What Cortex Does

Cortex is not a chatbot. It's not a vector database. It's the **shared knowledge backend** that any AI agent on the team queries before answering an org-level question.

**Ingest once. Query from anywhere.**

<details>
<summary><strong>Three-Layer Knowledge Store</strong></summary>

Most RAG systems only store raw chunks. Cortex stores three layers because different questions need different types of knowledge.

| Layer | What's Stored | Good For |
|-------|--------------|----------|
| **Chunks** | 512-token text blocks with contextual prefixes and vector embeddings | "Show me the full refund policy section" |
| **Facts** | LLM-extracted atomic statements — categorized, deduplicated, importance-scored, temporally tracked | "What are ALL conditions that trigger a deploy rollback?" |
| **Entity Graph** | Named nodes (documents, people, topics) with typed relations | "What topics has this author written about?" |

The same source document produces all three layers. Chunks give breadth. Facts give precision. The graph gives relationships.

Each fact also carries an **importance** score (`vital` or `supplementary`) and **temporal validity** (`valid_from`/`valid_until`), so Cortex knows which facts are essential and which are still current.

</details>

<details>
<summary><strong>Hybrid Search</strong></summary>

Vector search alone misses exact identifiers. Keyword search alone misses semantic queries. Cortex runs both and merges them.

| Query | Vector | Keyword | Hybrid |
|-------|--------|---------|--------|
| "how does authentication work?" | Finds semantically related content | Finds exact "authentication" mentions | Best of both |
| `user_sessions` table | Misses it — not semantically rich | Finds exact match | Keyword saves it |
| "why deploys fail" | Finds related error patterns | Misses — "fail" isn't in "cannot deploy" | Vector saves it |

After merging via **Reciprocal Rank Fusion (RRF)**, vital facts are promoted over supplementary ones at equal scores. The top facts are then enriched by traversing the entity graph — discovering related facts that vector search would never surface.

Search supports **point-in-time queries** (`pointInTime` param) to return only facts that were valid at a specific timestamp — useful when you need to know what was true on a particular date, not just what's true now.

Results can also be returned in a **compact format** (`format="compact"`) that groups facts by category with one line per category and no IDs or metadata — optimized for token-efficient LLM consumption.

</details>

<details>
<summary><strong>AUDM Fact Deduplication</strong></summary>

Facts are never blindly overwritten. Every new fact is compared against what's already known:

| Similarity | Action |
|-----------|--------|
| > 0.92 | **Skip** — already known, no change |
| 0.80 – 0.92 | **LLM decides** — update existing wording or add as new |
| Contradicts existing | **Contradict** — mark old fact, add new one, flag for human review |
| < 0.80 | **Add** — genuinely new knowledge |

Contradictions are kept, not deleted. When two documents disagree, Cortex surfaces the conflict instead of silently picking one. Contradicted and superseded facts automatically receive a `valid_until` timestamp, creating a temporal trail of how knowledge evolved.

</details>

<details>
<summary><strong>4-Stage Entity Deduplication</strong></summary>

The entity graph is only useful if "Alice", "Alice Chen", and "Alice C." all resolve to the same node. Cortex runs a cascade before creating any new entity:

1. **Exact name match** — case-insensitive, O(1) indexed lookup
2. **Fuzzy string match** — Levenshtein similarity ≥ 0.85, then LLM verifies
3. **Embedding similarity** — pgvector cosine ≥ 0.85, then LLM verifies
4. **Create new** — no match found

Merges are non-lossy: all relations redirect, fact links merge, mention counts sum, and a `merged_with` FK preserves history.

</details>

<details>
<summary><strong>Namespace Access Control</strong></summary>

Every record belongs to a namespace. Every query filters on the consumer's allowed namespaces — a single `WHERE namespace = ANY(?)` clause, no join table.

```
default         — general knowledge
engineering     — architecture, code patterns, incidents
docs/public     — user-facing documentation
docs/internal   — internal runbooks, processes
```

A public-facing bot sees only `docs/public`. A developer's Claude Code sees everything. Same data, same query path, different views.

</details>

<details>
<summary><strong>Contextual Chunk Enrichment</strong></summary>

Raw chunks lose context when read in isolation. Cortex enriches each chunk with a **contextual prefix** — a 1-2 sentence summary that situates the chunk within the full document.

During ingestion, all chunks are sent in a single LLM call along with the document text. The returned prefixes are stored alongside the chunk, prepended to content for embedding (so vector search understands context), and included in the tsvector index (so keyword search benefits too).

This is similar to Anthropic's [Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) technique. Skip it with `--skip-contextualization` when cost matters more than retrieval quality.

</details>

<details>
<summary><strong>Fact Access Tracking</strong></summary>

Every search automatically tracks which facts were accessed. Cortex records `access_count` and `last_accessed_at` per fact, building a heat map of your organization's most-queried knowledge.

Use the `status` MCP tool or `GET /api/facts/hot` to see the most frequently accessed facts — useful for identifying core institutional knowledge, prioritizing fact accuracy, or understanding what questions your team asks most.

</details>

<details>
<summary><strong>Format-Agnostic Ingestion</strong></summary>

Cortex auto-detects content format and applies the appropriate parser:

| Format | Parser | Sections By |
|--------|--------|-------------|
| Markdown | `parsers/markdown.js` | Headings |
| HTML | `parsers/html.js` | Stripped text blocks |
| Source code | `parsers/code.js` | Functions / classes |
| JSON | `parsers/json-parser.js` | Readable text |
| Plain text | `parsers/text.js` | Paragraphs |

Sources can be local files (single or glob), URLs, or raw text injected directly. The pipeline doesn't know or care about the input format — parsers handle that.

</details>

---

## Getting Started

### Prerequisites

- **Node.js** 24+
- **Docker** (for the Cortex PostgreSQL + pgvector container)
- **Ollama** running locally with `nomic-embed-text` pulled
- **Claude CLI** (`claude`) installed and authenticated (used for LLM calls)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env .env.local   # edit with your settings

# 3. Start the database (pgvector/pgvector:pg17 on port 5434)
docker compose up -d

# 4. Run migrations
cortex migrate
# or: npx knex migrate:latest

# 5. Pull the embedding model
ollama pull nomic-embed-text
```

### Running

```bash
# MCP server — for Claude Code (stdio transport)
node src/server.js --mcp

# REST API — for external consumers
node src/server.js

# Development with auto-restart
npm run dev
```

### Claude Code Integration

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "cortex": {
      "command": "node",
      "args": ["src/server.js", "--mcp"],
      "cwd": "/path/to/cortex"
    }
  }
}
```

---

## How It Works

```
Data Sources (files, URLs, raw text)
        │
        ▼
 Ingestion Pipeline (6 steps)
 parse → hash → chunk+contextualize+embed → extract facts → link entities → generate MD
        │
        ▼
 Three-Layer Knowledge Store (PostgreSQL + pgvector)
 ├── chunk       — 512-token blocks, contextual prefixes, vector(768) + tsvector
 ├── fact        — atomic statements, importance-scored, temporally tracked, AUDM-deduplicated
 └── entity/relation — typed graph, 4-stage dedup, temporal tracking
        │
        ├── MCP Server (stdio)  ──► Claude Code
        └── REST API (HTTP)     ──► External consumers
```

Cortex uses a single PostgreSQL database with pgvector for all knowledge storage. LLM calls (fact extraction, chunk contextualization, AUDM decisions, entity verification) happen at ingestion time via the Claude CLI. Search is pure database queries — no LLM latency at query time. Every search automatically tracks fact access counts for hot-knowledge analytics.

<details>
<summary><strong>Ingestion Pipeline (6 steps)</strong></summary>

```
[1/6] Parse content       — auto-detect format, extract structured sections
[2/6] Check for changes   — SHA-256 content hash, skip unchanged documents
[3/6] Chunk + context     — section-aware splitting, contextual prefix enrichment, batch embed
[4/6] Extract facts       — LLM-based atomic fact extraction with importance scoring
[5/6] Link entities       — 4-stage dedup cascade + typed relations
[6/6] Generate markdown   — structured knowledge file to local filesystem or S3
```

</details>

<details>
<summary><strong>Project Structure</strong></summary>

```
src/
├── ingestion/
│   ├── pipeline.js              # Generic document ingestion orchestrator
│   ├── contextualizer.js        # Contextual chunk prefix enrichment (single LLM call)
│   ├── parsers/                 # Format-specific: markdown, text, HTML, code, JSON
│   ├── sources/                 # Content connectors: file, URL, raw
│   ├── chunker.js               # Format-aware text splitting
│   └── embedder.js              # Ollama/OpenAI embedding abstraction
│
├── memory/
│   ├── facts/                   # Fact CRUD + AUDM dedup + entity-linker + categories
│   ├── entities/                # Entity CRUD + resolver + fuzzy/embedding matchers
│   │                            # + merger + linker + relations + traversal
│   ├── chunks/                  # Chunk CRUD
│   ├── documents/               # Document registry + hash tracking
│   └── search/                  # vector + keyword + hybrid (RRF) + graph-enhancement
│
├── mcp/
│   ├── server.js                # Tool registration, stdio transport
│   └── tools/                   # 7 tools — thin wrappers over domain logic
│
├── generators/
│   ├── markdown/                # Knowledge file renderer + index generators
│   └── output.js                # Output storage (local filesystem or S3)
│
├── api/
│   ├── auth.js                  # API key auth plugin + key management
│   └── routes/                  # ingest, search, entities, facts, documents, status
│
├── db/
│   ├── cortex.js                # Knex connection, camelCase mappers
│   └── migrations/              # 15 .cjs migration files
│
├── lib/                         # LLM wrapper, error classes
├── scripts/                     # ingest.js, test-search.js
├── cli.js                       # CLI (cortex ingest|search|status|migrate|reset|keys)
├── config.js                    # Environment config + defaults
├── app.js                       # Fastify app setup
└── server.js                    # Entry point (--mcp for MCP, else REST)
```

</details>

<details>
<summary><strong>Tech Stack</strong></summary>

| Layer | Technology |
|:------|:-----------|
| **Runtime** | Node.js 24 (ES modules) |
| **Framework** | Fastify 5 |
| **Database** | PostgreSQL 17 + pgvector (Docker, port 5434) |
| **ORM** | Knex.js 3 with camelCase ↔ snake_case mappers |
| **Embeddings** | Ollama `nomic-embed-text` 768d (swappable to OpenAI) |
| **Fact extraction** | Claude CLI (haiku/sonnet models, spawned as subprocess) |
| **MCP** | `@modelcontextprotocol/sdk` stdio transport |
| **Validation** | Zod (MCP tool schemas) |
| **Utilities** | lodash-es, dayjs |
| **Testing** | Vitest |

</details>

---

## MCP Tools

7 tools in 4 tiers. Tool descriptions are keyword-rich so Claude Code finds them via its built-in tool search.

### Retrieval

| Tool | What it does |
|------|-------------|
| `search` | Hybrid semantic + keyword search over facts and chunks. Supports `minConfidence`, `useGraph`, `pointInTime` (temporal filter), and `format` (`full` or `compact`). Vital facts are promoted in results. |
| `search_entity` | Find entities by name or list all entities of a given type (document, person, topic). |

### Traversal

| Tool | What it does |
|------|-------------|
| `traverse_graph` | Navigate entity relations: `neighbors`, `path` (shortest path between two entities), `related` (all reachable within N hops). |

### Detail

| Tool | What it does |
|------|-------------|
| `get_fact_context` | Full fact detail — linked entities, source documents, provenance. |
| `get_entity_context` | Full entity detail — all relations (in + out), connected facts, graph metrics. |

### Operations

| Tool | What it does |
|------|-------------|
| `status` | Knowledge base stats — document, chunk, fact, entity counts, and most-accessed (hot) facts. |
| `ingest` | Ingest a document into the knowledge base. Accepts raw content, a file path, or a URL. |

Tools are designed to chain: `search` → `get_entity_context` → `traverse_graph` → deeper facts.

---

## REST API

Auth: Bearer token via `Authorization` header. If no API keys exist in the database, auth is bypassed (dev mode).

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/ingest` | Ingest a single document (content, URL, or file path) |
| `POST` | `/api/ingest/batch` | Ingest multiple documents |
| `GET` | `/api/search` | Hybrid search (`query`, `limit`, `namespaces`, `useGraph`, `minConfidence`) |
| `GET` | `/api/entities` | List/search entities (`query`, `entityType`, `namespace`, `limit`) |
| `GET` | `/api/entities/:id` | Entity detail with relations + facts |
| `GET` | `/api/entities/:id/neighbors` | Entity neighbors (`depth`, `limit`) |
| `GET` | `/api/entities/:id/related` | Related entities (`maxDepth`, `relationType`, `limit`) |
| `GET` | `/api/graph/path` | Shortest path between entities (`from`, `to`, `maxDepth`) |
| `GET` | `/api/facts/hot` | Most frequently accessed facts (`namespace`, `limit`, `since`) |
| `GET` | `/api/facts/:uid` | Fact detail with entities, relations, source documents |
| `GET` | `/api/documents` | List documents (`namespace`, `sourceType`, `limit`) |
| `GET` | `/api/documents/:uid` | Document detail |
| `DELETE` | `/api/documents/:uid` | Delete a document |
| `GET` | `/api/status` | Knowledge base stats (`namespace`) |
| `GET` | `/health` | Health check |

---

## CLI

```bash
cortex ingest <file|url|glob> [options]    # Ingest documents
  --namespace=<ns>                          # Target namespace
  --skip-facts                              # Skip fact extraction
  --skip-entities                           # Skip entity linking
  --skip-markdown                           # Skip markdown generation
  --skip-contextualization                  # Skip contextual chunk enrichment

cortex search "query" [options]            # Search the knowledge base
  --namespace=<ns>                          # Filter by namespace
  --limit=<n>                               # Max results (default: 10)
  --no-graph                                # Disable graph enhancement

cortex status [--namespace=<ns>]           # Knowledge base stats
cortex migrate [--rollback]                # Run/rollback migrations
cortex reset --confirm                     # Reset database (drops all data)
cortex keys list|create|revoke             # Manage API keys
```

---

## FAQ

<details>
<summary><strong>Why not just use a vector database?</strong></summary>

Vector databases store chunks and let you search by similarity. That's Layer 1. The intelligence in Cortex is in Layers 2 and 3 — atomic fact extraction, AUDM deduplication, and the entity graph. A vector DB is part of the infrastructure; it's not the product.

</details>

<details>
<summary><strong>Why PostgreSQL over a dedicated graph database like Neo4j?</strong></summary>

The entity graph at typical org scale (thousands of entities, not millions) is well within what recursive CTEs on PostgreSQL can handle. Adding Neo4j would mean a second database dependency. pgvector gives us vector search on the same rows as keyword search, in one query, with no joins.

</details>

<details>
<summary><strong>What happens when the same document is ingested twice?</strong></summary>

SHA-256 content hashing means re-ingesting an unchanged document is a no-op — detected and skipped in milliseconds. If the content changed, old chunks are deleted and recreated, new facts go through AUDM (duplicates skip, updates merge, contradictions flag), and the markdown file is regenerated.

</details>

<details>
<summary><strong>How are contradictions handled?</strong></summary>

When a new fact contradicts an existing one, both are kept. The old fact is marked `contradicted` and the new one is added with `status: active`. The contradiction is logged in the audit history and flagged for human review — Cortex surfaces disagreements instead of silently resolving them.

</details>

<details>
<summary><strong>Can I swap Ollama for OpenAI embeddings?</strong></summary>

Yes. Set `EMBEDDING_PROVIDER=openai` and `OPENAI_API_KEY` in your `.env`. The embedder service abstracts the provider — no code changes needed. Dimensions stay at 768 (or set `EMBEDDING_DIMENSIONS` if you switch models).

</details>

---

## Contributing

Read [CLAUDE.md](./CLAUDE.md) before writing any code — it covers service boundaries, naming conventions, and coding standards in full.

The core rule: **domain stores own their logic**. The ingestion pipeline calls `memory/facts/store.js` to save facts; it never writes to the database directly. MCP tools and API routes parse input, call the domain function, and format the response — no business logic.

---

<div align="center">

Powered by [pgvector](https://github.com/pgvector/pgvector), [Claude](https://anthropic.com), and [MCP](https://modelcontextprotocol.io)

</div>
