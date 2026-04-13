import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: <T>(handler: T) => handler,
  createRouteMatcher: (patterns: string[]) => {
    return (request: { url: string }) => {
      const pathname = new URL(request.url).pathname;
      return patterns.some((pattern) => {
        const normalized = pattern.replace("(.*)", "");
        return pathname === normalized || pathname.startsWith(`${normalized}/`);
      });
    };
  },
}));

import middleware from "@/middleware";

type AuthFunction = (() => Promise<{ userId: string | null }>) & {
  protect: () => Promise<void>;
};

function makeAuth(userId: string | null): AuthFunction {
  const auth = (async () => ({ userId })) as AuthFunction;
  auth.protect = vi.fn(async () => undefined);
  return auth;
}

function request(method: string, pathname: string): { method: string; url: string } {
  return { method, url: `http://localhost${pathname}` };
}

describe("middleware auth gate", () => {
  const runMiddleware = middleware as unknown as (
    auth: AuthFunction,
    req: { method: string; url: string },
  ) => Promise<Response>;

  it("blocks unauthenticated POST requests to protected API routes", async () => {
    const auth = makeAuth(null);
    const res = await runMiddleware(auth, request("POST", "/api/chat"));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("blocks unauthenticated POST requests to other protected API routes", async () => {
    const auth = makeAuth(null);

    const episodesRes = await runMiddleware(auth, request("POST", "/api/episodes"));
    expect(episodesRes.status).toBe(401);

    const profilesRes = await runMiddleware(auth, request("POST", "/api/profiles/build"));
    expect(profilesRes.status).toBe(401);
  });

  it("allows authenticated POST requests to protected API routes", async () => {
    const auth = makeAuth("user_123");
    const res = await runMiddleware(auth, request("POST", "/api/chat"));

    expect(res.status).toBe(200);
  });

  it("blocks unauthenticated GET requests to protected API routes", async () => {
    const auth = makeAuth(null);
    const res = await runMiddleware(auth, request("GET", "/api/episodes"));

    expect(res.status).toBe(401);
  });

  it("allows authenticated GET requests to protected API routes", async () => {
    const auth = makeAuth("user_123");
    const res = await runMiddleware(auth, request("GET", "/api/episodes"));

    expect(res.status).toBe(200);
  });

  it("invokes auth.protect for protected page routes", async () => {
    const auth = makeAuth("user_123");
    await runMiddleware(auth, request("GET", "/library"));

    expect(auth.protect).toHaveBeenCalledOnce();
  });
});
