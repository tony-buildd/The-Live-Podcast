# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2026-04-12

### Changed
- Chat system prompt redesigned: full transcript (0 to pause point) as conversational anchor
- Context assembly simplified: direct Convex query instead of action + semantic search
- Resume handler no longer triggers expensive memory-building LLM calls
- Chat/end route simplified to no-op stub
- Episode ingestion no longer schedules embedding or profile rebuild jobs

### Fixed
- Build-breaking syntax error in profiles/build/route.ts (broken merge artifact)
- Double clearTimeout bug in convex/transcript.ts

### Removed
- Dead Prisma layer (schema, SQLite databases, generated code)
- Unused memory helper modules (context-builder.ts, profile-builder.ts)
- Tracked Python bytecode and empty legacy directories
- Memory/profile/semantic-search dependencies from chat pipeline

### Added
- Shared system prompt module (src/lib/chat/system-prompt.ts) with tests
- Convex query for transcript chunks up to timestamp
- getEpisodeById public query for video title in chat context

## [Unreleased]

### Added
- Design document for MVP "Talk to the Video" (`docs/plans/2026-04-12-mvp-talk-to-the-video-design.md`)
- Feature backlog and deferred work tracking (`docs/feature.md`)
- This changelog (`docs/changelog.md`)

### Research
- Deep-dive technical analysis of codebase (architecture, bugs, security, performance)
- Context management research: prompt caching vs summarization vs RAG
- Cost analysis for LLM conversation patterns with prompt caching
