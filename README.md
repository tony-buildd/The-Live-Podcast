# The Live Podcast

An interactive app that lets you talk to any YouTube video in real time. Paste a URL, watch the video, pause when something is unclear or interesting, and ask a question — the AI answers with full awareness of what's being discussed at that moment.

## Problem

1. **Manual friction** — to ask an AI about a video, you have to copy-paste the transcript into ChatGPT.
2. **No context awareness** — pasting the full transcript means the AI has everything at once. It doesn't know where you are in the video or what matters to you right now.

## How It Works

1. Paste a YouTube URL — the transcript is auto-fetched and stored
2. Watch the video
3. Pause at any point and click "Jump In"
4. Ask a question via text chat
5. Get a contextually aware answer anchored to what was just being discussed
6. Chat as long as you want — hit "Resume" to continue watching

The AI has general knowledge plus the full context of what's been discussed up to your pause point. It responds conversationally, like a knowledgeable friend who watched the video with you.

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS 4
- **Data layer:** Convex
- **Auth:** Clerk
- **LLM:** Provider-agnostic (OpenAI, Ollama, or any OpenAI-compatible API)
- **Transcript:** Python sidecar service (youtube-transcript-api)

## Setup

```bash
npm install
cp .env.example .env
```

Fill in your `.env` with:
- Convex deployment URL (`NEXT_PUBLIC_CONVEX_URL`)
- Clerk keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`)
- LLM provider config (`LLM_PROVIDER`, API keys for your chosen provider)

### Start the dev stack

```bash
# Terminal 1: Convex backend
npm run convex:dev

# Terminal 2: Transcript service
npm run transcript:dev

# Terminal 3: Next.js frontend
npm run dev
```

The transcript service requires Python 3.11+. Install its dependencies first:

```bash
npm run transcript:install
```

## Testing

```bash
npm test                # Run test suite (vitest)
npx tsc --noEmit        # Type check
npx eslint .            # Lint
npm run build           # Full build
```

## Project Structure

```
src/
  app/              # Next.js routes, pages, and API handlers
  components/       # UI components (YouTubePlayer, ChatPanel, etc.)
  lib/
    chat/           # System prompt builder
    convex/         # Convex client setup
    llm/            # LLM provider abstraction (OpenAI, Ollama)
    voice/          # Speech API wrappers (future: voice mode)
convex/             # Convex schema, queries, mutations, and actions
tests/              # API and integration test coverage
transcript-service/ # Python FastAPI service for YouTube transcript extraction
docs/
  plans/            # Design documents
  feature.md        # Deferred features and cleanup backlog
  changelog.md      # Version history
```

## Architecture

```
User pastes YouTube URL
  → Next.js API route validates + fetches transcript via Python sidecar
  → Stores episode + transcript chunks in Convex

User watches video, pauses, asks question
  → Chat API loads all transcript chunks up to pause timestamp
  → Builds system prompt (transcript as cached prefix + behavioral rules)
  → Streams LLM response via SSE
  → Persists messages in Convex for session durability
```

### Key Design Decisions

- **Full transcript context** — the entire transcript up to the pause point is sent to the LLM, not just a summary or nearby chunks
- **Prompt caching** — transcript is a stable system prompt prefix, enabling 80-90% cost reduction via provider-level caching
- **Per-session persistence** — conversations are stored in Convex within a session but don't persist across videos
- **Provider-agnostic** — swap LLM providers via environment variable

## Future Vision

- Per-creator AI profiles that grow richer across episodes
- Cross-episode memory and knowledge accumulation
- Voice mode for spoken conversations
- Semantic retrieval for large transcript catalogs
- Advanced context management (summarization, RAG, hybrid approaches)

See `docs/feature.md` for the full backlog.
