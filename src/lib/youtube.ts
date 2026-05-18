const YOUTUBE_VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

export function extractYouTubeId(urlOrVideoId: string): string | null {
  const input = urlOrVideoId.trim();

  if (YOUTUBE_VIDEO_ID.test(input)) {
    return input;
  }

  try {
    const url = new URL(input);
    const hostname = url.hostname.replace(/^www\./, "");

    if (hostname === "youtu.be") {
      return validVideoId(url.pathname.split("/").filter(Boolean)[0]);
    }

    if (!["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(hostname)) {
      return null;
    }

    if (url.pathname === "/watch") {
      return validVideoId(url.searchParams.get("v"));
    }

    const [firstSegment, secondSegment] = url.pathname.split("/").filter(Boolean);
    if (["embed", "shorts", "live"].includes(firstSegment ?? "")) {
      return validVideoId(secondSegment);
    }
  } catch {
    return null;
  }

  return null;
}

function validVideoId(value: string | null | undefined): string | null {
  return value && YOUTUBE_VIDEO_ID.test(value) ? value : null;
}
