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
    convex/         # Convex client/server helpers (if present)
  components/       # React components
convex/
  schema.ts         # Convex schema + indexes (including vector indexes)
  *.ts              # Convex queries/mutations/actions
```

## Design Patterns

- **Factory Pattern**: `createLLMProvider()` reads env var and returns correct provider
- **Strategy Pattern**: `LLMProvider` interface with OpenAI/Ollama implementations
- **Server Function Boundary**: Convex queries/mutations/actions isolate persistence logic
- **Auth Context Boundary**: Clerk auth context is the source of truth for user identity
- **AsyncGenerator**: LLM streaming via `async function*`

## Coding Conventions

- **Naming**: camelCase for variables/functions, PascalCase for classes/types/interfaces, kebab-case for files
- **Imports**: `@/*` path alias for `src/`. Named exports preferred.
- **TypeScript**: Strict mode. Interfaces over types. Explicit return types on public functions.
- **Error handling**: Throw on non-OK responses. Minimal retry logic (to be improved in polish phase).
- **No SDK dependencies for LLM**: Raw `fetch()` calls to both OpenAI and Ollama APIs.
- **Async**: `async/await` throughout. `Promise.all` for concurrent queries.
- **Auth**: No default-user fallback; derive all user identity from Clerk server auth context.

## Technology Stack

- Next.js 16 with App Router + Turbopack
- React 19
- TypeScript 5 (strict)
- Tailwind CSS 4
- Convex (database + backend functions)
- Vitest for testing
- Convex vector search for retrieval (milestone 4)
- @huggingface/transformers for local embeddings (milestone 4)
- Clerk for auth (milestone 5)
