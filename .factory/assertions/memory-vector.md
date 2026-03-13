# Memory & Vector Search — Behavioral Assertions

---

### VAL-MEM-001: Transcript chunks are created on episode ingestion

When a new episode is ingested (YouTube URL provided), the system fetches the transcript and splits it into `TranscriptChunk` records (≈60-second windows by default). Each chunk stores `text`, `startTime`, and `endTime`.

**Pass condition:** After episode creation, `TranscriptChunk.count({ where: { episodeId } })` > 0, and every chunk has non-empty `text`, `startTime < endTime`, and chunks collectively cover the full transcript duration without gaps.

**Evidence:** Query `TranscriptChunk` table filtered by `episodeId`; verify chunk time ranges are contiguous and text is non-empty.

---

### VAL-MEM-002: Transcript chunks have embedding IDs after ingestion

Each `TranscriptChunk` created during episode ingestion should be assigned an `embeddingId` linking it to the vector store entry, enabling semantic search.

**Pass condition:** For every `TranscriptChunk` associated with a newly ingested episode, `embeddingId` is non-null.

**Evidence:** Query `TranscriptChunk` for the episode; verify `embeddingId IS NOT NULL` for all rows.

---

### VAL-MEM-003: Jump In context includes timestamp-adjacent transcript chunks

When a user "Jumps In" at timestamp T, the system retrieves `TranscriptChunk` records where `startTime` is between `max(0, T - 300)` and `T` (5-minute window) for the current episode.

**Pass condition:** The system prompt passed to the LLM contains the concatenated text of all transcript chunks within the 5-minute lookback window relative to the user's pause timestamp.

**Evidence:** Inspect the `buildConversationContext` output messages; verify the `## What You Were Just Talking About` section contains text from chunks whose `startTime` falls within `[T-300, T]`.

---

### VAL-MEM-004: Jump In context includes semantically relevant content beyond timestamp window

When the user asks a question during Jump In, the AI's context should incorporate semantically similar transcript chunks—not limited to the 5-minute timestamp window—from the same or other episodes. This ensures answers leverage meaning-based retrieval (vector search), not just temporal proximity.

**Pass condition:** Given a user query about topic X that was discussed at a distant timestamp or in another episode, the system returns transcript chunks with high semantic similarity to X, regardless of their `startTime` relative to the current pause point.

**Evidence:** Embed the user query, perform a nearest-neighbor search in the vector store, and verify results include chunks outside the `[T-300, T]` window that are topically relevant.

---

### VAL-MEM-005: Podcaster profile is created on first episode ingestion

When the first episode for a podcaster is ingested, `buildPodcasterProfile` generates a `PodcasterProfile` record containing `summaryText`, `topics`, `personalityTraits`, and `speakingStyle` derived from the episode's transcript.

**Pass condition:** After ingesting the first episode for a podcaster, `PodcasterProfile.findFirst({ where: { podcasterId } })` returns a non-null record with non-empty `summaryText` and at least one entry in `topics`.

**Evidence:** Query the `PodcasterProfile` table by `podcasterId`; verify all profile fields are populated.

---

### VAL-MEM-006: Podcaster profile auto-rebuilds when a new episode is added

When a second (or subsequent) episode is added for an existing podcaster, the profile is upserted — incorporating transcript samples from the new episode alongside up to 10 most recent episodes.

**Pass condition:** After adding a new episode, the `PodcasterProfile` record's `updatedAt` timestamp is refreshed and `summaryText` reflects content from the newly added episode.

**Evidence:** Record the `updatedAt` of the profile before adding episode N+1; after ingestion, verify `updatedAt` has advanced and `summaryText` or `topics` include references to the new episode's content.

---

### VAL-MEM-007: Profile rebuild uses up to 10 most recent episodes

`buildPodcasterProfile` queries at most 10 episodes ordered by `createdAt DESC`, each contributing up to 5 transcript chunks to the LLM prompt. The profile must not silently drop all older content or exceed the 10-episode cap.

**Pass condition:** For a podcaster with >10 episodes, the profile generation LLM prompt includes transcript samples from exactly the 10 most recent episodes (not fewer, not more).

**Evidence:** Instrument or mock `prisma.episode.findMany` and verify `take: 10` is respected and all 10 results appear in the prompt.

---

### VAL-MEM-008: POST /api/profiles/build triggers profile building

Calling `POST /api/profiles/build` with a valid `podcasterId` invokes `buildPodcasterProfile` and returns a success response.

**Pass condition:** A `POST` to `/api/profiles/build` with `{ podcasterId: "<valid-id>" }` returns HTTP 200 and the `PodcasterProfile` record is created or updated.

**Evidence:** Send the POST request; verify HTTP status and query the `PodcasterProfile` table for the expected record.

---

### VAL-MEM-009: Conversation context includes podcaster profile

When `buildConversationContext` is called, the resulting system prompt contains the `## Your Profile` section with the podcaster's `summaryText`, `speakingStyle`, and `topics` if a `PodcasterProfile` record exists.

**Pass condition:** The system message returned by `buildConversationContext` includes the literal text from `PodcasterProfile.summaryText` and lists topics from the profile under `## Your Profile`.

**Evidence:** Create a `PodcasterProfile` for a podcaster, then call `buildConversationContext`; inspect the system prompt string for profile content.

---

### VAL-MEM-010: Conversation context includes cross-episode user-podcaster memory

When a `UserPodcasterMemory` record exists for the (userId, podcasterId) pair, `buildConversationContext` injects the `## Your History with This Listener` section containing `summaryOfPastInteractions` and `keyTopicsDiscussed`.

**Pass condition:** The system prompt includes the `## Your History with This Listener` header followed by the stored `summaryOfPastInteractions` text and listed `keyTopicsDiscussed` topics.

**Evidence:** Seed a `UserPodcasterMemory` row; call `buildConversationContext`; verify the memory section appears verbatim in the returned system message.

---

### VAL-MEM-011: AI references past conversations with the same podcaster across episodes

If a user discussed "AI killing open source" with Podcaster P in Episode A, then later Jumps In on Episode B (also by Podcaster P) about coding agents, the AI's context includes the prior conversation summary enabling it to connect both topics.

**Pass condition:** The system prompt for Episode B's conversation contains the summary from the Episode A interaction (stored in `UserPodcasterMemory.summaryOfPastInteractions`) and the AI response references or builds upon the prior discussion.

**Evidence:** After completing a conversation in Episode A, verify `UserPodcasterMemory` is created. Then initiate a conversation in Episode B and confirm the system prompt includes Episode A's interaction summary.

---

### VAL-MEM-012: User-podcaster memory is persisted after conversation ends

When a conversation ends, `updateUserPodcasterMemory` summarizes the conversation and either creates or updates the `UserPodcasterMemory` record for the (userId, podcasterId) pair.

**Pass condition:** After a conversation with ≥1 message concludes, a `UserPodcasterMemory` record exists for the user-podcaster pair with non-empty `summaryOfPastInteractions` and at least one `keyTopicsDiscussed` entry.

**Evidence:** Complete a conversation; query `UserPodcasterMemory` by `userId` and `podcasterId`; verify the record exists with meaningful content.

---

### VAL-MEM-013: Memory accumulates across multiple conversations

When a user has multiple conversations with the same podcaster (across different episodes or sessions), `updateUserPodcasterMemory` appends the new summary to `summaryOfPastInteractions` (separated by `\n\n`) and merges `keyTopicsDiscussed` without duplicates.

**Pass condition:** After conversation 1 and conversation 2 with the same podcaster, `summaryOfPastInteractions` contains both summaries (separated by double newline), and `keyTopicsDiscussed` is the deduplicated union of topics from both conversations.

**Evidence:** Complete two conversations; query `UserPodcasterMemory`; verify the summary contains two distinct paragraphs and topics array has no duplicates.

---

### VAL-MEM-014: Memory is scoped per user-podcaster pair

Memory is isolated per (userId, podcasterId) pair. User A's conversations with Podcaster P must not leak into User B's memory with Podcaster P, and User A's memory with Podcaster P must not appear when User A converses with Podcaster Q.

**Pass condition:** After User A converses with Podcaster P and User B converses with Podcaster P, each user's `UserPodcasterMemory` record contains only their own interaction summaries. User A's conversation with Podcaster Q has a separate memory record.

**Evidence:** Create distinct user-podcaster conversation pairs; query `UserPodcasterMemory` with the unique constraint `(userId, podcasterId)` and verify no cross-contamination.

---

### VAL-MEM-015: Empty conversation does not create memory

If a conversation has zero messages (user opened Jump In but sent nothing), `updateUserPodcasterMemory` should exit early without creating or modifying a `UserPodcasterMemory` record.

**Pass condition:** After triggering `updateUserPodcasterMemory` for a conversation with no `ConversationMessage` records, no new `UserPodcasterMemory` record is created (or existing record is unchanged).

**Evidence:** Call `updateUserPodcasterMemory` with a conversation that has 0 messages; query the memory table and verify no new row or modification.

---

### VAL-MEM-016: Context builder gracefully handles missing profile and memory

When no `PodcasterProfile` and no `UserPodcasterMemory` exist for a given context build, the system prompt omits the `## Your Profile` and `## Your History with This Listener` sections entirely (no empty headers or placeholder text), while still including the transcript context.

**Pass condition:** `buildConversationContext` returns a system message that does NOT contain `## Your Profile` or `## Your History with This Listener` when those records are absent, but DOES contain `## What You Were Just Talking About`.

**Evidence:** Call `buildConversationContext` with a podcaster that has no profile and a user with no memory; inspect the system prompt for absence of those sections.

---

### VAL-MEM-017: Transcript chunking produces contiguous, non-overlapping windows

The `chunkTranscript` function splits segments into chunks of approximately `chunkDurationSeconds` (default 60s). Chunks must be contiguous (no time gaps) and non-overlapping.

**Pass condition:** For any output of `chunkTranscript`, chunk[N].endTime === chunk[N+1].startTime for all adjacent pairs, and no two chunks share overlapping time ranges.

**Evidence:** Run `chunkTranscript` on sample transcript data; verify adjacency and non-overlap invariants hold.

---

### VAL-MEM-018: Trailing transcript segments are captured in a final chunk

If the last group of transcript segments does not fill a full 60-second window, they are still captured in a final chunk (not silently dropped).

**Pass condition:** `chunkTranscript` on input where the last segment ends at T produces a final chunk whose `endTime` equals T, even if the last chunk is shorter than 60 seconds.

**Evidence:** Provide transcript segments totaling e.g. 90 seconds; verify two chunks are returned — one ~60s and one ~30s — covering the full duration.

---

### VAL-MEM-019: Memory carries forward to the next session

When a user returns for a new session (new conversation, possibly days later), the previously persisted `UserPodcasterMemory` is loaded into the conversation context, ensuring continuity.

**Pass condition:** Start a new conversation with a podcaster for whom `UserPodcasterMemory` already exists; the system prompt includes the stored `summaryOfPastInteractions` and `keyTopicsDiscussed` from the prior session.

**Evidence:** Seed a `UserPodcasterMemory` record (simulating a past session); call `buildConversationContext` for a new conversation; verify the memory appears in the system prompt.

---

### VAL-MEM-020: Profile rebuild does not destroy existing profile on LLM failure

If the LLM call in `buildPodcasterProfile` fails or returns unparseable output, the existing `PodcasterProfile` should not be overwritten with empty/garbage data. The upsert should use the raw response as a fallback `summaryText`.

**Pass condition:** When the LLM returns a response that does not match the expected `SUMMARY:` / `SPEAKING_STYLE:` / etc. format, the upsert stores the full raw response in `summaryText` (fallback: `summary || response`) and does not null out the record.

**Evidence:** Mock the LLM to return unstructured text; verify `PodcasterProfile.summaryText` contains the full raw response and the record is not left empty.

---

### VAL-MEM-021: Concurrent context builds do not cause data races

Multiple simultaneous `buildConversationContext` calls for the same podcaster/user pair (e.g., user opens two tabs) should each independently resolve without corrupting shared state, since the function is read-only.

**Pass condition:** Two parallel invocations of `buildConversationContext` with identical parameters both return valid, identical system prompts without database errors.

**Evidence:** Execute two concurrent calls; verify both return successfully and the returned message arrays are equivalent.

---

### VAL-MEM-022: Podcaster name appears in system prompt even without profile

When no `PodcasterProfile` exists, the system prompt still addresses the AI as the podcaster by name (from the `Podcaster` table), falling back to "the podcaster" if the name is null.

**Pass condition:** `buildConversationContext` returns a system prompt starting with `You are an AI representation of <podcaster name>` when the `Podcaster` record has a name, or `You are an AI representation of the podcaster` when name is null.

**Evidence:** Call `buildConversationContext` with and without a named podcaster; verify the opening sentence in the system prompt.
