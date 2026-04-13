export interface TranscriptSegment {
  text: string;
  offset: number;
  duration: number;
}

export interface ChunkedTranscript {
  text: string;
  startTime: number;
  endTime: number;
}

export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function resolveVideoId(videoIdOrUrl: string): string {
  if (/^[a-zA-Z0-9_-]{11}$/.test(videoIdOrUrl)) {
    return videoIdOrUrl;
  }
  const id = extractYouTubeId(videoIdOrUrl);
  if (!id) {
    throw new Error(`Could not extract YouTube video ID from: ${videoIdOrUrl}`);
  }
  return id;
}

interface PythonSegment {
  text: string;
  start: number;
  duration: number;
}

interface TranscriptServiceResponse {
  videoId: string;
  segments: PythonSegment[];
}

/**
 * Fetches a YouTube transcript via the local Python transcript service.
 *
 * The service must be running before ingesting episodes:
 *   npm run transcript:dev
 *
 * Service URL defaults to http://127.0.0.1:8765 and can be overridden
 * via the TRANSCRIPT_SERVICE_URL environment variable.
 */
export async function fetchTranscript(
  videoIdOrUrl: string,
): Promise<TranscriptSegment[]> {
  const videoId = resolveVideoId(videoIdOrUrl);

  const serviceUrl =
    process.env.TRANSCRIPT_SERVICE_URL ?? "http://127.0.0.1:8765";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  let response: Response;
  try {
    response = await fetch(`${serviceUrl}/transcript/${videoId}`, {
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    clearTimeout(timeoutId);
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    throw new Error(
      isTimeout
        ? `Transcript service timed out after 30s for video ${videoId}. The service may be overloaded or YouTube is slow.`
        : `Transcript service is unreachable at ${serviceUrl}. ` +
            `Start it first with: npm run transcript:dev\n(Original error: ${msg})`,
    );
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // ignore JSON parse failure; use status code message
    }
    throw new Error(`Transcript service error for video ${videoId}: ${detail}`);
  }

  const data = (await response.json()) as TranscriptServiceResponse;

  if (!data.segments || data.segments.length === 0) {
    throw new Error(`No transcript segments returned for video (${videoId})`);
  }

  return data.segments.map((s) => ({
    text: s.text,
    offset: s.start,
    duration: s.duration,
  }));
}

export function chunkTranscript(
  segments: TranscriptSegment[],
  chunkDurationSeconds = 15,
): ChunkedTranscript[] {
  if (segments.length === 0) return [];

  const chunks: ChunkedTranscript[] = [];
  let currentChunk: TranscriptSegment[] = [];
  let chunkStart = segments[0].offset;

  for (const segment of segments) {
    currentChunk.push(segment);

    const chunkEnd = segment.offset + segment.duration;
    if (chunkEnd - chunkStart >= chunkDurationSeconds) {
      chunks.push({
        text: currentChunk.map((s) => s.text).join(" "),
        startTime: chunkStart,
        endTime: chunkEnd,
      });
      currentChunk = [];
      chunkStart = chunkEnd;
    }
  }

  if (currentChunk.length > 0) {
    const last = currentChunk[currentChunk.length - 1];
    chunks.push({
      text: currentChunk.map((s) => s.text).join(" "),
      startTime: chunkStart,
      endTime: last.offset + last.duration,
    });
  }

  return chunks;
}
