# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external API keys/services, dependency quirks, platform-specific notes.
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

## Required Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| CONVEX_DEPLOYMENT | Yes | - | Convex deployment name/slug |
| NEXT_PUBLIC_CONVEX_URL | Yes | - | Convex HTTP endpoint used by Next.js client |
| CLERK_SECRET_KEY | Yes | - | Clerk backend secret key |
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY | Yes | - | Clerk frontend publishable key |
| CLERK_SIGN_IN_URL | Yes | /sign-in | Clerk sign-in route |
| CLERK_SIGN_UP_URL | Yes | /sign-up | Clerk sign-up route |
| LLM_PROVIDER | Yes | ollama | "ollama" or "openai" |
| OLLAMA_BASE_URL | If ollama | http://localhost:11434 | Ollama API base URL |
| OLLAMA_MODEL | If ollama | llama3.1 | Ollama model name |
| OPENAI_API_KEY | If openai | - | OpenAI API key |

## Dependencies Notes

- Convex CLI may be used via `npx convex ...` if not installed as a direct dependency
- Clerk requires both server (`CLERK_SECRET_KEY`) and client (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`) env vars
- `uuid` is installed but currently unused
- Next.js 16 uses Turbopack by default for dev
- The `node_modules/.bin/next` shim may be broken — use `node node_modules/next/dist/bin/next` as fallback

## Data + Backend

- Persistent app data is stored in Convex
- Backend reads/writes should go through Convex queries/mutations/actions
- Semantic retrieval uses Convex vector search indexes

## youtube-transcript Library Limitations

The `youtube-transcript` npm package may return empty segments for many YouTube videos. This is a known limitation — the library scrapes YouTube's auto-generated captions which may not be available for all videos. When testing with real YouTube URLs, use videos known to have working captions (e.g., tech talks, podcasts with manual captions). The empty transcript case correctly returns 422 from the API.

## Ollama

- Must be running on localhost:11434
- Requires at least one model pulled (e.g., `ollama pull llama3.1`)
- Check status: `curl http://localhost:11434/api/tags`
