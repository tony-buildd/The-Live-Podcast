const YOUTUBE_ID_PATTERNS = [
  /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
  /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
];

export function extractYouTubeId(urlOrVideoId: string): string | null {
  if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrVideoId)) {
    return urlOrVideoId;
  }

  for (const pattern of YOUTUBE_ID_PATTERNS) {
    const match = urlOrVideoId.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}
