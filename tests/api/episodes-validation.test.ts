import { beforeEach, describe, expect, it, vi } from "vitest";

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
      body: JSON.stringify({ url: "https://youtube.com/watch?v=abc" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: message });
  });

  it("returns 400 when Convex reports invalid YouTube URL", async () => {
    const message = "Invalid YouTube URL";
    actionMock.mockRejectedValueOnce(new Error(message));

    const req = new Request("http://localhost/api/episodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/not-youtube" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: message });
  });

  it("returns 422 when Convex reports transcript/captions unavailable", async () => {
    const message = "No transcript available for this video";
    actionMock.mockRejectedValueOnce(new Error(message));

    const req = new Request("http://localhost/api/episodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://youtube.com/watch?v=no_transcript" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: message });
  });

  it("returns 503 for unexpected Convex ingest errors", async () => {
    const message = "Upstream service timeout";
    actionMock.mockRejectedValueOnce(new Error(message));

    const req = new Request("http://localhost/api/episodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://youtube.com/watch?v=abc" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: message });
  });
});
