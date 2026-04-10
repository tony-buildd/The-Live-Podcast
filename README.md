# The-Live-Podcast

An interactive AI podcast companion that turns prerecorded long-form video into a timeline-aware conversation. Users can paste a YouTube podcast URL, watch or listen, and ask questions that stay grounded in everything discussed up to the current moment.

## Problem

When watching videos, questions come up at specific moments, but most AI workflows ignore that timing. Copying a transcript into a general chat tool flattens the experience, so answers are no longer tied to where the user paused or what has been covered so far.

## Goal

Make prerecorded podcast and video content feel interactive by letting users pause at any point and get answers constrained to the content up to that timestamp.

## Core Experience

User is watching a video, pauses when something is unclear, asks a question, and gets an answer grounded in the transcript and context available up to that exact point.

## Features

- YouTube integration for ingesting podcast URLs and indexing transcript content
- Timeline-aware conversations based on the current playback position
- Voice mode using browser speech APIs for spoken back-and-forth interaction
- Cross-episode memory for conversations with the same podcaster
- Semantic retrieval across indexed content
- Podcaster profiles built from transcripts and prior interactions
- Authentication for user accounts and saved state

## MVP Scope

- Support the core "pause and ask" loop for prerecorded video
- Keep answers bounded to transcript context available up to the paused timestamp
- Provide a lightweight interface for asking questions while staying in the viewing flow

## Out of Scope

- Continuous real-time vision analysis
- Social or sharing features
- Full creator simulation
- Broad summary or highlight workflows unrelated to moment-based Q&A

## Tech Stack

- Framework: Next.js 16 (App Router, Turbopack)
- Language: TypeScript (strict mode)
- Styling: Tailwind CSS 4
- Data layer: Convex
- LLM: Ollama (local) or OpenAI API
- Vector and retrieval pipeline: local embeddings plus transcript/profile context services
- Voice: Web Speech API (STT) plus SpeechSynthesis (TTS)
- Auth: Clerk

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

If local model support is enabled, pull the required Ollama model before using AI features.

```bash
ollama pull llama3.1
```

## Environment

See `.env.example` for the full environment contract. Typical variables include:

- Convex deployment settings
- Clerk publishable and secret keys
- LLM provider selection
- Ollama base URL and model name
- OpenAI API key when using OpenAI

## Testing

```bash
npx vitest run --reporter=verbose
npx tsc --noEmit
npx eslint .
```

## Project Structure

```text
src/
  app/           # Next.js routes, pages, and API handlers
  components/    # Shared UI components
  lib/           # LLM, Convex, transcript, and utility modules
convex/          # Convex functions and generated client artifacts
tests/           # API and integration-facing test coverage
transcript-service/ # Python helper service for transcript processing
```
