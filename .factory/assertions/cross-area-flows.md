# Cross-Area Flow Assertions

### VAL-CROSS-001: First-Visit Full Funnel
A brand-new user lands on `/`, opens the "Add Podcast" modal, pastes a YouTube URL, submits it, and is redirected to `/watch/[id]`. The watch page loads with the embedded video and transcript. The user clicks "Jump In," a `Conversation` is created linked to the `Episode`, `Podcaster`, and `User`, and the chat panel opens. The user sends a message and receives an AI response in character. Refreshing the page preserves the conversation.
**Pass condition:** User progresses through `/` → modal → `/watch/[id]` → Jump In → chat message → AI reply without errors; a `Conversation` and at least one `ConversationMessage` (role: assistant) exist in the database.
**Evidence:** Check route navigation, `Conversation` + `ConversationMessage` rows in DB, no 500 errors in server logs.

### VAL-CROSS-002: Auth Gate with Redirect-Back
An unauthenticated user navigates directly to `/watch/[id]`. The app redirects them to the login page. After successful authentication, the user is redirected back to the original `/watch/[id]` URL (not `/` or another default).
**Pass condition:** The post-login redirect URL matches the originally requested `/watch/[id]`.
**Evidence:** Check redirect query parameter or callback URL on the auth flow; verify final URL in the browser after login.

### VAL-CROSS-003: Auth Gate on Jump-In Action
An unauthenticated user can view the watch page (public content), but clicking "Jump In" triggers an auth prompt or redirect. After authenticating, the user returns to the watch page and can immediately start chatting without re-clicking "Jump In."
**Pass condition:** Jump In is gated behind auth; post-auth, conversation opens seamlessly.
**Evidence:** Verify no `Conversation` is created for unauthenticated users; after auth, a `Conversation` row is created with the correct `userId`.

### VAL-CROSS-004: Cross-Episode Memory Continuity
User chats with podcaster X in Episode A, discussing topic T. User closes the app, returns later, and chats with the same podcaster X in Episode B. The AI's system prompt includes the `UserPodcasterMemory.summaryOfPastInteractions` referencing topic T from Episode A.
**Pass condition:** The `buildConversationContext` system prompt for Episode B's conversation contains the memory summary that mentions topic T from Episode A.
**Evidence:** Inspect the `UserPodcasterMemory` row for `(userId, podcasterId)`; verify `summaryOfPastInteractions` is non-empty and references Episode A topics; inspect the system prompt sent to the LLM in Episode B's conversation.

### VAL-CROSS-005: Memory Accumulation Across Multiple Episodes
User has conversations across episodes A, B, and C with the same podcaster. After each conversation ends, `updateUserPodcasterMemory` appends a new summary and merges `keyTopicsDiscussed`. The combined memory is available in the context for episode D.
**Pass condition:** `UserPodcasterMemory.keyTopicsDiscussed` contains deduplicated topics from all three episodes; `summaryOfPastInteractions` contains three distinct conversation summaries separated by double newlines.
**Evidence:** Query `UserPodcasterMemory` for the user-podcaster pair; verify array length and summary paragraph count.

### VAL-CROSS-006: Episode Ingestion to Immediate Watch and Chat
User submits a YouTube URL. The system extracts the video ID (`extractYouTubeId`), fetches the transcript (`fetchTranscript`), chunks it (`chunkTranscript`), and persists `Episode` + `TranscriptChunk` rows. User is redirected to `/watch/[id]`. The video embed loads, and "Jump In" is enabled (not disabled due to missing transcript). Sending a chat message returns an AI response that references recent transcript content.
**Pass condition:** `TranscriptChunk` rows exist for the new episode before the user lands on the watch page; AI response references content from the transcript.
**Evidence:** Check `Episode` and `TranscriptChunk` table rows; verify `buildConversationContext` retrieves non-empty `recentChunks`; inspect AI reply for transcript-relevant content.

### VAL-CROSS-007: Ingestion Failure Does Not Block UI
User submits a YouTube URL for a video with no available transcript (e.g., live stream without captions). The ingestion fails gracefully — user sees an error toast or message. The episode is not persisted with zero chunks. The user can navigate back and try another URL.
**Pass condition:** No `Episode` row with zero `TranscriptChunk` children persists; user sees a meaningful error; navigation back to `/` works.
**Evidence:** Check DB for orphan episodes; check UI for error message; verify no crash or blank screen.

### VAL-CROSS-008: Library to Watch to Chat to Library Navigation
User navigates to the library page, clicks an episode card, lands on `/watch/[id]`, presses "Jump In," sends a chat message, presses a back/close button, and returns to the library. The library still shows the episode and conversation history is preserved.
**Pass condition:** Full round-trip navigation completes without errors; conversation messages persist after returning to library and re-opening the episode.
**Evidence:** Verify browser history and route transitions; check `ConversationMessage` count is unchanged after round-trip.

### VAL-CROSS-009: Profile Auto-Rebuild on New Episode Ingestion
User adds episode 1 from podcaster X. `buildPodcasterProfile` is called and creates a `PodcasterProfile` with initial topics and traits. User adds episode 2 from the same podcaster. `buildPodcasterProfile` is called again, now using transcripts from both episodes (`take: 10` query). The upserted profile has richer/updated data.
**Pass condition:** After adding episode 2, the `PodcasterProfile` row (id: `{podcasterId}-latest`) has an `updatedAt` timestamp later than after episode 1; `topics` array is equal or larger; `summaryText` incorporates information from both episodes.
**Evidence:** Query `PodcasterProfile` before and after episode 2 ingestion; compare `topics.length`, `personalityTraits.length`, and `updatedAt`.

### VAL-CROSS-010: Profile Quality Improves Chat Quality
After `PodcasterProfile` is rebuilt with data from multiple episodes, a new conversation's system prompt (built by `buildConversationContext`) includes the enriched profile summary, speaking style, and topics. The AI response is more in-character compared to a conversation started when only one episode existed.
**Pass condition:** The system prompt for a new conversation includes `podcasterProfile.summaryText`, `speakingStyle`, and `topics` from the latest profile.
**Evidence:** Inspect the `Message[]` array returned by `buildConversationContext`; verify the system prompt contains the profile sections.

### VAL-CROSS-011: Transcript Timestamp Context Tracks Video Position
User watches a video, pauses at timestamp T₁, and presses "Jump In." The AI context includes transcript chunks where `startTime <= T₁` and `startTime >= T₁ - 300`. User resumes video, pauses later at T₂, and sends another message. The new context now reflects chunks around T₂, not T₁.
**Pass condition:** For each "Jump In" or message, `buildConversationContext` is called with the current `currentTimestamp`; returned transcript context matches the 5-minute window around that timestamp.
**Evidence:** Verify the `where` clause of `transcriptChunk.findMany` receives the correct timestamp; inspect the resulting system prompt text.

### VAL-CROSS-012: Conversation Resume After App Close
User starts a conversation in Episode A at timestamp T, sends 3 messages, closes the browser. User returns, navigates to Episode A, and resumes. The previous 3 messages are loaded from `ConversationMessage` rows. The user can continue chatting in the same `Conversation`.
**Pass condition:** Returning to the episode loads existing `ConversationMessage` rows in chronological order; new messages append to the same `conversationId`.
**Evidence:** Check `ConversationMessage` query for the existing `Conversation.id`; verify message count = previous count + new messages.

### VAL-CROSS-013: Voice-to-Text Mode Switch in Same Conversation
User starts a voice conversation (voice mode). After several voice exchanges, user switches to text input. Messages from both voice and text modes are stored as `ConversationMessage` rows under the same `conversationId`. The chat UI displays all messages in chronological order regardless of input mode.
**Pass condition:** A single `Conversation` row contains messages from both voice and text inputs; UI renders them in `createdAt` order.
**Evidence:** Query `ConversationMessage` for the conversation; verify no duplicate conversations were created for the mode switch; inspect UI rendering order.

### VAL-CROSS-014: Voice Mode Uses Same Context Pipeline
When the user is in voice mode and asks a question, the system uses the same `buildConversationContext` pipeline (transcript context, podcaster profile, user memory) as text mode. The AI's voice response is informed by the same system prompt.
**Pass condition:** Voice-mode requests invoke `buildConversationContext` with the same parameters as text-mode; the system prompt is identical for both modes at the same timestamp.
**Evidence:** Trace the voice request handler; verify it calls `buildConversationContext` and passes the result to the LLM.

### VAL-CROSS-015: Error Recovery During Chat — Network Failure
User is chatting. A network error occurs during an LLM call (e.g., timeout or 500 from OpenAI/Ollama). The app displays a toast notification with an actionable error message. The user clicks "Retry." The failed message is re-sent, and the conversation continues. No duplicate messages are created.
**Pass condition:** Error toast appears; retry succeeds; `ConversationMessage` count matches expected (no duplicates from the failed attempt).
**Evidence:** Simulate LLM failure; check toast UI; verify DB message count; verify retry creates exactly one new assistant message.

### VAL-CROSS-016: Error Recovery During Ingestion — Partial Failure
Transcript fetch succeeds but chunking or DB write fails mid-way. The system rolls back — no partial `Episode` or orphaned `TranscriptChunk` rows remain. User sees an error and can retry the URL submission.
**Pass condition:** After a mid-ingestion failure, no `Episode` row or `TranscriptChunk` rows for that video exist in the DB; user can re-submit the same URL successfully.
**Evidence:** Simulate a DB write failure after transcript fetch; query DB for the youtube URL; verify it's absent; re-submit and verify success.

### VAL-CROSS-017: Responsive Layout Across Pages — Mobile
User navigates from `/` (home) → library → `/watch/[id]` → chat panel on a mobile viewport (≤ 640px). Each page renders correctly: no horizontal overflow, touch targets are ≥ 44px, video player scales to viewport width, chat panel takes full screen or slides in as a drawer.
**Pass condition:** All pages render without horizontal scroll on a 375px-wide viewport; interactive elements meet minimum touch target size.
**Evidence:** Inspect layout at mobile breakpoint; verify no `overflow-x: scroll`; measure touch target dimensions.

### VAL-CROSS-018: Responsive Watch Page — Desktop to Mobile
On desktop, the watch page shows video + chat side by side. On mobile, the layout stacks vertically or the chat is a slide-over panel. Transitioning between breakpoints (resize) does not break the layout or lose chat state.
**Pass condition:** Resizing from 1280px to 375px width transitions the layout without JS errors; chat messages remain visible; no content is clipped or hidden.
**Evidence:** Resize browser; inspect DOM layout; verify chat message count is unchanged.

### VAL-CROSS-019: Podcaster Uniqueness Across Episodes
User adds two episodes from the same YouTube channel. Both episodes reference the same `Podcaster` row (matched by `channelUrl`). A single `PodcasterProfile` is built from both episodes' transcripts. Conversations for both episodes share the same `podcasterId`.
**Pass condition:** Only one `Podcaster` row exists for the channel; both `Episode` rows reference the same `podcasterId`; `PodcasterProfile` query returns a single profile for that podcaster.
**Evidence:** Query `Podcaster` by `channelUrl`; verify uniqueness; check `Episode.podcasterId` for both episodes.

### VAL-CROSS-020: Conversation Scoped to Episode but Memory Scoped to Podcaster
Each conversation is tied to a specific `episodeId` (and `timestampInEpisode`), but `UserPodcasterMemory` is keyed by `(userId, podcasterId)` — not by episode. This means memory accumulates across episodes of the same podcaster, while conversation context (transcript chunks) is episode-specific.
**Pass condition:** Two conversations with different `episodeId` values but the same `podcasterId` share one `UserPodcasterMemory` row; each conversation's system prompt includes episode-specific transcript chunks but shared memory.
**Evidence:** Inspect `buildConversationContext` output for two different episodes of the same podcaster; verify transcript section differs but memory section is identical.

### VAL-CROSS-021: LLM Provider Switch Does Not Break Cross-Area Flows
The app supports switching between OpenAI and Ollama via `LLM_PROVIDER` env var. Profile building, context building, memory summarization, and chat all use `getLLMProvider()`. Switching providers mid-deployment does not corrupt existing data or break in-progress flows.
**Pass condition:** After changing `LLM_PROVIDER` from `ollama` to `openai` (or vice versa), all flows (ingestion, chat, profile build, memory update) continue to work; existing `PodcasterProfile` and `UserPodcasterMemory` data remains valid.
**Evidence:** Change env var; trigger each flow; verify no errors; verify existing DB rows are unchanged.

### VAL-CROSS-022: Concurrent Episode Ingestion and Chat
User is chatting on Episode A. In another tab, they add Episode B from the same podcaster. The ingestion of Episode B triggers `buildPodcasterProfile`, which updates the podcaster profile. The ongoing chat on Episode A is not disrupted — existing messages remain, and new messages still receive valid AI responses.
**Pass condition:** Chat on Episode A continues uninterrupted during and after Episode B ingestion; no 500 errors; the profile update does not invalidate in-flight requests.
**Evidence:** Run ingestion and chat concurrently; verify both complete successfully; check for race conditions in `PodcasterProfile` upsert.

### VAL-CROSS-023: Memory Update Triggers After Conversation End
After a user finishes chatting (navigates away from chat or explicitly ends conversation), `updateUserPodcasterMemory` is called with the `conversationId`. The function summarizes the conversation and updates `UserPodcasterMemory`. This memory is then available for the next conversation with the same podcaster.
**Pass condition:** After conversation end, `UserPodcasterMemory` row is created or updated; `summaryOfPastInteractions` includes content from the just-ended conversation.
**Evidence:** End a conversation; query `UserPodcasterMemory`; verify `updatedAt` is recent; verify summary references the conversation's topics.

### VAL-CROSS-024: Empty Conversation Does Not Pollute Memory
User presses "Jump In" but sends zero messages, then navigates away. `updateUserPodcasterMemory` is called but finds zero messages. The function returns early without creating or modifying `UserPodcasterMemory`.
**Pass condition:** `UserPodcasterMemory` is not created or modified for a zero-message conversation.
**Evidence:** Check the early return in `updateUserPodcasterMemory` when `messages.length === 0`; verify no DB write occurs.

### VAL-CROSS-025: Transcript Chunk Embedding Integration with Chat Context
`TranscriptChunk` has an `embeddingId` field for vector search. When embeddings are populated, the chat context builder can use vector similarity search to find the most relevant chunks (beyond the 5-minute time window). This enriches the AI's response with semantically relevant content from elsewhere in the episode.
**Pass condition:** When `embeddingId` is populated on transcript chunks, the context builder (or an extended version) can retrieve chunks by semantic relevance; the system prompt includes both time-window and semantically-relevant transcript excerpts.
**Evidence:** Verify `TranscriptChunk.embeddingId` field exists in schema; check if vector search is integrated into `buildConversationContext` or a parallel path.

### VAL-CROSS-026: User Deletion Cascades Across All Areas
When a `User` is deleted, all related data cascades: `Conversation` rows, `ConversationMessage` rows, and `UserPodcasterMemory` rows are deleted. No orphaned data remains that could leak into other users' experiences.
**Pass condition:** After deleting a user, zero rows exist in `Conversation`, `ConversationMessage`, and `UserPodcasterMemory` for that `userId`.
**Evidence:** Delete user via Prisma; query all related tables; verify empty results.

### VAL-CROSS-027: Episode Deletion Cascades to Conversations and Chunks
When an `Episode` is deleted, all `TranscriptChunk` and `Conversation` (and their `ConversationMessage`) rows are cascade-deleted. The podcaster profile is not deleted (it's built from all episodes). Library UI no longer shows the episode.
**Pass condition:** After episode deletion, zero `TranscriptChunk` and `Conversation` rows reference the deleted `episodeId`; `PodcasterProfile` still exists.
**Evidence:** Delete episode; query related tables; verify cascades; verify profile persists.

### VAL-CROSS-028: Podcaster Deletion Cascades Everything
When a `Podcaster` is deleted, all `Episode`, `TranscriptChunk`, `Conversation`, `ConversationMessage`, `PodcasterProfile`, and `UserPodcasterMemory` rows are cascade-deleted.
**Pass condition:** After podcaster deletion, zero rows reference the deleted `podcasterId` in any table.
**Evidence:** Delete podcaster; query all related tables; verify complete cascade.

### VAL-CROSS-029: Multiple Users Same Episode Independence
Two users both watch and chat on the same episode. Each has their own `Conversation`, `ConversationMessage` history, and `UserPodcasterMemory`. User A's memory does not leak into User B's context.
**Pass condition:** `buildConversationContext` for User A includes only User A's `UserPodcasterMemory`; User B's context includes only User B's memory; both share the same `PodcasterProfile`.
**Evidence:** Create conversations for two users on the same episode; inspect system prompts for each; verify memory isolation.

### VAL-CROSS-030: Full Flow Timing — Ingestion to First AI Response Under 30s
End-to-end: user submits URL → transcript fetched → chunks persisted → profile built → user clicks Jump In → sends message → receives AI response. The total wall-clock time from URL submission to first AI response should be under 30 seconds for a typical podcast episode (< 2 hours).
**Pass condition:** Measured end-to-end latency is < 30 seconds for an episode with ≤ 500 transcript segments.
**Evidence:** Time each phase: transcript fetch, chunk persistence, profile build, context build, LLM response; sum total.
