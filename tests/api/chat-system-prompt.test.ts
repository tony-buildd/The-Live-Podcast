import { describe, expect, it } from "vitest";
import { buildMvpSystemPrompt } from "@/lib/chat/system-prompt";

describe("buildMvpSystemPrompt", () => {
  it("includes video title and formatted timestamp", () => {
    const prompt = buildMvpSystemPrompt({
      videoTitle: "AI in 2026",
      currentTimestamp: 125,
      chunks: [],
    });

    expect(prompt).toContain("AI in 2026");
    expect(prompt).toContain("2:05");
  });

  it("includes full transcript text from chunks", () => {
    const prompt = buildMvpSystemPrompt({
      videoTitle: "Test",
      currentTimestamp: 60,
      chunks: [
        { text: "Hello world", startTime: 0, endTime: 15 },
        { text: "Second chunk", startTime: 15, endTime: 30 },
        { text: "Third chunk", startTime: 30, endTime: 45 },
      ],
    });

    expect(prompt).toContain("Hello world");
    expect(prompt).toContain("Second chunk");
    expect(prompt).toContain("Third chunk");
  });

  it("separates recent context as an anchor section", () => {
    const prompt = buildMvpSystemPrompt({
      videoTitle: "Test",
      currentTimestamp: 300,
      chunks: [
        { text: "Early content", startTime: 0, endTime: 60 },
        { text: "Middle content", startTime: 60, endTime: 180 },
        { text: "Recent content", startTime: 180, endTime: 300 },
      ],
    });

    expect(prompt).toContain("just paused during this part");
    expect(prompt).toContain("Recent content");
  });

  it("includes behavioral instructions", () => {
    const prompt = buildMvpSystemPrompt({
      videoTitle: "Test",
      currentTimestamp: 0,
      chunks: [],
    });

    expect(prompt).toContain("conversationally");
    expect(prompt).toContain("broader knowledge");
    expect(prompt).toContain("knowledgeable friend");
  });

  it("handles empty chunks gracefully", () => {
    const prompt = buildMvpSystemPrompt({
      videoTitle: "Test",
      currentTimestamp: 30,
      chunks: [],
    });

    expect(prompt).not.toContain("discussed in the video so far");
    expect(prompt).toContain("Test");
    expect(prompt).toContain("0:30");
  });
});
