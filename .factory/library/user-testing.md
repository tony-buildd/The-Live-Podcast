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
- Ollama must be running with llama3.1 model for chat/LLM tests
- SQLite database at prisma/dev.db — can be deleted and recreated for clean state
- YouTube transcript fetching requires internet access
