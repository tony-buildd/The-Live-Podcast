# MVP "Talk to the Video" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the core "paste URL, watch, pause, ask, get contextual answer" loop with prompt caching for cost efficiency and per-session persistence in Convex.

**Architecture:** Next.js 16 App Router frontend with Convex backend. Chat API route builds a system prompt from full transcript (0 to pause point) as a cached prefix, streams LLM response via SSE. No memory, no profiles, no embeddings — just transcript context + foundation model knowledge.

**Tech Stack:** Next.js 16, TypeScript strict, Tailwind CSS 4, Convex, Clerk, OpenAI/Ollama (provider-agnostic), Python transcript sidecar (youtube-transcript-api)

**Design doc:** `docs/plans/2026-04-12-mvp-talk-to-the-video-design.md`

---

## File Map

### Files to Create
- `convex/transcriptChunks.ts` — new Convex query: get all chunks for an episode up to a timestamp
- `src/lib/chat/system-prompt.ts` — extracted `buildMvpSystemPrompt()` function (shared by route + tests)
- `tests/api/chat-system-prompt.test.ts` — tests importing the real `buildMvpSystemPrompt` function

### Files to Modify
- `src/app/api/chat/route.ts` — replace context assembly; import `buildMvpSystemPrompt` from shared module; remove memory/profile deps (keep `currentUser` import — still used by `ensureUser`)
- `convex/episodes.ts` — add `getEpisodeById` public query (needed by chat route for video title); remove `scheduler.runAfter` calls for embeddings and profile rebuild (dead work after MVP changes)
- `src/app/watch/[id]/page.tsx` — remove `endConversation` call on resume
- `src/app/api/chat/end/route.ts` — gut the memory persistence; keep as no-op stub
- `src/app/api/profiles/build/route.ts` — fix the syntax error (build blocker)
- `.gitignore` — add missing patterns for tracked artifacts
- `convex/transcript.ts:67-68` — fix double `clearTimeout` bug

### Files to Remove (after documenting in feature.md)
- `prisma/` — entire directory (schema, 6 SQLite DBs)
- `src/generated/prisma/` — dead generated code
- `src/lib/memory/context-builder.ts` — unused
- `src/lib/memory/profile-builder.ts` — unused
- `transcript_service/` — empty directory (note: the real one is `transcript-service/`)

### Files Kept for Future Use (dead after MVP but needed for future iterations)
- `convex/memory.ts` — conversation context with semantic search (future: cross-episode retrieval)
- `convex/embeddings.ts` — embedding generation (future: vector search)
- `convex/profiles.ts` — podcaster profile building (future: creator persona)
- `convex/llm.ts` — Convex-side LLM abstraction (future: server-side AI calls)

### Prompt Caching Note
The system prompt is structured for caching (static transcript prefix, dynamic message suffix). OpenAI caching is automatic — no code change needed. Anthropic requires adding `cache_control` to the API call in the provider implementation — this is a future provider-level change, not part of the MVP plan.

---

## Phase 1: Fix Build Blocker & Repo Hygiene

Goal: Get `tsc`, `eslint`, and `npm run build` passing. Clean tracked artifacts.

### Task 1: Fix syntax error in profiles/build/route.ts

**Files:**
- Modify: `src/app/api/profiles/build/route.ts:68-89`

- [ ] **Step 1: Fix the broken merge artifact**

The file has a corrupted try/catch at lines 68-89. The closing brace and catch block are interleaved with the response JSON. Replace lines 68-89 with the correct structure:

```typescript
    return NextResponse.json(
      {
        profile: {
          podcasterId,
          summaryText: result.profile.summaryText,
          topics: result.profile.topics,
          personalityTraits: result.profile.personalityTraits,
          speakingStyle: result.profile.speakingStyle,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (isConvexConfigurationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    return NextResponse.json(
      { error: "AI service is currently unavailable. Could not build profile." },
      { status: 503 }
    );
  }
```

- [ ] **Step 2: Verify the fix compiles**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: No errors (or at least no errors from `profiles/build/route.ts`)

- [ ] **Step 3: Verify lint passes**

Run: `npx eslint src/app/api/profiles/build/route.ts`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/profiles/build/route.ts
git commit -m "fix: repair broken merge artifact in profiles/build route

The try/catch block and NextResponse.json return were interleaved,
causing tsc, eslint, and next build to fail."
```

### Task 2: Fix double clearTimeout bug

**Files:**
- Modify: `convex/transcript.ts:67-68`

- [ ] **Step 1: Remove the duplicate clearTimeout**

In `convex/transcript.ts`, line 68 is an exact duplicate of line 67. Remove line 68.

Before:
```typescript
    clearTimeout(timeoutId);
    clearTimeout(timeoutId);
```

After:
```typescript
    clearTimeout(timeoutId);
```

- [ ] **Step 2: Commit**

```bash
git add convex/transcript.ts
git commit -m "fix: remove duplicate clearTimeout in transcript fetch"
```

### Task 3: Clean repo hygiene — update .gitignore and remove tracked artifacts

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add missing gitignore patterns**

Add these lines to `.gitignore` after the existing database section:

```gitignore
# dead prisma artifacts (migrated to Convex)
prisma/
src/generated/prisma/

# python transcript service caches
transcript-service/__pycache__/

# empty legacy directory
transcript_service/

# convex generated files that trigger lint warnings
convex/_generated/*.js
convex/_generated/*.d.ts
```

Note: `src/generated/prisma` is already in .gitignore (line 57) but without the trailing slash pattern. The `prisma/` directory has individual file entries (lines 41-48) — replace those with the directory-level pattern.

- [ ] **Step 2: Remove tracked artifacts from git (without deleting local files)**

```bash
git rm -r --cached prisma/ 2>/dev/null || true
git rm -r --cached src/generated/prisma/ 2>/dev/null || true
git rm -r --cached transcript_service/ 2>/dev/null || true
git rm -r --cached transcript-service/__pycache__/ 2>/dev/null || true
```

- [ ] **Step 3: Remove dead source files**

```bash
rm -rf prisma/
rm -rf src/generated/prisma/
rm -rf transcript_service/
rm -f src/lib/memory/context-builder.ts
rm -f src/lib/memory/profile-builder.ts
```

- [ ] **Step 4: Verify build still works**

Run: `npx tsc --noEmit && npx eslint . && npm test`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git add src/lib/memory/context-builder.ts src/lib/memory/profile-builder.ts
git status
git commit -m "chore: remove dead Prisma layer, unused helpers, and tracked artifacts

Removes:
- prisma/ directory (schema + 6 SQLite DBs) — migrated to Convex
- src/generated/prisma/ — dead generated code
- src/lib/memory/context-builder.ts — unused
- src/lib/memory/profile-builder.ts — unused
- transcript_service/ — empty legacy directory
- transcript-service/__pycache__/ — Python bytecode

Updates .gitignore to prevent re-tracking."
```

Note: The `git rm --cached` commands in Step 2 already staged the removals. Step 5 stages the .gitignore update and the deleted source files. Run `git status` before committing to verify only expected files are staged.

### Task 4: Verify full build passes

- [ ] **Step 1: Run all checks**

```bash
npx tsc --noEmit && npx eslint . && npm test && npm run build
```

Expected: All four pass. If `npm run build` fails on anything unrelated to our changes, investigate before proceeding.

---

## Phase 2: Simplify Chat Context to Transcript-Only

Goal: Replace the complex memory/profile/semantic-search context pipeline with a simple "get all transcript chunks up to timestamp" query.

### Task 5: Create Convex query for transcript chunks + remove dead scheduler calls

**Files:**
- Create: `convex/transcriptChunks.ts`
- Modify: `convex/episodes.ts:137-160`

- [ ] **Step 1: Write the transcript chunks query**

Create `convex/transcriptChunks.ts`:

```typescript
import { v } from "convex/values";
import { query } from "./_generated/server";

export const getChunksUpToTimestamp = query({
  args: {
    episodeId: v.id("episodes"),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    const chunks = await ctx.db
      .query("transcriptChunks")
      .withIndex("by_episode_start_time", (q) =>
        q.eq("episodeId", args.episodeId)
      )
      .collect();

    return chunks
      .filter((chunk) => chunk.startTime <= args.timestamp)
      .map((chunk) => ({
        text: chunk.text,
        startTime: chunk.startTime,
        endTime: chunk.endTime,
      }));
  },
});
```

- [ ] **Step 2: Remove dead scheduler calls in episodes.ts**

In `convex/episodes.ts`, the `ingestEpisode` action schedules background jobs for embeddings and profile rebuilding (lines ~137-160). After MVP changes, nothing reads those results — they waste compute and LLM spend on every ingestion.

Remove or comment out these two `scheduler.runAfter` calls:

```typescript
    // DEFERRED: embeddings and profile building removed for MVP.
    // Re-enable when vector search and creator profiles are implemented.
    //
    // await ctx.scheduler.runAfter(0, internal.memory.reindexEpisodeChunks, {
    //   episodeId,
    // });
    //
    // await ctx.scheduler.runAfter(0, internal.profiles.rebuildPodcasterProfile, {
    //   podcasterId,
    // });
```

- [ ] **Step 3: Run Convex codegen to verify schema compatibility**

```bash
npx convex codegen
```

Expected: No errors. The new file should appear in the generated API.

- [ ] **Step 4: Commit**

```bash
git add convex/transcriptChunks.ts convex/episodes.ts
git commit -m "feat: add transcript chunks query; remove dead scheduler jobs

New query returns all transcript chunks up to a timestamp for the
chat system prompt.

Removes scheduler.runAfter calls for reindexEpisodeChunks (embeddings)
and rebuildPodcasterProfile (LLM) — nothing reads those results in MVP.
Saves compute and LLM cost on every ingestion."
```

### Task 6: Extract buildMvpSystemPrompt to shared module with tests

**Files:**
- Create: `src/lib/chat/system-prompt.ts`
- Create: `tests/api/chat-system-prompt.test.ts`

- [ ] **Step 1: Create the shared system prompt module**

Create `src/lib/chat/system-prompt.ts`:

```typescript
export interface TranscriptChunk {
  text: string;
  startTime: number;
  endTime: number;
}

export function buildMvpSystemPrompt(args: {
  videoTitle: string;
  currentTimestamp: number;
  chunks: TranscriptChunk[];
}): string {
  const { videoTitle, currentTimestamp, chunks } = args;

  const mins = Math.floor(currentTimestamp / 60);
  const secs = Math.floor(currentTimestamp % 60);
  const timestampLabel = `${mins}:${secs.toString().padStart(2, "0")}`;

  const transcriptText = chunks.map((c) => c.text).join(" ");

  // Recent context: last ~2 minutes for the "anchor" section
  const recentStart = Math.max(0, currentTimestamp - 120);
  const recentChunks = chunks.filter((c) => c.startTime >= recentStart);
  const recentText = recentChunks.map((c) => c.text).join(" ");

  let prompt = `You are helping a viewer who is watching the video "${videoTitle}".\n`;
  prompt += `They paused at ${timestampLabel} to ask you a question.\n\n`;

  if (transcriptText.length > 0) {
    prompt += `Here is what has been discussed in the video so far:\n`;
    prompt += `${transcriptText}\n\n`;
  }

  if (recentText.length > 0 && recentText !== transcriptText) {
    prompt += `The viewer just paused during this part of the discussion:\n`;
    prompt += `${recentText}\n\n`;
  }

  prompt += `Respond conversationally. You have general knowledge and the context of what's being discussed in the video. `;
  prompt += `The conversation is anchored to what was just being discussed, but you can draw on broader knowledge to give good answers. `;
  prompt += `Be natural. Don't lecture. Talk like a knowledgeable friend.`;

  return prompt;
}
```

- [ ] **Step 2: Write tests that import the real function**

Create `tests/api/chat-system-prompt.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildMvpSystemPrompt } from "@/lib/chat/system-prompt";

describe("buildMvpSystemPrompt", () => {
  it("includes video title and formatted timestamp", () => {
    const prompt = buildMvpSystemPrompt({
      videoTitle: "AI in 2026",
      currentTimestamp: 125,
      chunks: [],
    });

    expect(prompt).toContain("AI in 2026");
    expect(prompt).toContain("2:05");
  });

  it("includes full transcript text from chunks", () => {
    const prompt = buildMvpSystemPrompt({
      videoTitle: "Test",
      currentTimestamp: 60,
      chunks: [
        { text: "Hello world", startTime: 0, endTime: 15 },
        { text: "Second chunk", startTime: 15, endTime: 30 },
        { text: "Third chunk", startTime: 30, endTime: 45 },
      ],
    });

    expect(prompt).toContain("Hello world");
    expect(prompt).toContain("Second chunk");
    expect(prompt).toContain("Third chunk");
  });

  it("separates recent context as an anchor section", () => {
    const prompt = buildMvpSystemPrompt({
      videoTitle: "Test",
      currentTimestamp: 300,
      chunks: [
        { text: "Early content", startTime: 0, endTime: 60 },
        { text: "Middle content", startTime: 60, endTime: 180 },
        { text: "Recent content", startTime: 180, endTime: 300 },
      ],
    });

    expect(prompt).toContain("just paused during this part");
    expect(prompt).toContain("Recent content");
  });

  it("includes behavioral instructions", () => {
    const prompt = buildMvpSystemPrompt({
      videoTitle: "Test",
      currentTimestamp: 0,
      chunks: [],
    });

    expect(prompt).toContain("conversationally");
    expect(prompt).toContain("broader knowledge");
    expect(prompt).toContain("knowledgeable friend");
  });

  it("handles empty chunks gracefully", () => {
    const prompt = buildMvpSystemPrompt({
      videoTitle: "Test",
      currentTimestamp: 30,
      chunks: [],
    });

    expect(prompt).not.toContain("discussed in the video so far");
    expect(prompt).toContain("Test");
    expect(prompt).toContain("0:30");
  });
});
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `npx vitest run tests/api/chat-system-prompt.test.ts --reporter=verbose`
Expected: All 5 tests pass (importing the real function, no mocks needed)

- [ ] **Step 4: Commit**

```bash
git add src/lib/chat/system-prompt.ts tests/api/chat-system-prompt.test.ts
git commit -m "feat: extract buildMvpSystemPrompt to shared module with tests

System prompt builder extracted to src/lib/chat/system-prompt.ts so
both the route and tests import the same function. Tests verify title,
timestamp formatting, transcript inclusion, recent anchor, and empty state."
```

### Task 7: Rewrite the chat API route for MVP

**Files:**
- Modify: `src/app/api/chat/route.ts`
- Modify: `convex/episodes.ts` (add `getEpisodeById` query)

This is the biggest change. We replace the context assembly (lines 137-161) and system prompt builder (lines 257-312) with the simplified MVP flow.

- [ ] **Step 1: Add `getEpisodeById` query to Convex**

Add to `convex/episodes.ts`:

```typescript
export const getEpisodeById = query({
  args: {
    episodeId: v.id("episodes"),
  },
  handler: async (ctx, args) => {
    const episode = await ctx.db.get(args.episodeId);
    if (!episode) return null;
    return {
      title: episode.title,
      youtubeId: episode.youtubeId,
    };
  },
});
```

- [ ] **Step 2: Rewrite the chat route**

Modify `src/app/api/chat/route.ts`. Key changes:
1. Add import: `import { buildMvpSystemPrompt } from "@/lib/chat/system-prompt";`
2. Remove the `api.memory.getConversationContext` action call — use `api.transcriptChunks.getChunksUpToTimestamp` query instead
3. **Keep the `currentUser` import** — it's still used on line 93 for the `ensureUser` mutation
4. Remove the old `buildSystemPrompt()` function definition (lines 257-312) — it's now in the shared module
5. Fetch episode title for the system prompt

The new context assembly section (replacing lines 137-161) becomes:

```typescript
    // Fetch transcript chunks up to the pause timestamp
    const chunks = await convex.query(api.transcriptChunks.getChunksUpToTimestamp, {
      episodeId: typedEpisodeId,
      timestamp: typedTimestamp,
    });

    // Fetch episode for the title
    const episode = await convex.query(api.episodes.getEpisodeById, {
      episodeId: typedEpisodeId,
    });
    const videoTitle = episode?.title ?? "this video";

    const systemMessages: Message[] = [{
      role: "system",
      content: buildMvpSystemPrompt({
        videoTitle,
        currentTimestamp: typedTimestamp,
        chunks,
      }),
    }];

    const priorMessages = await convex.query(api.chat.listConversationMessages, {
      conversationId: activeConversationId,
    });

    llmMessages = [
      ...systemMessages,
      ...priorMessages,
    ];
```

Delete the old `buildSystemPrompt()` function (lines 257-312) entirely — it's replaced by the import from `@/lib/chat/system-prompt`.

- [ ] **Step 2: Update test mocks to match new context flow**

In `tests/api/chat-validation.test.ts`, update the mocks:

Replace the `apiRefs` to include the new query refs:
```typescript
  apiRefs: {
    users: { ensureUser: "users.ensureUser" },
    chat: {
      startConversation: "chat.startConversation",
      appendAssistantMessage: "chat.appendAssistantMessage",
      listConversationMessages: "chat.listConversationMessages",
    },
    transcriptChunks: {
      getChunksUpToTimestamp: "transcriptChunks.getChunksUpToTimestamp",
    },
    episodes: {
      getEpisodeById: "episodes.getEpisodeById",
    },
  },
```

Remove `actionMock` (no longer needed — we use queries now, not actions).

Update `queryMock` to handle the new refs:
```typescript
    queryMock.mockImplementation(
      async (ref: string) => {
        if (ref === apiRefs.transcriptChunks.getChunksUpToTimestamp) {
          return [{ text: "some transcript", startTime: 0, endTime: 15 }];
        }
        if (ref === apiRefs.episodes.getEpisodeById) {
          return { title: "Test Episode", youtubeId: "abc123" };
        }
        if (ref === apiRefs.chat.listConversationMessages) {
          return [];
        }
        return [];
      },
    );
```

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: All 16+ tests pass

- [ ] **Step 4: Run type check and lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/app/api/chat/route.ts tests/api/chat-validation.test.ts convex/episodes.ts
git commit -m "feat: rewrite chat context to transcript-only MVP

Replace complex memory/profile/semantic-search context pipeline with
simple transcript-up-to-timestamp query. System prompt redesigned as
conversational anchor (not assistant-with-transcript).

Removes dependency on: getConversationContext action, podcasterProfiles,
userPodcasterMemory, semantic search, and embeddings.

Context is now: full transcript from 0 to pause point + video title +
behavioral instructions."
```

---

## Phase 3: Simplify Watch Page & Remove Memory Persistence

Goal: Remove the `endConversation` memory-building call on resume (expensive LLM summarization). Simplify the watch page.

### Task 8: Simplify the resume handler in watch page

**Files:**
- Modify: `src/app/watch/[id]/page.tsx:100-130`

- [ ] **Step 1: Remove the endConversation API call from handleResume**

The `handleResume` callback currently calls `/api/chat/end` which triggers expensive LLM summarization. For MVP, just close the chat and resume playback.

Replace the `handleResume` callback (lines 100-130):

```typescript
  const handleResume = useCallback(() => {
    if (jumpInGuardRef.current) return;
    jumpInGuardRef.current = true;

    setChatActive(false);
    setVoiceMode(false);
    setMicError(false);
    setConversationId(null);
    playerRef.current?.play();

    setTimeout(() => {
      jumpInGuardRef.current = false;
    }, 300);
  }, []);
```

Note: removed `async`, removed `conversationId` and `episode` from dependency array, removed the fetch call.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/watch/[id]/page.tsx
git commit -m "feat: simplify resume handler, remove endConversation call

For MVP, resuming playback just closes the chat panel and plays the
video. No expensive LLM summarization on conversation end.
Memory persistence is deferred to a future iteration."
```

### Task 9: Gut the chat/end route

**Files:**
- Modify: `src/app/api/chat/end/route.ts`

- [ ] **Step 1: Replace with a no-op that returns success**

Since nothing calls `/api/chat/end` anymore (we removed it from the watch page), simplify it to a no-op. Keep the file so the route doesn't 404 if anything still references it, but remove the expensive memory logic:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function POST(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // MVP: no memory persistence on conversation end.
  // Memory building is deferred to a future iteration.
  return NextResponse.json({ message: "ok" }, { status: 200 });
}
```

- [ ] **Step 2: Run tests and type check**

Run: `npx tsc --noEmit && npm test`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add src/app/api/chat/end/route.ts
git commit -m "feat: simplify chat/end to no-op for MVP

Memory persistence (LLM summarization + topic extraction on
conversation end) is deferred. Route kept as stub to avoid 404s."
```

---

## Phase 4: Verify End-to-End

Goal: Confirm the full flow works: build, type-check, lint, test, and manual verification.

### Task 10: Full verification

- [ ] **Step 1: Run all automated checks**

```bash
npx tsc --noEmit && npx eslint . && npm test && npm run build
```

Expected: All four pass with zero errors.

- [ ] **Step 2: Manual smoke test (if dev server available)**

Start the dev stack:
```bash
# Terminal 1: Convex
npm run convex:dev

# Terminal 2: Transcript service
npm run transcript:dev

# Terminal 3: Next.js
npm run dev
```

Test the flow:
1. Navigate to the home page
2. Add a YouTube URL (use a short video with captions, e.g., a TED talk)
3. Wait for ingestion to complete
4. Click the episode to go to the watch page
5. Play the video for ~30 seconds
6. Click "Jump In" — video should pause, chat panel should appear
7. Type a question about what was just discussed
8. Verify: response streams in, is contextually relevant, is conversational
9. Click "Resume" — video should play, chat panel should close

- [ ] **Step 3: Verify prompt caching readiness**

The system prompt structure should have the transcript as a stable prefix. Verify by checking that the system prompt content is identical across multiple messages in the same conversation (the only thing that changes is conversation history in the messages array, not the system prompt itself).

This means prompt caching will automatically work when using OpenAI, and will work with Anthropic once `cache_control` is added to the API call (a provider-level concern, not a route-level concern).

- [ ] **Step 4: Update changelog**

Add to `docs/changelog.md`:

```markdown
## [0.2.0] - 2026-04-12

### Changed
- Chat system prompt redesigned: full transcript (0 to pause point) as conversational anchor
- Context assembly simplified: direct Convex query instead of action + semantic search
- Resume handler no longer triggers expensive memory-building LLM calls
- Chat/end route simplified to no-op stub

### Fixed
- Build-breaking syntax error in profiles/build/route.ts (broken merge artifact)
- Double clearTimeout bug in convex/transcript.ts

### Removed
- Dead Prisma layer (schema, SQLite databases, generated code)
- Unused memory helper modules (context-builder.ts, profile-builder.ts)
- Tracked Python bytecode and empty legacy directories
- Memory/profile/semantic-search dependencies from chat pipeline
```

- [ ] **Step 5: Final commit**

```bash
git add docs/changelog.md
git commit -m "docs: update changelog for MVP 0.2.0"
```

---

## Summary of Changes by Phase

| Phase | Tasks | What Changes |
|-------|-------|-------------|
| 1: Fix Build | Tasks 1-4 | Fix syntax error, fix clearTimeout bug, clean dead code, verify build |
| 2: Simplify Chat | Tasks 5-7 | New transcript query, rewrite system prompt, rewrite context assembly |
| 3: Remove Memory | Tasks 8-9 | Simplify resume handler, gut chat/end route |
| 4: Verify | Task 10 | Full build + manual smoke test + changelog |

Total: **10 tasks**, each independently committable and verifiable.

## Explicitly Deferred from This Plan

**SSE streaming hardening** (design doc "What We Fix" item 4): Raw tokens in SSE frames can break if tokens contain newlines. Clients don't visibly surface `[ERROR]` events. This is a real issue noted in both the deep-dive analysis and GPT review (P1), but the current streaming works for the common case. Fixing it properly means JSON-encoding all payloads and standardizing error handling in both `ChatPanel.tsx` and `VoiceConversation.tsx`. This is a standalone task that doesn't block the MVP loop and should be addressed as a follow-up.

## Testing Strategy

- **Existing tests** (16 passing): Must continue to pass after each phase. Mock updates in Task 7 keep them aligned.
- **New tests** (Task 6): System prompt builder tested with 5 cases covering title, timestamp, transcript inclusion, recent context anchoring, and empty state.
- **Manual verification** (Task 10): End-to-end smoke test of the full paste→watch→pause→ask→answer flow.
- **Build verification**: `tsc --noEmit && eslint . && npm test && npm run build` after every phase.
