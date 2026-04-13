# Feature Backlog & Deferred Work

Items documented here are intentionally deferred from the MVP. They represent future iterations, cleanup tasks, and technical debt tracked for later.

## Deferred Features

### Creator Persona & Profiles
- Full roleplay persona (AI responds AS the creator with their speaking style)
- Profile extraction from transcripts (personality, expertise, style)
- `podcasterProfiles` table is in schema — populate it when ready
- Stable podcaster identity via YouTube channel extraction (replace placeholder `Podcaster (${youtubeId})`)

### Cross-Episode Memory
- Per-creator knowledge accumulation across episodes
- `userPodcasterMemory` table is in schema — use it when ready
- `endConversation` memory-building flow (LLM summarization + topic extraction)
- Requires stable podcaster identity first

### Advanced Retrieval
- Semantic/vector search using Convex `vectorIndex("by_embedding")` (already in schema)
- Embeddings pipeline (local or OpenAI)
- Context management research: summarization vs RAG vs hybrid
- Relevant when catalog grows beyond single-episode use

### Voice Mode
- Web Speech API wrappers exist (`src/lib/voice/`)
- Architecture should remain voice-ready (conversational response style)
- Future: upgrade to cloud TTS (ElevenLabs, OpenAI TTS) for creator voice matching

### Deployment
- Transcript sidecar is localhost-only — needs a deployable boundary
- `TRANSCRIPT_SERVICE_URL` not documented in `.env.example`
- Consider moving transcript fetching to a serverless function or edge worker

### Library Ownership
- Episodes currently have no `userId` field — shared catalog
- Decide: shared vs per-user library
- Align schema, route auth, and UI copy to that decision

### Conversation History
- Per-video conversation history (review past chats)
- Conversation export/sharing
- Conversation search

### Multi-model
- Model not only understand the context based on the transcript but also can see what's on the video (using vision capabilities) and can answer questions related to that. This would be a game-changer in terms of interactivity and usefulness, especially for educational content.
