# User Testing

Testing surface, validation approach, and resource cost classification.

**What belongs here:** How to test the app manually/via agent-browser, setup steps, resource costs, gotchas.

---

## Validation Surface

### Web Application (Primary)
- **URL**: http://localhost:3100
- **Tool**: agent-browser for UI validation
- **Setup**: Start Next.js dev server via `node node_modules/next/dist/bin/next dev --port 3100`
- **Pages to test**: `/` (landing), `/library`, `/watch/[id]`

### API Endpoints
- **Tool**: curl for API validation
- **Base URL**: http://localhost:3100/api
- **Endpoints**: /api/episodes (GET, POST), /api/episodes/[id] (GET), /api/chat (POST, SSE), /api/chat/end (POST), /api/profiles/build (POST)

## Validation Concurrency

- **Machine**: 24GB RAM, 12 CPU cores (macOS)
- **Dev server**: ~100-200MB RAM
- **agent-browser instance**: ~300MB RAM each
- **Available headroom**: ~18GB * 0.7 = 12.6GB
- **Max concurrent validators**: 5 (5 * 300MB + 200MB server = 1.7GB, well within budget)

## Testing Notes

- Next.js dev server starts in ~2.6s with Turbopack
- First request compilation takes ~1.6s, subsequent requests ~25ms
- Ollama must be running with tinyllama model for chat/LLM tests (set OLLAMA_MODEL=tinyllama in .env)
- SQLite database at prisma/dev.db — can be deleted and recreated for clean state
- YouTube transcript fetching requires internet access

## Flow Validator Guidance: API

### Testing Tool
Use `curl` for all API endpoint testing. No browser automation needed for foundation milestone.

### Server
- Dev server running at http://localhost:3100
- All API endpoints under http://localhost:3100/api/

### Database
- SQLite at prisma/dev.db — shared across all validators
- **IMPORTANT**: Validators sharing the database must NOT run concurrently if they mutate overlapping data
- Use unique YouTube URLs for each test to avoid 409 conflicts between validators

### Isolation Rules
- Each validator group should use distinct test data (unique YouTube URLs, unique user IDs)
- Ingestion tests must use real YouTube URLs that have transcripts (e.g., popular TED talks or short videos with captions)
- Chat tests need episodes and podcasters created first — seed them before testing chat assertions
- Clean up test data if possible, but don't count on other validators' data being present

### Known Test URLs with Transcripts
- Use real YouTube URLs with known captions for ingestion tests
- Short videos are preferred to minimize fetch time

### LLM Configuration
- Ollama running at localhost:11434 with tinyllama model
- Chat streaming works with tinyllama — responses may be less coherent but structure is correct
- VAL-CHAT-011 test should be done by temporarily making the LLM endpoint unreachable or using a model that doesn't exist

### Known Issues (Foundation Milestone)
- **youtube-transcript library v1.2.1 is broken**: Cannot fetch transcripts from any real YouTube URL. The YouTube timedtext API returns 200 with empty body for all format variants (default, srv1, srv2, srv3, vtt, json3). Library needs updating or replacement (e.g., youtubei.js). This blocks all ingestion assertions that require successful transcript fetching.
- **Workaround for testing**: Chat validator seeded test data directly into SQLite using better-sqlite3 adapter. This allowed testing chat assertions without depending on transcript fetching.
- **DB seeding pattern**: Use `better-sqlite3` to create test records with prefixed IDs (e.g., `chat-validator-user-001`) to avoid conflicts between validators.
