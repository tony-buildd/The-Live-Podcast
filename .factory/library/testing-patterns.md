# Testing Patterns

Discovered patterns and conventions for writing tests in the TonyPodcast project.

**What belongs here:** Test setup patterns, database handling, known quirks with test infrastructure.
**What does NOT belong here:** Test results or CI configuration.

---

## Per-Test-File SQLite Database

Each test file creates its own SQLite database to avoid lock conflicts when Vitest runs test files in parallel. Follow this naming convention:

- `tests/smoke.test.ts` → `prisma/test.db`
- `tests/api/episodes.test.ts` → `prisma/test.db`
- `tests/api/chat.test.ts` → `prisma/test-chat.db`
- `tests/api/profiles.test.ts` → `prisma/test-profiles.db`

**Pattern:**
```typescript
import PrismaBetterSqlite3 from '@prisma/adapter-better-sqlite3';
import Database from 'better-sqlite3';
import { PrismaClient } from '../../src/generated/prisma/client.js';

const TEST_DB_URL = 'file:./prisma/test-<feature>.db';
const sqlite = new Database('./prisma/test-<feature>.db');
const adapter = new PrismaBetterSqlite3(sqlite);
const prisma = new PrismaClient({ adapter });
```

Each test file also resets the database in `beforeAll`:
```typescript
import { execSync } from 'child_process';
execSync('npx prisma db push --force-reset', {
  env: { ...process.env, DATABASE_URL: TEST_DB_URL },
  stdio: 'pipe',
});
```

**Important:** Add new test database files to `.gitignore`.

## Test File Imports

Test files use relative paths (e.g., `../../src/generated/prisma/client.js`) instead of the `@/*` path alias because test files reside outside the `src/` directory and the path alias may not resolve in the test environment.

## Deterministic Profile ID Convention

The `buildPodcasterProfile` function uses `${podcasterId}-latest` as a deterministic ID for upsert operations. Tests that mock profile building should use the same ID pattern.
