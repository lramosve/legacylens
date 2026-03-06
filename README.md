# LegacyLens

AI-powered codebase explorer for legacy systems. Ask natural-language questions about unfamiliar codebases and get instant, sourced answers.

**Live demo:** [legacylens-iota.vercel.app](https://legacylens-iota.vercel.app)

## What It Does

LegacyLens lets developers explore the **GnuCOBOL 3.2 compiler** (~300,000 lines of C, COBOL, and Bison) through natural-language queries. It combines semantic search with LLM analysis to provide sourced, cited answers.

### Analysis Modes

- **Explain** — Plain-English code explanations with source citations
- **Document** — Structured API documentation generation
- **Translate** — Modern language equivalents (Python, Rust, TypeScript)
- **Business Logic** — Extract validation rules and business logic from code

### Key Features

- Hybrid search (BM25 + vector similarity via Reciprocal Rank Fusion)
- Streaming answers with `[Source N]` citations linking to exact files and lines
- Fast mode (Haiku, ~12s) and Quality mode (Sonnet, ~18s)
- Client-side answer caching with instant restore on repeat queries
- Dark/light theme with OS auto-detection
- Copy, export (Markdown/PDF), and feedback widgets
- Related follow-up questions generated automatically
- Search history per analysis mode
- Keyboard shortcuts (`/` to focus search, `Ctrl+Shift+Delete` to clear cache)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, Tailwind CSS 4 |
| Vector DB | Supabase (PostgreSQL + pgvector) |
| Embeddings | Voyage Code 3 (1024 dimensions) |
| LLM | Claude Haiku 4.5 (fast) / Claude Sonnet 4 (quality) |
| Orchestration | LangChain |
| Deployment | Vercel |

## Architecture

```
User Query
  → COBOL abbreviation expansion (26 terms)
  → Voyage Code 3 embedding (78ms avg)
  → Supabase RPC: BM25 + vector similarity → RRF fusion (k=50, 10 results)
  → Top-N chunks to Claude (3 fast / 5 quality)
  → Streaming SSE with [Source N] citations
  → Client-side batched rendering (requestAnimationFrame)
```

### Ingestion Pipeline

Language-specific chunkers that respect code boundaries:

- **C files** — Function-level splitting with preamble extraction
- **Headers** — Block-level splitting at `#define`, `typedef`, `struct` boundaries
- **COBOL** — Division / Section / Paragraph hierarchy via column-aware parsing
- **Bison/Yacc** — Section splitting at `%%` delimiters, per-grammar-rule chunking
- **Config** — Blank-line separated macro groups and config sections

Target: 800 tokens/chunk, max 1,500, min 20, 3-line overlap.

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase project with pgvector extension
- API keys: Anthropic, Voyage AI

### Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your API keys:
#   NEXT_PUBLIC_SUPABASE_URL=
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=
#   SUPABASE_SERVICE_ROLE_KEY=
#   VOYAGE_API_KEY=
#   ANTHROPIC_API_KEY=

# Ingest the GnuCOBOL codebase
npm run ingest

# Start dev server
npm run dev
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run ingest` | Run the ingestion pipeline |
| `npm run elbow` | Run elbow analysis for parameter tuning |

## Documentation

- [Pre-Search and Discovery](docs/Pre-Search%20and%20Discovery.pdf) — Initial research, problem definition, and discovery findings
- [RAG Architecture](docs/RAG%20Architecture.pdf) — Vector DB selection, embedding strategy, chunking approach, retrieval pipeline, failure modes, and performance results
- [AI Cost Analysis](docs/AI%20Cost%20Analysis.pdf) — Development costs, per-query breakdown, and production cost projections at scale

## Security

- Zod schema validation on all API inputs
- Per-IP sliding-window rate limiting (10–30 req/min by route)
- 55-second streaming timeout with graceful partial-answer delivery
- Server-side secrets never exposed to the client

## License

MIT

---

Built with Next.js, Supabase pgvector, Voyage Code 3, and Claude.
