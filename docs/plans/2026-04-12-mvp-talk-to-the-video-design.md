# MVP Design: Talk to the Video

Date: 2026-04-12
Updated: 2026-04-12 (post-research revision)

## Problem

Two pain points when learning from video content:

1. Manual friction — you have to copy-paste a transcript into ChatGPT to ask about it.
2. No context awareness — pasting the full transcript means the AI has everything at once. It doesn't know where you are in the video or what matters to you right now.

## Solution

An app where you talk to a video in real time. The AI has general knowledge plus the context of what video you're watching and what point you're at. When you pause and ask a question, the answer is naturally anchored to what was just being discussed.

## Core Experience

Watch a video. Pause when something is unclear or interesting. Ask a question. Get an answer that understands where you are. Continue watching.

The conversation can go as long and as deep as you want — it only pauses when you hit play again.

## Interaction Model

The AI is not an "assistant referencing a transcript." It's a conversational partner that understands the video context. It uses its foundation knowledge to understand and answer, but its responses are shaped by what's being discussed at the current moment.

Think of it as: the AI has general knowledge, knows the video content, and knows exactly what point the viewer paused at. That combination produces contextually relevant answers without the manual friction of copy-pasting transcripts.

## Key Design Decisions

### Timestamp Behavior
Fixed per session. When the user clicks "Jump In", the current timestamp is captured once. All messages in that conversation use that timestamp's context. The timestamp does not update if the user plays/pauses again mid-conversation.

### Context Strategy
Full transcript from 0 to pause point, sent as a stable system prompt prefix. For a 1-hour podcast this is ~10K tokens — well within modern LLM context limits (128K+). No summarization, no retrieval — brute force with prompt caching for cost efficiency.

### Cost Management via Prompt Caching
The transcript context is placed at the front of the system prompt as a static prefix. LLM providers cache this prefix across conversation turns:

- Anthropic: 90% discount on cached tokens ($0.30/M vs $3/M on Sonnet 4.6). Cache TTL: 5 minutes (refreshed on each hit). Requires explicit `cache_control` parameter.
- OpenAI: 50% discount on cached tokens. Automatic, no configuration needed. Minimum 1024 tokens.

For a 10-message conversation on a 1-hour video:
- Without caching: ~$0.45
- With caching (Anthropic): ~$0.08 (82% savings)
- With caching (OpenAI): ~$0.15 (67% savings)

Quality is identical — caching is a pure infrastructure optimization. The LLM sees the exact same tokens.

### Persistence Model
- Within a session: Messages stored in Convex (`conversationMessages` table) for crash resilience and scroll-back. If the user refreshes, conversation can be restored.
- Across videos: No persistence. New video = fresh state. No memory, no profiles, no cross-episode anything.
- The `endConversation` memory-building flow (which makes expensive LLM calls to summarize and extract topics) is deferred entirely.

### LLM Provider
Provider-agnostic. The existing `LLMProvider` abstraction (factory pattern, env var switching) supports OpenAI and Ollama. User will choose their own provider. Architecture stays open.

### Deployment
Local development only for MVP. The Python transcript sidecar runs on localhost:8765. Deployment is a future concern.

## MVP Scope

### What We Build

- YouTube player and chat panel side by side
- Paste a URL, transcript is auto-fetched and stored
- Pause at any point, ask a question via text chat
- AI responds with awareness of the current video moment
- Conversation continues freely until user hits play
- Conversation state preserved within a session (stored in Convex)

### Data Flow

```
ADD VIDEO
  YouTube URL
    → Next.js API route validates URL, extracts video ID
    → Fetch transcript from Python sidecar (localhost:8765)
    → Fetch video metadata from YouTube oEmbed API
    → Pass segments to Convex action: chunk into 15-second segments, store episode + chunks

WATCH & ASK
  User clicks "Jump In" → video pauses → timestamp captured
    → Load ALL transcript chunks from 0 to pause timestamp
    → Build system prompt:
      [STATIC PREFIX — cached across turns]
      - Video context and what's being discussed
      - Full transcript up to pause point
      [DYNAMIC SUFFIX — new each turn]
      - Conversation history
      - User's new question
    → Stream response from cloud LLM via SSE
    → Persist assistant message to Convex

WITHIN SESSION
  User can keep chatting (same timestamp context, growing history)
  User hits play → conversation stays in sidebar, can scroll back
  User pauses again → continues existing conversation

ACROSS SESSIONS
  Navigate away or switch video → no memory carried over
```

### System Prompt Structure

```
[STATIC PREFIX — cacheable]
You are helping a viewer who is watching a video.
They paused at [timestamp] to ask you a question.

Here is what has been discussed in the video so far:
[Full transcript from 0:00 to pause point]

The viewer just paused during a discussion about [recent topic summary].

[BEHAVIORAL RULES]
- Respond conversationally. You have general knowledge and the context
  of what's being discussed in the video.
- The conversation is anchored to what was just being discussed, but
  you can draw on broader knowledge to give good answers.
- Be natural. Don't lecture. Talk like a knowledgeable friend.

[DYNAMIC SUFFIX — not cached]
[Conversation history]
User: [new question]
```

### Tech Stack (MVP)

- Framework: Next.js 16 (App Router)
- Language: TypeScript (strict mode)
- Styling: Tailwind CSS 4
- Data layer: Convex
- Auth: Clerk
- LLM: Cloud API (provider-agnostic, env var configured)
- Transcript: Python sidecar service (youtube-transcript-api)

### What We Keep From Current Codebase

- YouTube player component (`YouTubePlayer.tsx`)
- Chat panel component (`ChatPanel.tsx`)
- Convex schema: `episodes`, `transcriptChunks`, `conversations`, `conversationMessages`
- Clerk authentication
- Transcript service (`transcript-service/`)
- SSE streaming from API routes
- LLM provider abstraction (`src/lib/llm/`)
- Existing test coverage for validation and auth

### What We Defer (documented in feature.md)

- Creator profile extraction and persona roleplay
- Cross-episode memory and per-creator knowledge accumulation
- Semantic/vector search retrieval
- Embeddings pipeline
- Voice mode (architecture should remain voice-ready)
- "End conversation" memory persistence flow (expensive LLM summarization)
- Stable podcaster identity (YouTube channel extraction)
- Context management research (summarization, RAG, hybrid approaches)

### What We Remove (documented in feature.md before removal)

- Dead Prisma layer (`prisma/`, `src/generated/prisma/`)
- Unused memory helpers (`src/lib/memory/context-builder.ts`, `profile-builder.ts`)
- Duplicate transcript implementations
- Tracked artifacts (`.pyc`, `.db` files)
- Empty `transcript_service/` directory

## What We Fix

1. Build blocker — syntax error in `src/app/api/profiles/build/route.ts`
2. System prompt — redesign for contextual conversation with prompt caching structure
3. Transcript context — full transcript to pause point (not 300s window)
4. SSE streaming — fix framing issues, surface errors to client
5. Library model — shared catalog for MVP (personal use, single user)
6. Repo hygiene — remove tracked artifacts, update `.gitignore`
7. Chat API — remove dependency on memory/profile context (simplify to transcript-only)

## Success Criteria

- User can paste a YouTube URL and the transcript is auto-ingested
- User can watch the video, pause at any point, and ask a question
- The AI response is contextually relevant to what was just being discussed
- The conversation flows naturally and can go as deep as the user wants
- Conversation persists within a session (survives page refresh)
- New video = clean slate (no memory carried over)
- The project builds, lints, and type-checks cleanly
- Existing tests continue to pass
- Prompt caching is active (verifiable via API response metadata)

## Technical Research Completed

### Context Management (researched 2026-04-12)
- Full transcript brute-force is viable for single episodes (10-20K tokens fits in 128K context)
- Prompt caching eliminates the cost concern (80-90% savings on Anthropic, 50% on OpenAI)
- Summarization is lossy and risky for transcript content — user may ask about specific details
- RAG/vector retrieval is the long-term answer for cross-episode and large catalogs
- Conversation history compression only needed for 20+ message conversations (future concern)

### Sources
- Anthropic prompt caching: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- OpenAI prompt caching: https://platform.openai.com/docs/guides/prompt-caching
- Context management best practices: https://community.openai.com/t/best-practices-for-cost-efficient-high-quality-context-management-in-long-ai-chats/1373996
- JetBrains context research: https://blog.jetbrains.com/research/2025/12/efficient-context-management/

## Future Vision

Each YouTube creator builds a persistent AI profile that grows richer across episodes and conversations. The AI representation of a creator becomes increasingly authentic over time. Voice mode brings the experience closer to a real conversation. Context management evolves from brute-force to hybrid summarization + retrieval as the catalog grows. But all of this builds on top of the core "talk to the video" loop that the MVP delivers.
