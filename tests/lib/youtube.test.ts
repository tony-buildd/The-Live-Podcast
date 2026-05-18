import { describe, expect, it } from "vitest";
import { extractYouTubeId } from "@/lib/youtube";

const VIDEO_ID = "dQw4w9WgXcQ";

describe("extractYouTubeId", () => {
  it("accepts a raw video id", () => {
    expect(extractYouTubeId(VIDEO_ID)).toBe(VIDEO_ID);
  });

  it("extracts watch URLs regardless of query parameter order", () => {
    expect(
      extractYouTubeId(`https://www.youtube.com/watch?feature=shared&v=${VIDEO_ID}`),
    ).toBe(VIDEO_ID);
    expect(
      extractYouTubeId(`https://m.youtube.com/watch?si=abc123&v=${VIDEO_ID}&feature=youtu.be`),
    ).toBe(VIDEO_ID);
  });

  it("extracts short, embed, shorts, and live URLs", () => {
    expect(extractYouTubeId(`https://youtu.be/${VIDEO_ID}?si=abc123`)).toBe(VIDEO_ID);
    expect(extractYouTubeId(`https://www.youtube.com/embed/${VIDEO_ID}`)).toBe(VIDEO_ID);
    expect(extractYouTubeId(`https://youtube.com/shorts/${VIDEO_ID}`)).toBe(VIDEO_ID);
    expect(extractYouTubeId(`https://www.youtube.com/live/${VIDEO_ID}?feature=share`)).toBe(VIDEO_ID);
  });

  it("rejects non-YouTube URLs and invalid ids", () => {
    expect(extractYouTubeId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(extractYouTubeId("https://www.youtube.com/watch?v=too-short")).toBeNull();
    expect(extractYouTubeId("not a url")).toBeNull();
  });
});
