---
name: backend-worker
description: Implements API routes, database operations, server-side logic, and backend infrastructure for TonyPodcast.
---

# Backend Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Use for features involving:
- API route handlers (src/app/api/)
- Database schema changes and migrations
- Server-side library code (src/lib/)
- Backend infrastructure (Prisma, LLM providers, vector store, auth config)
- Package.json changes and dependency management

## Work Procedure

### 1. Understand the Feature

Read the feature description, preconditions, expectedBehavior, and verificationSteps carefully. Check that preconditions are met by reading relevant existing code. If preconditions are NOT met, return to orchestrator.

### 2. Write Tests First (RED)

Before writing any implementation:
- Create test file(s) in a `__tests__` directory co-located with the code being tested, or in a top-level `tests/` directory
- Use Vitest (already configured). Import from `vitest`.
- Write tests covering all expectedBehavior items: happy paths, error cases, edge cases
- Run tests to confirm they FAIL: `npx vitest run <test-file> --reporter=verbose`
- If tests pass before implementation, your tests are wrong

### 3. Implement

- Follow existing patterns in src/lib/ (see .factory/library/architecture.md)
- Use `@/*` path alias for imports
- Use async/await, explicit return types, interfaces over types
- For API routes: use Next.js App Router route handlers (export async function GET/POST)
- For streaming: use ReadableStream with SSE format
- Handle errors with appropriate HTTP status codes (400, 404, 409, 422, 500, 503)
- Never expose secrets in responses or logs

### 4. Make Tests Pass (GREEN)

- Run tests: `npx vitest run <test-file> --reporter=verbose`
- Fix implementation until all tests pass
- Do NOT modify tests to make them pass unless the test was genuinely wrong

### 5. Verify Manually

- Start the dev server if needed: `node node_modules/next/dist/bin/next dev --port 3100`
- Test API endpoints with curl:
  - Verify response status codes
  - Verify response body structure
  - Test error cases (missing fields, invalid data, duplicates)
  - For streaming endpoints, verify SSE format with `curl -N`
- Stop the dev server when done

### 6. Run Validators

- `npx tsc --noEmit` (must pass with zero errors)
- `npx eslint .` (must pass)
- `npx vitest run --reporter=verbose` (full test suite must pass)

### 7. Commit

- Stage only files related to this feature
- Write a clear commit message describing what was implemented

## Example Handoff

```json
{
  "salientSummary": "Implemented POST /api/episodes endpoint: accepts YouTube URL, fetches transcript via youtube-transcript, creates Podcaster (if new) + Episode + TranscriptChunks in SQLite. Returns 201 on success, 400 for invalid URL, 409 for duplicate, 422 for no captions. Ran `npx vitest run tests/api/episodes.test.ts` (12 passing) and verified via curl.",
  "whatWasImplemented": "POST /api/episodes route handler with URL validation, transcript fetching, Prisma transaction for atomic record creation, and error handling for all edge cases. Test file with 12 test cases.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "npx vitest run tests/api/episodes.test.ts --reporter=verbose", "exitCode": 0, "observation": "12 tests passing: valid URL, invalid URL (3 cases), duplicate URL, no captions, chunking, podcaster reuse, transaction rollback, list endpoint, detail endpoint, 404" },
      { "command": "npx tsc --noEmit", "exitCode": 0, "observation": "No type errors" },
      { "command": "npx eslint .", "exitCode": 0, "observation": "No lint errors" },
      { "command": "curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3100/api/episodes -H 'Content-Type: application/json' -d '{\"url\":\"https://youtube.com/watch?v=dQw4w9WgXcQ\"}'", "exitCode": 0, "observation": "201 Created, response includes episode ID and transcript chunk count" },
      { "command": "curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3100/api/episodes -H 'Content-Type: application/json' -d '{\"url\":\"not-a-url\"}'", "exitCode": 0, "observation": "400 Bad Request with error message" }
    ],
    "interactiveChecks": []
  },
  "tests": {
    "added": [
      {
        "file": "tests/api/episodes.test.ts",
        "cases": [
          { "name": "creates episode from valid YouTube URL", "verifies": "VAL-INGEST-001" },
          { "name": "rejects invalid URL with 400", "verifies": "VAL-INGEST-002" },
          { "name": "returns 409 for duplicate URL", "verifies": "VAL-INGEST-004" }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Feature depends on an API endpoint or data model that doesn't exist yet
- Prisma schema needs changes that would break existing features
- External service (Ollama) is unreachable and cannot be worked around
- Requirements are ambiguous or contradictory
- Test infrastructure (Vitest) is not working
