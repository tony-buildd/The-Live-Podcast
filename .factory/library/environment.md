# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external API keys/services, dependency quirks, platform-specific notes.
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

## Required Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| DATABASE_URL | Yes | file:./dev.db | SQLite database path |
| LLM_PROVIDER | Yes | ollama | "ollama" or "openai" |
| OLLAMA_BASE_URL | If ollama | http://localhost:11434 | Ollama API base URL |
| OLLAMA_MODEL | If ollama | llama3.1 | Ollama model name |
| OPENAI_API_KEY | If openai | - | OpenAI API key |
| NEXTAUTH_SECRET | Yes (milestone 5) | - | NextAuth session encryption |
| NEXTAUTH_URL | Yes (milestone 5) | http://localhost:3100 | NextAuth callback URL |

## Dependencies Notes

- `prisma` is in `dependencies` (should be `devDependencies` but works fine)
- `dotenv` is imported in `prisma.config.ts` but NOT in package.json — needs to be installed or the import removed
- `uuid` is installed but currently unused
- Next.js 16 uses Turbopack by default for dev
- The `node_modules/.bin/next` shim may be broken — use `node node_modules/next/dist/bin/next` as fallback

## Database

- SQLite via Prisma (switched from PostgreSQL for zero-infrastructure local dev)
- Database file: `prisma/dev.db` (auto-created by Prisma migrate)
- Prisma client output: `src/generated/prisma` (gitignored)

## Ollama

- Must be running on localhost:11434
- Requires at least one model pulled (e.g., `ollama pull llama3.1`)
- Check status: `curl http://localhost:11434/api/tags`
