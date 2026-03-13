import { YoutubeTranscript } from "youtube-transcript";

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

export async function fetchTranscript(
  videoIdOrUrl: string
): Promise<TranscriptSegment[]> {
  const segments = await YoutubeTranscript.fetchTranscript(videoIdOrUrl);
  return segments.map((s) => ({
    text: s.text,
    offset: s.offset / 1000,
    duration: s.duration / 1000,
  }));
}

export function chunkTranscript(
  segments: TranscriptSegment[],
  chunkDurationSeconds = 60
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
    const lastSeg = currentChunk[currentChunk.length - 1];
    chunks.push({
      text: currentChunk.map((s) => s.text).join(" "),
      startTime: chunkStart,
      endTime: lastSeg.offset + lastSeg.duration,
    });
  }

  return chunks;
}

export function getTranscriptUpToTimestamp(
  chunks: ChunkedTranscript[],
  timestamp: number
): ChunkedTranscript[] {
  return chunks.filter((c) => c.startTime <= timestamp);
}

export function getRecentContext(
  chunks: ChunkedTranscript[],
  timestamp: number,
  windowSeconds = 300
): string {
  const cutoff = Math.max(0, timestamp - windowSeconds);
  return chunks
    .filter((c) => c.startTime >= cutoff && c.startTime <= timestamp)
    .map((c) => c.text)
    .join(" ");
}
