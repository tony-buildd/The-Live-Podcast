# Architecture

Architectural decisions, patterns discovered, and conventions.

**What belongs here:** Design patterns, module boundaries, naming conventions, technology choices.

---

## Project Structure

```
src/
  app/              # Next.js App Router pages and API routes
    api/            # API route handlers
    watch/[id]/     # Watch page (YouTube player + chat)
    library/        # Episode library page
  lib/              # Shared library code
    llm/            # LLM provider abstraction (factory + strategy pattern)
    transcript/     # YouTube transcript fetching and chunking
    memory/         # Context building, profile building, memory management
    db.ts           # Prisma client singleton
  components/       # React components
  generated/        # Prisma client (gitignored)
prisma/
  schema.prisma     # Database schema
  dev.db            # SQLite database (gitignored)
```

## Design Patterns

- **Factory Pattern**: `createLLMProvider()` reads env var and returns correct provider
- **Strategy Pattern**: `LLMProvider` interface with OpenAI/Ollama implementations
- **Singleton**: Prisma client (`globalThis` cache for dev HMR), LLM provider
- **AsyncGenerator**: LLM streaming via `async function*`

## Coding Conventions

- **Naming**: camelCase for variables/functions, PascalCase for classes/types/interfaces, kebab-case for files
- **Imports**: `@/*` path alias for `src/`. Named exports preferred.
- **TypeScript**: Strict mode. Interfaces over types. Explicit return types on public functions.
- **Error handling**: Throw on non-OK responses. Minimal retry logic (to be improved in polish phase).
- **No SDK dependencies for LLM**: Raw `fetch()` calls to both OpenAI and Ollama APIs.
- **Async**: `async/await` throughout. `Promise.all` for concurrent queries.

## Technology Stack

- Next.js 16 with App Router + Turbopack
- React 19
- TypeScript 5 (strict)
- Tailwind CSS 4
- Prisma 7 with SQLite
- Vitest for testing
- vectra for vector store (milestone 4)
- @huggingface/transformers for local embeddings (milestone 4)
- NextAuth.js for auth (milestone 5)
