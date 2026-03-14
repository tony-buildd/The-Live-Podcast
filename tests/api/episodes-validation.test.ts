import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, currentUserMock, getConvexClientMock } = vi.hoisted(() => ({
  authMock: vi.fn<() => Promise<{ userId: string | null }>>(),
  currentUserMock: vi.fn(),
  getConvexClientMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  currentUser: currentUserMock,
}));

vi.mock("@/lib/convex/client", () => ({
  getConvexClient: getConvexClientMock,
  api: {
    users: { ensureUser: "users.ensureUser" },
    episodes: {
      ingestEpisode: "episodes.ingestEpisode",
      listEpisodes: "episodes.listEpisodes",
    },
  },
}));

import { POST } from "@/app/api/episodes/route";

describe("POST /api/episodes validation", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: "server_user" });
    currentUserMock.mockResolvedValue(null);
    getConvexClientMock.mockReset();
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
});
