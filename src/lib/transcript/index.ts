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

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const RE_XML_TRANSCRIPT =
  /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/\n/g, " ");
}

function resolveVideoId(videoIdOrUrl: string): string {
  if (/^[a-zA-Z0-9_-]{11}$/.test(videoIdOrUrl)) {
    return videoIdOrUrl;
  }
  const id = extractYouTubeId(videoIdOrUrl);
  if (!id) {
    throw new Error(
      `Could not extract YouTube video ID from: ${videoIdOrUrl}`
    );
  }
  return id;
}

export async function fetchTranscript(
  videoIdOrUrl: string
): Promise<TranscriptSegment[]> {
  const videoId = resolveVideoId(videoIdOrUrl);

  // Fetch the YouTube video page to extract caption track URLs
  const videoPageResponse = await fetch(
    `https://www.youtube.com/watch?v=${videoId}`,
    {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
      },
    }
  );

  if (!videoPageResponse.ok) {
    throw new Error(`Failed to fetch YouTube video page (${videoPageResponse.status})`);
  }

  const videoPageBody = await videoPageResponse.text();

  // Try to extract ytInitialPlayerResponse from the page
  let playerResponse: Record<string, unknown> | undefined;

  // Method 1: Look for ytInitialPlayerResponse variable
  const playerResponseMatch = videoPageBody.match(
    /ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var\s|<\/script>)/s
  );
  if (playerResponseMatch) {
    try {
      playerResponse = JSON.parse(playerResponseMatch[1]);
    } catch {
      // Fall through to method 2
    }
  }

  // Method 2: Split on "captions": (fallback, original approach)
  if (!playerResponse) {
    const splittedHTML = videoPageBody.split('"captions":');
    if (splittedHTML.length <= 1) {
      if (videoPageBody.includes('class="g-recaptcha"')) {
        throw new Error(
          "YouTube is requiring captcha verification. Too many requests from this IP."
        );
      }
      if (!videoPageBody.includes('"playabilityStatus":')) {
        throw new Error(`Video is unavailable (${videoId})`);
      }
      throw new Error(`Transcript is disabled on this video (${videoId})`);
    }

    try {
      const captionsJson = splittedHTML[1]
        .split(',"videoDetails')[0]
        .replace("\n", "");
      const captions = JSON.parse(captionsJson);
      playerResponse = {
        captions: { playerCaptionsTracklistRenderer: captions.playerCaptionsTracklistRenderer },
      };
    } catch {
      throw new Error(`Failed to parse captions data for video (${videoId})`);
    }
  }

  // Extract caption tracks from playerResponse
  const captions =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (playerResponse as any)?.captions?.playerCaptionsTracklistRenderer;

  if (!captions) {
    throw new Error(`Transcript is disabled on this video (${videoId})`);
  }

  if (!captions.captionTracks || captions.captionTracks.length === 0) {
    throw new Error(`No transcripts available for this video (${videoId})`);
  }

  // Get the first available caption track URL
  const transcriptURL = captions.captionTracks[0].baseUrl;

  // Fetch the transcript XML
  const transcriptResponse = await fetch(transcriptURL, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!transcriptResponse.ok) {
    throw new Error(`Failed to fetch transcript XML (${transcriptResponse.status})`);
  }

  const transcriptBody = await transcriptResponse.text();
  const results = [...transcriptBody.matchAll(RE_XML_TRANSCRIPT)];

  if (results.length === 0) {
    throw new Error(`No transcript segments found for video (${videoId})`);
  }

  return results.map((result) => ({
    text: decodeHtmlEntities(result[3]),
    offset: parseFloat(result[1]),
    duration: parseFloat(result[2]),
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
