# Technical Review

Date: 2026-04-12

## Scope

Deep-dive review of the project’s technical architecture, code health, runtime risks, data model, and repo hygiene.

Validation run during review:

- `npm test` -> passed
- `npm run lint` -> failed
- `npx tsc --noEmit` -> failed
- `npm run build` -> failed

## Architecture Summary

Current live architecture:

- Next.js App Router frontend and API routes
- Clerk for authentication
- Convex as the active backend and data layer
- Local Python transcript microservice on `127.0.0.1:8765`
- LLM providers via Ollama or OpenAI

Primary request flow:

- Browser UI -> Next.js route handlers -> Clerk auth checks -> Convex queries/mutations/actions
- Episode ingestion also depends on the local transcript sidecar
- Chat uses Convex for context/memory plus streaming responses from the configured LLM provider

Architectural observation:

- The project is mid-migration. Convex is the active backend, but legacy Prisma artifacts, schema, helper modules, and test databases are still present.
- Transcript handling exists in multiple implementations.
- LLM access also exists in more than one place.

## Findings

### P0 Blocking

#### 1. Build-breaking syntax error

- Location: [src/app/api/profiles/build/route.ts](/Users/minhthiennguyen/Desktop/tony-podcast/src/app/api/profiles/build/route.ts#L68)
- Impact: The project does not currently lint, typecheck, or build.
- Evidence:
  - `npm run lint` fails
  - `npx tsc --noEmit` fails
  - `npm run build` fails
- Cause: The file contains a broken merge artifact inside a `NextResponse.json(...)` return block.
- Recommendation: Repair the route immediately and add a CI gate that runs lint, typecheck, build, and tests on every push.

### P1 Major

#### 2. Cross-episode memory is not actually possible

- Locations:
  - [README.md](/Users/minhthiennguyen/Desktop/tony-podcast/README.md#L22)
  - [convex/episodes.ts](/Users/minhthiennguyen/Desktop/tony-podcast/convex/episodes.ts#L120)
- Impact: A headline feature is promised but cannot work correctly.
- Detail: Ingestion creates a synthetic podcaster identity per YouTube video using `placeholder-${youtubeId}`. That means separate episodes from the same creator never share a stable podcaster identity, so memories and profiles cannot accumulate across a real creator’s catalog.
- Recommendation: Replace placeholder podcaster identity creation with real creator/channel identity extraction and use a stable podcaster key.

#### 3. Timeline-aware Q&A leaks future content

- Locations:
  - [convex/transcript.ts](/Users/minhthiennguyen/Desktop/tony-podcast/convex/transcript.ts#L123)
  - [convex/memory.ts](/Users/minhthiennguyen/Desktop/tony-podcast/convex/memory.ts#L124)
  - [convex/memory.ts](/Users/minhthiennguyen/Desktop/tony-podcast/convex/memory.ts#L177)
- Impact: The core product guarantee is weakened. Users can receive content from after the paused timestamp.
- Detail:
  - Transcript chunks are grouped in 60-second windows.
  - Context includes whole chunks based on chunk start time rather than clipping content to the current timestamp.
  - Semantic retrieval searches all podcaster chunks and does not apply a timestamp ceiling.
- Recommendation:
  - Store or derive finer-grained time-bounded context.
  - Filter retrieval results by episode time when appropriate.
  - Enforce “no future leakage” as a tested invariant.

#### 4. Library ownership model is inconsistent

- Locations:
  - [convex/schema.ts](/Users/minhthiennguyen/Desktop/tony-podcast/convex/schema.ts#L25)
  - [convex/episodes.ts](/Users/minhthiennguyen/Desktop/tony-podcast/convex/episodes.ts#L11)
  - [src/middleware.ts](/Users/minhthiennguyen/Desktop/tony-podcast/src/middleware.ts#L13)
  - [src/components/AddEpisodeModal.tsx](/Users/minhthiennguyen/Desktop/tony-podcast/src/components/AddEpisodeModal.tsx#L117)
- Impact: This is either a product-contract bug or a data-isolation bug.
- Detail:
  - Episodes have no `userId` ownership field.
  - The list endpoint returns the full catalog.
  - Only POST routes are auth-protected at the middleware layer.
  - UI messaging says “your Library,” implying per-user ownership.
- Recommendation: Decide whether the library is shared or per-user. Then align schema, route authorization, copy, and query behavior to that decision.

#### 5. Chat API does not validate episode/podcaster relationship

- Location: [convex/chat.ts](/Users/minhthiennguyen/Desktop/tony-podcast/convex/chat.ts#L24)
- Impact: A malformed or malicious request can combine one episode’s transcript with another podcaster’s profile and memory context.
- Detail: The code checks that the episode exists and the podcaster exists, but it does not verify that the episode belongs to that podcaster.
- Recommendation: Enforce relational validation before starting or continuing a conversation.

#### 6. Chat streaming is brittle and can fail silently

- Locations:
  - [src/app/api/chat/route.ts](/Users/minhthiennguyen/Desktop/tony-podcast/src/app/api/chat/route.ts#L174)
  - [src/components/ChatPanel.tsx](/Users/minhthiennguyen/Desktop/tony-podcast/src/components/ChatPanel.tsx#L120)
  - [src/components/VoiceConversation.tsx](/Users/minhthiennguyen/Desktop/tony-podcast/src/components/VoiceConversation.tsx#L72)
- Impact: Streaming can corrupt, degrade, or appear to succeed while actually failing.
- Detail:
  - Raw tokens are written directly into SSE frames.
  - Tokens containing newline-like content can break event framing.
  - Clients ignore `[ERROR]` events and often treat blank assistant output as success.
- Recommendation:
  - Encode all streamed payloads safely.
  - Standardize SSE event shapes.
  - Surface server stream errors explicitly in both text and voice clients.

#### 7. Important chat work happens outside the main route error boundary

- Location: [src/app/api/chat/route.ts](/Users/minhthiennguyen/Desktop/tony-podcast/src/app/api/chat/route.ts#L108)
- Impact: Context lookup and history loading can throw unhandled failures after the user message has already been persisted.
- Detail:
  - `getConversationContext` and `listConversationMessages` happen outside the final LLM `try/catch`.
  - A failure there likely returns a raw 500 and leaves partial state behind.
- Recommendation: Wrap the entire request pipeline with consistent failure handling and explicit rollback or compensating behavior where necessary.

### P2 Minor

#### 8. Retrieval path will not scale well

- Locations:
  - [convex/memory.ts](/Users/minhthiennguyen/Desktop/tony-podcast/convex/memory.ts#L119)
  - [convex/memory.ts](/Users/minhthiennguyen/Desktop/tony-podcast/convex/memory.ts#L185)
  - [convex/schema.ts](/Users/minhthiennguyen/Desktop/tony-podcast/convex/schema.ts#L51)
- Impact: Performance will degrade as transcript volume grows.
- Detail:
  - Episode context loads all chunks and filters them in application code.
  - Semantic search scans all chunks for a podcaster in userland code.
  - A vector index exists but is not yet used.
- Recommendation: Move to indexed/vector-backed retrieval and bound work by episode, podcaster, and timestamp.

#### 9. Deployment assumptions are under-documented and fragile

- Locations:
  - [src/app/api/episodes/route.ts](/Users/minhthiennguyen/Desktop/tony-podcast/src/app/api/episodes/route.ts#L58)
  - [.env.example](/Users/minhthiennguyen/Desktop/tony-podcast/.env.example#L1)
  - [transcript-service/main.py](/Users/minhthiennguyen/Desktop/tony-podcast/transcript-service/main.py#L1)
- Impact: The app is harder to deploy and easier to misconfigure.
- Detail:
  - Ingestion depends on a local transcript service.
  - `TRANSCRIPT_SERVICE_URL` is used but not documented in `.env.example`.
  - The service dependency is operationally important but not clearly integrated into the app’s documented setup contract.
- Recommendation: Document the sidecar requirement explicitly and decide whether transcript fetching should remain a separate local service or move behind a more deployable boundary.

#### 10. The codebase contains dead and duplicate architecture

- Locations:
  - [prisma/schema.prisma](/Users/minhthiennguyen/Desktop/tony-podcast/prisma/schema.prisma#L1)
  - [src/lib/transcript/index.ts](/Users/minhthiennguyen/Desktop/tony-podcast/src/lib/transcript/index.ts#L59)
  - [src/lib/memory/context-builder.ts](/Users/minhthiennguyen/Desktop/tony-podcast/src/lib/memory/context-builder.ts#L29)
  - [src/lib/memory/profile-builder.ts](/Users/minhthiennguyen/Desktop/tony-podcast/src/lib/memory/profile-builder.ts#L3)
  - [convex/llm.ts](/Users/minhthiennguyen/Desktop/tony-podcast/convex/llm.ts#L1)
- Impact: Increased maintenance cost, confusion, and migration risk.
- Detail:
  - Prisma schema and test databases are still present though runtime usage appears to have moved to Convex.
  - There are two transcript implementations.
  - There are old memory/profile helper modules not used by the current flow.
  - LLM request logic exists in both frontend-side library code and Convex code.
- Recommendation: Remove or archive pre-cutover code paths and converge on one implementation per concern.

#### 11. Repo hygiene is poor

- Tracked files:
  - [transcript-service/__pycache__/main.cpython-313.pyc](/Users/minhthiennguyen/Desktop/tony-podcast/transcript-service/__pycache__/main.cpython-313.pyc)
  - [transcript-service/__pycache__/main.cpython-314.pyc](/Users/minhthiennguyen/Desktop/tony-podcast/transcript-service/__pycache__/main.cpython-314.pyc)
  - [prisma/test-cross-episode.db](/Users/minhthiennguyen/Desktop/tony-podcast/prisma/test-cross-episode.db)
  - [prisma/test-integration.db](/Users/minhthiennguyen/Desktop/tony-podcast/prisma/test-integration.db)
  - [convex/_generated/api.js](/Users/minhthiennguyen/Desktop/tony-podcast/convex/_generated/api.js)
  - [convex/_generated/server.js](/Users/minhthiennguyen/Desktop/tony-podcast/convex/_generated/server.js)
- Impact: Noise in diffs, unnecessary repo weight, and avoidable merge churn.
- Detail:
  - Python bytecode is committed.
  - Old SQLite test databases are committed.
  - Generated code is committed and currently trips lint warnings.
- Recommendation:
  - Decide what generated assets truly belong in source control.
  - Remove transient artifacts and update `.gitignore`.
  - Keep the repo to source, required configs, and intentional generated files only.

#### 12. Middleware convention is deprecated in current Next.js

- Location: [src/middleware.ts](/Users/minhthiennguyen/Desktop/tony-podcast/src/middleware.ts#L1)
- Impact: Not immediately breaking, but it introduces forward-compatibility risk.
- Evidence: `next build` warns that the `middleware` file convention is deprecated in favor of `proxy`.
- Recommendation: Plan a migration to the current Next.js convention before more auth logic accumulates there.

## Positive Findings

- Route input validation is materially better than average for a project at this stage.
- Clerk-based auth enforcement exists for the highest-risk POST routes.
- The Convex schema is coherent and maps well to the intended product model.
- Tests for route validation and middleware behavior are present and passing.
- The project already has the beginnings of stronger retrieval infrastructure through Convex vector indexing.

## Testing Coverage Gaps

Current passing tests focus on:

- request validation for `/api/chat`
- request validation for `/api/episodes`
- auth gating in middleware

Missing or insufficient coverage:

- build/profile route behavior
- successful end-to-end ingestion
- successful end-to-end chat streaming
- voice mode behavior
- “no future leakage” timeline guarantee
- cross-episode memory behavior
- episode/podcaster relationship validation
- failure handling in partial-stream and partial-persist scenarios

## Recommended Work Order

1. Fix the build-breaking syntax error in [src/app/api/profiles/build/route.ts](/Users/minhthiennguyen/Desktop/tony-podcast/src/app/api/profiles/build/route.ts#L68).
2. Add CI or local pre-push enforcement for:
   - `npm run lint`
   - `npx tsc --noEmit`
   - `npm run build`
   - `npm test`
3. Decide and implement the true ownership model for the library.
4. Fix the podcaster identity model so cross-episode memory can exist.
5. Enforce strict no-future-leakage in transcript context and retrieval.
6. Harden chat streaming and error propagation.
7. Validate `episodeId` and `podcasterId` relationships server-side.
8. Remove dead Prisma-era and duplicate helper code.
9. Clean up tracked generated and transient artifacts.
10. Improve deployment documentation around the transcript sidecar and environment contract.

## Bottom Line

The project has a workable backbone, but it is not currently in a shippable technical state. The main blockers are:

- the broken build
- product-contract drift between implementation and promised features
- timeline correctness issues in retrieval/context building
- unresolved migration debt from the Prisma-to-Convex cutover

Once the build is restored, the highest-value technical work is to make the data model and retrieval rules match the product claims exactly.
