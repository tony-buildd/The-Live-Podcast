import { beforeEach, describe, expect, it, vi } from "vitest";

const VALID_URL = "https://youtube.com/watch?v=dQw4w9WgXcQ";
const VALID_SEGMENTS = [{ text: "hello world", start: 0, duration: 3 }];

const mockTranscriptFetch = () =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (input: string | URL | Request) => {
      const url = String(
        typeof input === "string" || input instanceof URL ? input : input.url,
      );

      if (url.includes("/oembed")) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              title: "Sample Episode",
              author_name: "Sample Host",
              author_url: "https://www.youtube.com/@sample-host",
              thumbnail_url: "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
            }),
        };
      }

      return {
        ok: true,
        json: () =>
          Promise.resolve({ videoId: "dQw4w9WgXcQ", segments: VALID_SEGMENTS }),
      };
    }),
  );

const {
  authMock,
  currentUserMock,
  getConvexClientMock,
  apiRefs,
  mutationMock,
  actionMock,
  queryMock,
} = vi.hoisted(() => ({
  authMock: vi.fn<() => Promise<{ userId: string | null }>>(),
  currentUserMock: vi.fn(),
  getConvexClientMock: vi.fn(),
  apiRefs: {
    users: { ensureUser: "users.ensureUser" },
    episodes: {
      ingestEpisode: "episodes.ingestEpisode",
      listEpisodes: "episodes.listEpisodes",
    },
  },
  mutationMock: vi.fn(),
  actionMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  currentUser: currentUserMock,
}));

vi.mock("@/lib/convex/client", () => ({
  getConvexClient: getConvexClientMock,
  api: apiRefs,
  isConvexConfigurationError: () => false,
}));

import { POST } from "@/app/api/episodes/route";

describe("POST /api/episodes validation", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: "server_user" });
    currentUserMock.mockResolvedValue(null);

    mutationMock.mockReset();
    actionMock.mockReset();
    queryMock.mockReset();
    getConvexClientMock.mockReset();

    mutationMock.mockResolvedValue("user_doc");
    actionMock.mockResolvedValue({ episodeId: "episode_1" });
    queryMock.mockResolvedValue([]);

    getConvexClientMock.mockReturnValue({
      mutation: mutationMock,
      action: actionMock,
      query: queryMock,
    });

    // Default: transcript service returns a valid transcript.
    mockTranscriptFetch();
  });

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValueOnce({ userId: null });

    const req = new Request("http://localhost/api/episodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://youtube.com/watch?v=abc" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(getConvexClientMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost/api/episodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid request body" });
  });

  it("returns 400 when url is missing", async () => {
    const req = new Request("http://localhost/api/episodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Missing or empty 'url' field" });
    expect(getConvexClientMock).not.toHaveBeenCalled();
  });

  it("returns 400 when url is whitespace-only", async () => {
    const req = new Request("http://localhost/api/episodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "   \n  " }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Missing or empty 'url' field" });
    expect(getConvexClientMock).not.toHaveBeenCalled();
  });

  it("returns 409 when Convex reports episode already ingested", async () => {
    const message = "Episode has already been ingested";
    actionMock.mockRejectedValueOnce(new Error(message));

    const req = new Request("http://localhost/api/episodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: VALID_URL }),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: message });
  });

  it("returns 400 for non-YouTube URLs", async () => {
    const req = new Request("http://localhost/api/episodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/not-youtube" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("Invalid YouTube URL");
  });

  it("returns 422 when transcript service reports no captions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: string | URL | Request) => {
        const url = String(
          typeof input === "string" || input instanceof URL ? input : input.url,
        );

        if (url.includes("/oembed")) {
          return {
            ok: true,
            json: () =>
              Promise.resolve({
                title: "Sample Episode",
                author_name: "Sample Host",
                author_url: "https://www.youtube.com/@sample-host",
              }),
          };
        }

        return {
          ok: false,
          status: 404,
          json: () =>
            Promise.resolve({ detail: "Transcripts are disabled for video dQw4w9WgXcQ" }),
        };
      }),
    );

    const req = new Request("http://localhost/api/episodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: VALID_URL }),
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("Transcript service error");
  });

  it("returns 503 for unexpected Convex ingest errors", async () => {
    const message = "Upstream service timeout";
    actionMock.mockRejectedValueOnce(new Error(message));

    const req = new Request("http://localhost/api/episodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: VALID_URL }),
    });

    const res = await POST(req);
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: message });
  });
});
