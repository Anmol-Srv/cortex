<div align="center">

# Cortex

**Airtribe's organizational memory — built for AI.**

Ingest sessions, code, and docs. Extract structured knowledge. Answer any org question via MCP.

[![Node](https://img.shields.io/badge/Node.js-24-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![pgvector](https://img.shields.io/badge/pgvector-768d-4169E1)](https://github.com/pgvector/pgvector)
[![MCP](https://img.shields.io/badge/MCP-v0.2.0-blueviolet)](https://modelcontextprotocol.io/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

[The Problem](#the-problem) · [What Cortex Does](#what-cortex-does) · [Getting Started](#getting-started) · [How It Works](#how-it-works) · [MCP Tools](#mcp-tools) · [Status](#status--roadmap)

</div>

---

## The Problem

The answer to most org questions lives across 3–4 sources simultaneously.

A developer asks: *"Why can't this user start their session?"*
The answer requires the validation logic in the codebase, the enrollment business rules in a doc, and a past support ticket with the workaround. No single place has the full picture. Every team member, every support agent, every AI tool starts from zero.

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
| **Chunks** | 512-token text blocks with vector embeddings | "Show me the full refund policy section" |
| **Facts** | LLM-extracted atomic statements, categorized and deduplicated | "What are ALL conditions that prevent session start?" |
| **Entity Graph** | Named nodes (sessions, courses, people, topics) with typed relations | "What has Rahul taught across all cohorts?" |

The same source document produces all three layers. Chunks give breadth. Facts give precision. The graph gives relationships.

</details>

<details>
<summary><strong>Hybrid Search</strong></summary>

Vector search alone misses exact identifiers. Keyword search alone misses semantic queries. Cortex runs both and merges them.

| Query | Vector | Keyword | Hybrid |
|-------|--------|---------|--------|
| "how does authentication work?" | Finds semantically related content | Finds exact "authentication" mentions | Best of both |
| `session_start_emails` table | Misses it — not semantically rich | Finds exact match | Keyword saves it |
| "why sessions fail" | Finds related error patterns | Misses — "fail" isn't in "cannot start" | Vector saves it |

After merging via **Reciprocal Rank Fusion (RRF)**, the top facts are enriched by traversing the entity graph — discovering related facts that vector search would never surface.

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

Contradictions are kept, not deleted. When two documents disagree, Cortex surfaces the conflict instead of silently picking one. Inspired by Guru's expert verification model.

</details>

<details>
<summary><strong>4-Stage Entity Deduplication</strong></summary>

The entity graph is only useful if "Rahul", "Rahul Sharma", and "Rahul S." all resolve to the same node. Cortex runs a cascade before creating any new entity:

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
org/public      — FAQ, user-facing docs
org/internal    — architecture, code patterns, incidents
org/admin       — sensitive configs, financials
product/lms     — LMS-specific session knowledge
product/vision  — admin dashboard logic
```

A WhatsApp bot sees only `org/public`. A developer's Claude Code sees everything. Same data, same query path, different views.

</details>

<details>
<summary><strong>Session Vertical</strong></summary>

The first and deepest ingestion vertical. A single session pull spans 15+ mycohort-api tables — metadata, recording paths, VTT transcripts, chat logs, attendance records, feedback, analytics, video chapters, Zoom events, and mentorship context.

The pipeline produces two outputs:
- **PostgreSQL** — chunks and facts indexed for hybrid search
- **DigitalOcean Spaces** — structured markdown files with cross-session memlinks, navigable by course, speaker, and topic

Facts include the mentor's name in every statement ("Rahul covered normalization...") so queries like "what has Rahul taught?" work via both semantic search and graph traversal.

</details>

---

## Getting Started

### Prerequisites

- **Node.js** 24+
- **Docker** (for the Cortex PostgreSQL + pgvector container)
- **Ollama** running locally with `nomic-embed-text` pulled
- Read-only access to the mycohort-api PostgreSQL database

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy and configure environment variables
cp .env.example .env

# 3. Start the database (pgvector/pgvector:pg17 on port 5433)
docker compose up -d

# 4. Run migrations
npx knex migrate:latest

# 5. Pull the embedding model
ollama pull nomic-embed-text
```

### Running

```bash
# MCP server — for Claude Code (stdio transport)
node src/server.js --mcp

# REST API — for Tether, WhatsApp bot, dashboard
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
Data Sources (sessions, code, docs)
        │
        ▼
 Ingestion Pipeline
 fetch → compile → chunk+embed → extract facts → link entities → generate MD
        │
        ▼
 Three-Layer Knowledge Store (PostgreSQL + pgvector)
 ├── chunk       — 512-token blocks, vector(768) + tsvector
 ├── fact        — atomic statements, AUDM-deduplicated, confidence-scored
 └── entity/relation — typed graph, 4-stage dedup, temporal tracking
        │
        ├── MCP Server (stdio)  ──► Claude Code (developers)
        └── REST API (HTTP)     ──► Tether, WhatsApp bot, dashboard
```

Cortex runs two database connections — its own PostgreSQL for knowledge storage, and a read-only connection to mycohort-api for ingestion. The LLM calls (fact extraction, AUDM, entity linking) happen at ingestion time. Search is pure database queries — no LLM latency at query time.

<details>
<summary><strong>Session Pipeline (9 steps)</strong></summary>

```
[1/9] Fetch session data — parallel queries across 15+ mycohort-api tables
[2/9] Download remote content — VTT transcripts + chat logs from DigitalOcean
[3/9] Compile into unified SessionProfile
[4/9] Chunk + embed — section-aware splitting, batch embed via Ollama
[5/9] Extract facts — Claude Haiku, structured output via tool_use
[6/9] AUDM deduplication — compare each fact against existing knowledge
[7/9] Link entities — 4-stage dedup cascade + typed relations
[8/9] Generate markdown — structured session file with memlinks, upload to DO Spaces
[9/9] Update indexes — _index.md, _by-course/, _by-speaker/
```

</details>

<details>
<summary><strong>Project Structure</strong></summary>

```
src/
├── ingestion/
│   ├── pipelines/session/    # Session vertical (index.js is the only public API)
│   ├── chunker.js            # Format-aware text splitting (shared)
│   └── embedder.js           # Ollama/OpenAI abstraction
│
├── memory/
│   ├── facts/                # Fact CRUD + AUDM + entity-linker + categories
│   ├── entities/             # Entity CRUD + resolver + fuzzy/embedding matchers
│   │                         # + merger + linker + relations + traversal
│   ├── chunks/               # Chunk CRUD
│   ├── documents/            # Document registry + hash tracking
│   └── search/               # vector + keyword + hybrid (RRF) + graph-enhancement
│
├── mcp/
│   ├── server.js             # Tool registration, stdio transport (v0.2.0)
│   └── tools/                # 7 tools — thin wrappers over domain logic
│
├── generators/
│   ├── markdown/             # Session MD renderer + index file generator
│   └── uploader.js           # DigitalOcean Spaces upload
│
├── db/
│   ├── cortex.js             # Read/write, camelCase mappers
│   ├── mycohort.js           # Read-only, for ingestion
│   └── migrations/           # 9 .cjs migration files
│
└── lib/                      # query-validator, pii-filter, claude-cli, errors
```

</details>

<details>
<summary><strong>Tech Stack</strong></summary>

| Layer | Technology |
|:------|:-----------|
| **Runtime** | Node.js 24 (ES modules) |
| **Framework** | Fastify 5 |
| **Database** | PostgreSQL 17 + pgvector (Docker, port 5433) |
| **ORM** | Knex.js 3 with camelCase ↔ snake_case mappers |
| **Embeddings** | Ollama `nomic-embed-text` 768d (swappable to OpenAI) |
| **Fact extraction** | Claude Haiku via `@anthropic-ai/sdk` (tool_use, ~$0.001/doc) |
| **MCP** | `@modelcontextprotocol/sdk` stdio transport |
| **Utilities** | lodash-es, dayjs |
| **Testing** | Vitest |

</details>

---

## MCP Tools

7 tools in 4 tiers. Tool descriptions are keyword-rich so Claude Code finds them via its built-in tool search.

### Retrieval

| Tool | What it does |
|------|-------------|
| `search` | Hybrid semantic + keyword search over facts and chunks. Supports `minConfidence` and `useGraph` for entity-enriched results. |
| `search_entity` | Find entities by name or list all entities of a given type (session, course, person, topic). |

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
| `status` | Knowledge base stats — document, chunk, fact, and entity counts. |
| `ingest` | Trigger the full 9-step ingestion pipeline for a session UID. |

Tools are designed to chain: `search` → `get_entity_context` → `traverse_graph` → deeper facts.

---

## Status & Roadmap

**What's done:**

- [x] PostgreSQL schema + 9 migrations (document, chunk, fact, entity, relation, fact_entity, history)
- [x] Embedder service — Ollama with OpenAI fallback, single interface
- [x] Session pipeline — 9-step, covers 15+ mycohort-api tables, VTT/chat from DO Spaces
- [x] Hybrid search — pgvector cosine + tsvector ts_rank + RRF merge
- [x] Graph-enhanced search — entity traversal enriches top results
- [x] Fact extraction — Claude Haiku, structured output, 6 session-specific categories
- [x] AUDM deduplication — auto-skip, auto-add, LLM arbitration, contradiction tracking
- [x] 4-stage entity deduplication — exact → fuzzy → embedding → create
- [x] Entity graph — 4 types, 5 relation types, temporal tracking, non-lossy merge
- [x] Markdown generation + DigitalOcean upload with memlinked index files
- [x] MCP server v0.2.0 — 7 tools in 4 tiers

**What's next:**

- [ ] Bulk ingestion with BullMQ (parallel processing, two-phase pipeline)
- [ ] REST API with namespace-based access control
- [ ] Connect tether-agent (Slack), WhatsApp bot, admin dashboard
- [ ] Additional verticals: code ingestion, document ingestion

---

## FAQ

<details>
<summary><strong>Why not just use a vector database?</strong></summary>

Vector databases store chunks and let you search by similarity. That's Layer 1. The intelligence in Cortex is in Layers 2 and 3 — atomic fact extraction, AUDM deduplication, and the entity graph. A vector DB is part of the infrastructure; it's not the product.

</details>

<details>
<summary><strong>Why PostgreSQL over a dedicated graph database like Neo4j?</strong></summary>

The entity graph at Airtribe's scale (thousands of entities, not millions) is well within what recursive CTEs on PostgreSQL can handle. Adding Neo4j would mean a third database dependency. pgvector gives us vector search on the same rows as keyword search, in one query, with no joins.

</details>

<details>
<summary><strong>What happens when the same session is ingested twice?</strong></summary>

SHA-256 content hashing means re-ingesting an unchanged session is a no-op — detected and skipped in milliseconds. If the content changed, old chunks are deleted and recreated, new facts go through AUDM (duplicates skip, updates merge, contradictions flag), and the markdown file is regenerated.

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

The core rule: **domain stores own their logic**. The session pipeline calls `memory/facts/store.js` to save facts; it never writes to the database directly. MCP tools parse input, call the domain function, and format the response — no business logic.

New verticals get their own folder under `src/ingestion/pipelines/`. The memory layer (`facts/`, `entities/`, `search/`) is vertical-agnostic and stays unchanged.

---

<div align="center">

Built at [Airtribe](https://airtribe.network) · Powered by [pgvector](https://github.com/pgvector/pgvector), [Claude](https://anthropic.com), and [MCP](https://modelcontextprotocol.io)

</div>
