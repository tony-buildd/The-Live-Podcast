# TonyPodcast

An interactive AI podcast companion. Paste YouTube podcast URLs, watch/listen, and press "Jump In" to have voice or text conversations with an AI that embodies the podcaster.

## Features

- **YouTube Integration** — Paste any YouTube podcast URL to fetch and index the transcript
- **Jump In Conversations** — Pause at any point and chat with an AI that knows everything discussed up to that timestamp
- **Voice Mode** — Full voice conversation loop using browser Speech APIs (Chrome). Speak, get AI response via TTS, continue naturally
- **Cross-Episode Memory** — The AI remembers past conversations across episodes with the same podcaster
- **Semantic Search** — Vector-based retrieval finds relevant content across all episodes, not just the current timestamp
- **Podcaster Profiles** — AI builds personality profiles from transcripts (speaking style, topics, traits)
- **Authentication** — NextAuth.js with email/password and Google OAuth

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS 4
- **Database:** SQLite via Prisma 7
- **LLM:** Ollama (local) or OpenAI API
- **Vector Store:** Vectra (file-based) + @huggingface/transformers
- **Voice:** Web Speech API (STT) + SpeechSynthesis (TTS)
- **Auth:** NextAuth.js with Prisma adapter

## Setup

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Generate Prisma client and create database
npx prisma generate
npx prisma db push

# Pull an Ollama model (required for AI features)
ollama pull llama3.1

# Start development server
npm run dev
# Or use direct path if npx shims are broken:
node node_modules/next/dist/bin/next dev --port 3100
```

## Environment Variables

See `.env.example` for all required variables. Key ones:

| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | SQLite path (default: file:./dev.db) |
| LLM_PROVIDER | Yes | "ollama" or "openai" |
| OLLAMA_BASE_URL | If ollama | Default: http://localhost:11434 |
| OLLAMA_MODEL | If ollama | Default: llama3.1 |
| NEXTAUTH_SECRET | Yes | Session encryption key |
| NEXTAUTH_URL | Yes | App URL (default: http://localhost:3100) |

## Testing

```bash
# Run all tests
npx vitest run --reporter=verbose

# Typecheck
npx tsc --noEmit

# Lint
npx eslint .
```

## Project Structure

```
src/
  app/           # Next.js pages and API routes
    api/         # REST endpoints (episodes, chat, auth, profiles)
    auth/        # Sign in / sign up pages
    library/     # Episode library page
    watch/[id]/  # Watch + chat page
  components/    # React components
  lib/           # Core library code
    llm/         # LLM provider abstraction
    memory/      # Context builder, profile builder, vector store
    transcript/  # YouTube transcript fetching
    voice/       # Speech recognition & synthesis wrappers
    auth.ts      # NextAuth configuration
    db.ts        # Prisma client singleton
```
