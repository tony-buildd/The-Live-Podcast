# Episode Ingestion — Behavioral Assertions

---

## POST /api/episodes (Ingest)

### VAL-INGEST-001: Valid YouTube watch URL creates Episode
When a user submits a valid `https://www.youtube.com/watch?v=XXXXXXXXXXX` URL via `POST /api/episodes`, the system extracts the video ID, fetches the transcript, creates (or reuses) a Podcaster record, creates an Episode record, stores TranscriptChunk records, and returns a 201 response containing the episode data.
**Pass condition:** Response status is 201; Episode row exists in DB with correct `youtubeId`, `youtubeUrl`, `title`; associated TranscriptChunk rows exist with non-empty `text`, valid `startTime`/`endTime`.
**Evidence:** Network response body & status code; DB query for Episode + TranscriptChunks.

### VAL-INGEST-002: Valid youtu.be short URL creates Episode
When a user submits a valid `https://youtu.be/XXXXXXXXXXX` short-form URL, the system correctly extracts the video ID and proceeds with ingestion identically to a full watch URL.
**Pass condition:** Response status is 201; `youtubeId` matches the 11-character ID from the short URL.
**Evidence:** Network response body; DB query for Episode.

### VAL-INGEST-003: Valid YouTube embed URL creates Episode
When a user submits a `https://www.youtube.com/embed/XXXXXXXXXXX` URL, the system extracts the ID and ingests the episode.
**Pass condition:** Response status is 201; Episode record created with correct `youtubeId`.
**Evidence:** Network response body.

### VAL-INGEST-004: Valid YouTube Shorts URL creates Episode
When a user submits a `https://www.youtube.com/shorts/XXXXXXXXXXX` URL, the system extracts the ID and ingests the episode.
**Pass condition:** Response status is 201; Episode record created with correct `youtubeId`.
**Evidence:** Network response body.

### VAL-INGEST-005: Completely invalid URL returns 400
When a user submits a string that is not a recognizable YouTube URL (e.g., `not-a-url`, `https://example.com`, `ftp://youtube.com/watch?v=abc`), the system returns a 400 error with a descriptive message indicating the URL is invalid.
**Pass condition:** Response status is 400; response body contains an error message referencing invalid URL; no Episode or TranscriptChunk rows created.
**Evidence:** Network response status & body; DB query confirms no new records.

### VAL-INGEST-006: YouTube URL with invalid/missing video ID returns 400
When a user submits a YouTube-domain URL that lacks a valid 11-character video ID (e.g., `https://www.youtube.com/watch?v=`, `https://youtube.com/`), the system returns a 400 error.
**Pass condition:** Response status is 400; descriptive error message returned; no DB side effects.
**Evidence:** Network response status & body.

### VAL-INGEST-007: Empty or missing URL field returns 400
When a user submits a request with an empty string or missing URL field in the body, the system returns a 400 error.
**Pass condition:** Response status is 400; error message indicates URL is required.
**Evidence:** Network response status & body.

### VAL-INGEST-008: URL with no captions available returns error
When a user submits a valid YouTube URL for a video that has no captions/transcript available, the `YoutubeTranscript.fetchTranscript` call fails and the system returns an appropriate error (e.g., 422 or 400) with a message indicating no transcript is available. No Episode or TranscriptChunk rows are persisted.
**Pass condition:** Response status is 422 (or similar non-2xx); error message references transcript unavailability; DB has no partial Episode or orphaned records.
**Evidence:** Network response status & body; DB query confirms no new Episode.

### VAL-INGEST-009: Duplicate URL returns conflict error
When a user submits a YouTube URL for an episode that has already been ingested (same `youtubeUrl` or `youtubeId`), the system returns a 409 Conflict (or similar) with a message indicating the episode already exists. No duplicate records are created.
**Pass condition:** Response status is 409; response body references existing episode (ideally includes its ID); Episode count for that `youtubeId` remains exactly 1.
**Evidence:** Network response status & body; DB query `SELECT count(*) FROM Episode WHERE youtubeId = ?` returns 1.

### VAL-INGEST-010: Auto-creation of Podcaster for new channel
When an episode is ingested and no Podcaster record exists for the video's channel, the system creates a new Podcaster with the channel name and `channelUrl`.
**Pass condition:** After successful 201 response, a new Podcaster row exists with the correct `name` and `channelUrl`; the Episode's `podcasterId` references this Podcaster.
**Evidence:** DB query for Podcaster by `channelUrl`; Episode FK check.

### VAL-INGEST-011: Reuse existing Podcaster for same channel
When a second episode from the same YouTube channel is ingested, the system reuses the existing Podcaster record instead of creating a duplicate.
**Pass condition:** After ingesting two episodes from the same channel, only one Podcaster row exists for that `channelUrl`; both Episodes share the same `podcasterId`.
**Evidence:** DB query `SELECT count(*) FROM Podcaster WHERE channelUrl = ?` returns 1; both Episode rows have identical `podcasterId`.

### VAL-INGEST-012: TranscriptChunks are correctly chunked by duration
After successful ingestion, the TranscriptChunk records reflect the ~60-second chunking logic: each chunk's `endTime - startTime` is approximately 60 seconds (except possibly the last chunk), chunks are contiguous (no gaps), and `text` is non-empty.
**Pass condition:** TranscriptChunk rows ordered by `startTime` show contiguous, non-overlapping windows; all `text` fields are non-empty strings; `startTime < endTime` for every row.
**Evidence:** DB query for TranscriptChunks ordered by `startTime`.

### VAL-INGEST-013: Episode metadata fields are populated
After successful ingestion, the Episode record contains `title` (non-empty), and optionally `description`, `thumbnailUrl`, and `publishedAt` if the YouTube API or scraping provides them.
**Pass condition:** `title` is a non-empty string; `youtubeUrl` matches the submitted URL; `youtubeId` is an 11-character string.
**Evidence:** DB query or API response body for the created Episode.

### VAL-INGEST-014: Malformed JSON body returns 400
When the request body is not valid JSON, the system returns a 400 error.
**Pass condition:** Response status is 400; descriptive parse error message.
**Evidence:** Network response when sending `Content-Type: application/json` with malformed body.

### VAL-INGEST-015: Non-POST method returns 405
When a PUT, DELETE, or PATCH request is sent to `POST /api/episodes`, the system returns 405 Method Not Allowed.
**Pass condition:** Response status is 405.
**Evidence:** Network response status.

### VAL-INGEST-016: Transactional safety — failed transcript fetch leaves no partial records
If the transcript fetch fails mid-ingestion (network error, YouTube rate limit, etc.), neither an Episode nor any TranscriptChunks are persisted. The Podcaster may exist if it was pre-existing, but no orphaned Episode should remain.
**Pass condition:** DB has no Episode row for the attempted `youtubeId`; no orphaned TranscriptChunks.
**Evidence:** DB queries after receiving error response.

### VAL-INGEST-017: URL with extra query parameters is handled
When a user submits a YouTube URL with extra query params (e.g., `https://www.youtube.com/watch?v=XXXXXXXXXXX&t=120&list=PLxyz`), the system still correctly extracts the video ID and ingests successfully.
**Pass condition:** Response status is 201; `youtubeId` correctly extracted ignoring extra params.
**Evidence:** Network response; DB Episode record.

---

## GET /api/episodes (List)

### VAL-INGEST-018: Empty state returns empty array
When no episodes have been ingested, `GET /api/episodes` returns a 200 with an empty array (or object with empty `episodes` list).
**Pass condition:** Response status is 200; body contains an empty array/list.
**Evidence:** Network response body.

### VAL-INGEST-019: List returns all ingested episodes
After ingesting N episodes, `GET /api/episodes` returns all N episodes with at minimum `id`, `title`, `youtubeUrl`, `youtubeId`, and `createdAt`.
**Pass condition:** Response status is 200; array length equals N; each item has the expected fields.
**Evidence:** Network response body; cross-check with DB count.

### VAL-INGEST-020: Listed episodes include Podcaster info
Each episode in the list response includes associated Podcaster data (at minimum `podcaster.name`), so the UI can display who hosts the podcast.
**Pass condition:** Each episode object in the response has a nested `podcaster` object with a `name` field.
**Evidence:** Network response body structure.

### VAL-INGEST-021: Episodes are ordered by most recent first
The list endpoint returns episodes sorted by `createdAt` descending (newest first).
**Pass condition:** The first item in the array has the latest `createdAt`; array is strictly descending by `createdAt`.
**Evidence:** Network response body timestamps.

### VAL-INGEST-022: Non-GET method on list endpoint returns 405
When a DELETE or PUT request is sent to `GET /api/episodes`, the system returns 405.
**Pass condition:** Response status is 405.
**Evidence:** Network response status.

---

## GET /api/episodes/[id] (Single Episode Detail)

### VAL-INGEST-023: Valid episode ID returns full episode with transcript
When a user requests `GET /api/episodes/{validId}`, the system returns a 200 with the episode's metadata and its full array of TranscriptChunk records.
**Pass condition:** Response status is 200; body includes `id`, `title`, `youtubeUrl`, `youtubeId`, `podcaster` object, and `transcriptChunks` array with at least one chunk.
**Evidence:** Network response body.

### VAL-INGEST-024: TranscriptChunks are ordered by startTime ascending
The transcript chunks returned in the detail view are sorted by `startTime` ascending so the UI can render them in playback order.
**Pass condition:** `transcriptChunks` array is sorted with `startTime` strictly non-decreasing.
**Evidence:** Network response body; compare consecutive `startTime` values.

### VAL-INGEST-025: Non-existent episode ID returns 404
When a user requests `GET /api/episodes/{nonExistentId}`, the system returns a 404 with a message indicating the episode was not found.
**Pass condition:** Response status is 404; error message references episode not found.
**Evidence:** Network response status & body.

### VAL-INGEST-026: Malformed episode ID returns 404 or 400
When a user requests `GET /api/episodes/!!!invalid!!!`, the system returns a 400 or 404 rather than a 500 server error.
**Pass condition:** Response status is 400 or 404 (not 500).
**Evidence:** Network response status.

### VAL-INGEST-027: Episode detail includes Podcaster metadata
The single-episode response includes the associated Podcaster's `name` and `channelUrl`.
**Pass condition:** Response body has `podcaster.name` (non-empty) and `podcaster.channelUrl` (valid URL string).
**Evidence:** Network response body.

### VAL-INGEST-028: Episode detail includes thumbnailUrl if available
If the ingested video had a thumbnail, the episode detail response includes `thumbnailUrl` as a string URL.
**Pass condition:** `thumbnailUrl` is present and is a valid URL string (or null if the source video had none).
**Evidence:** Network response body.

---

## Cross-cutting / Edge Cases

### VAL-INGEST-029: Concurrent duplicate submissions are handled safely
When two identical YouTube URLs are submitted simultaneously via `POST /api/episodes`, exactly one Episode is created and the other request receives a 409 Conflict. No duplicate rows exist due to the `@unique` constraint on `youtubeUrl` and `youtubeId`.
**Pass condition:** After both requests complete, exactly one Episode exists for that `youtubeId`; one response is 201, the other is 409.
**Evidence:** Send two parallel POST requests; check DB count and both response statuses.

### VAL-INGEST-030: Very long transcript is fully chunked without data loss
When a video has a very long transcript (e.g., 3+ hours), all segments are chunked and stored. No transcript text is dropped.
**Pass condition:** Concatenating all TranscriptChunk `text` fields (ordered by `startTime`) reconstructs the complete transcript; last chunk's `endTime` matches the final segment's end.
**Evidence:** DB query; compare total text length with raw transcript.

### VAL-INGEST-031: Special characters in transcript text are preserved
Transcript text containing Unicode, HTML entities, quotes, newlines, and emoji is stored and returned without corruption or unintended escaping.
**Pass condition:** TranscriptChunk `text` containing special characters is returned identically in the GET detail response.
**Evidence:** Compare stored text via DB query and API response.

### VAL-INGEST-032: API returns proper Content-Type headers
All API responses include `Content-Type: application/json`.
**Pass condition:** Every response from `/api/episodes` and `/api/episodes/[id]` has `Content-Type` header containing `application/json`.
**Evidence:** Network response headers.

### VAL-INGEST-033: Server errors return 500 with generic message
If an unexpected internal error occurs (e.g., database connection failure), the API returns a 500 status with a generic error message that does not leak stack traces or sensitive details.
**Pass condition:** Response status is 500; body contains a generic message (e.g., "Internal server error"); no stack trace, file paths, or connection strings in the response.
**Evidence:** Simulate DB failure; inspect response body.

### VAL-INGEST-034: YouTube URL with timestamp parameter still ingests correctly
When a user pastes a URL like `https://www.youtube.com/watch?v=XXXXXXXXXXX&t=300`, the system ignores the `t` parameter for ID extraction and ingests the full episode transcript (not just from timestamp).
**Pass condition:** Response status is 201; all transcript chunks from the beginning of the video are stored (first chunk `startTime` ≈ 0).
**Evidence:** Network response; DB query for first TranscriptChunk's `startTime`.

### VAL-INGEST-035: Episode createdAt and updatedAt are auto-set
Newly created Episode records have `createdAt` and `updatedAt` timestamps that are approximately equal to the current server time.
**Pass condition:** `createdAt` and `updatedAt` are within a few seconds of `Date.now()` at time of request.
**Evidence:** API response or DB query.
