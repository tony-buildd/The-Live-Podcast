import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../src/generated/prisma/client.js";

// Create test database client (separate db to avoid lock conflicts)
const testAdapter = new PrismaBetterSqlite3({ url: "file:./prisma/test-profiles.db" });
const testPrisma = new PrismaClient({ adapter: testAdapter });

// ── Mock db module to use test database ───────────────────────────────
vi.mock("@/lib/db", () => ({
  prisma: testPrisma,
}));

// ── Mock LLM provider ────────────────────────────────────────────────
const mockChat = vi.fn();
const mockStream = vi.fn();

vi.mock("@/lib/llm", () => ({
  getLLMProvider: () => ({
    chat: mockChat,
    stream: mockStream,
  }),
}));

// ── Mock buildPodcasterProfile ───────────────────────────────────────
// We mock the module but keep a reference to control behavior per test
const mockBuildPodcasterProfile = vi.fn();
vi.mock("@/lib/memory/profile-builder", () => ({
  buildPodcasterProfile: (...args: unknown[]) => mockBuildPodcasterProfile(...args),
  updateUserPodcasterMemory: vi.fn().mockResolvedValue(undefined),
}));

// ── Test helpers ──────────────────────────────────────────────────────
async function cleanDatabase(): Promise<void> {
  await testPrisma.conversationMessage.deleteMany();
  await testPrisma.conversation.deleteMany();
  await testPrisma.userPodcasterMemory.deleteMany();
  await testPrisma.transcriptChunk.deleteMany();
  await testPrisma.episode.deleteMany();
  await testPrisma.podcasterProfile.deleteMany();
  await testPrisma.podcaster.deleteMany();
  await testPrisma.user.deleteMany();
}

function createRequest(method: string, body?: unknown, url?: string): Request {
  const requestUrl = url ?? "http://localhost:3100/api/profiles/build";
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(requestUrl, init);
}

// ── Seed data helpers ─────────────────────────────────────────────────
interface SeedData {
  podcasterId: string;
  episodeId: string;
}

async function seedTestData(): Promise<SeedData> {
  const podcaster = await testPrisma.podcaster.create({
    data: {
      name: "Test Podcaster",
      channelUrl: "https://youtube.com/channel/test-profile-channel",
    },
  });

  const episode = await testPrisma.episode.create({
    data: {
      podcasterId: podcaster.id,
      youtubeUrl: "https://www.youtube.com/watch?v=profiletest1",
      youtubeId: "profiletest1",
      title: "Test Episode for Profile",
    },
  });

  await testPrisma.transcriptChunk.createMany({
    data: [
      { episodeId: episode.id, text: "Hello and welcome to the show.", startTime: 0, endTime: 60 },
      { episodeId: episode.id, text: "Today we talk about AI and technology.", startTime: 60, endTime: 120 },
      { episodeId: episode.id, text: "It is a fascinating and evolving topic.", startTime: 120, endTime: 180 },
    ],
  });

  return {
    podcasterId: podcaster.id,
    episodeId: episode.id,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("Profiles API Routes", () => {
  let POST_BUILD: (req: Request) => Promise<Response>;
  let seed: SeedData;

  beforeAll(async () => {
    // Push schema to test database
    const { execSync } = await import("child_process");
    execSync("npx prisma db push --force-reset", {
      env: { ...process.env, DATABASE_URL: "file:./prisma/test-profiles.db" },
      cwd: process.cwd(),
      stdio: "pipe",
    });

    // Import route handler (after mocks are set up)
    const profileModule = await import("@/app/api/profiles/build/route");
    POST_BUILD = profileModule.POST;
  });

  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();

    // Re-seed test data
    seed = await seedTestData();

    // Default mock: buildPodcasterProfile succeeds and creates a profile
    mockBuildPodcasterProfile.mockImplementation(async (podcasterId: string) => {
      await testPrisma.podcasterProfile.upsert({
        where: { id: `${podcasterId}-latest` },
        create: {
          id: `${podcasterId}-latest`,
          podcasterId,
          summaryText: "A tech-focused podcaster who discusses AI and technology trends.",
          topics: JSON.stringify(["AI", "technology", "innovation"]),
          personalityTraits: JSON.stringify(["curious", "analytical", "enthusiastic"]),
          speakingStyle: "Conversational and informative with a hint of excitement",
        },
        update: {
          summaryText: "A tech-focused podcaster who discusses AI and technology trends.",
          topics: JSON.stringify(["AI", "technology", "innovation"]),
          personalityTraits: JSON.stringify(["curious", "analytical", "enthusiastic"]),
          speakingStyle: "Conversational and informative with a hint of excitement",
        },
      });
    });
  });

  afterAll(async () => {
    await cleanDatabase();
    await testPrisma.$disconnect();
  });

  // ── POST /api/profiles/build ──────────────────────────────────────

  describe("POST /api/profiles/build", () => {
    // ── Validation ──────────────────────────────────────────────────

    it("returns 400 when podcasterId is missing", async () => {
      const req = createRequest("POST", {});
      const res = await POST_BUILD(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("returns 400 when podcasterId is empty string", async () => {
      const req = createRequest("POST", { podcasterId: "" });
      const res = await POST_BUILD(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("returns 400 for invalid JSON body", async () => {
      const req = new Request("http://localhost:3100/api/profiles/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      const res = await POST_BUILD(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("returns 400 for null body", async () => {
      const req = createRequest("POST", null);
      const res = await POST_BUILD(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    // ── 404 - Podcaster not found ───────────────────────────────────

    it("returns 404 when podcaster does not exist", async () => {
      const req = createRequest("POST", { podcasterId: "nonexistent-podcaster-id" });
      const res = await POST_BUILD(req);

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBeDefined();

      // buildPodcasterProfile should NOT be called
      expect(mockBuildPodcasterProfile).not.toHaveBeenCalled();
    });

    // ── 200 - Success ───────────────────────────────────────────────

    it("returns 200 with profile data on success", async () => {
      const req = createRequest("POST", { podcasterId: seed.podcasterId });
      const res = await POST_BUILD(req);

      expect(res.status).toBe(200);
      const body = await res.json();

      // Verify profile data is returned
      expect(body.profile).toBeDefined();
      expect(body.profile.podcasterId).toBe(seed.podcasterId);
      expect(body.profile.summaryText).toBeDefined();
      expect(body.profile.summaryText.length).toBeGreaterThan(0);
      expect(body.profile.topics).toBeDefined();
      expect(body.profile.personalityTraits).toBeDefined();
      expect(body.profile.speakingStyle).toBeDefined();
    });

    it("calls buildPodcasterProfile with correct podcasterId", async () => {
      const req = createRequest("POST", { podcasterId: seed.podcasterId });
      await POST_BUILD(req);

      expect(mockBuildPodcasterProfile).toHaveBeenCalledOnce();
      expect(mockBuildPodcasterProfile).toHaveBeenCalledWith(seed.podcasterId);
    });

    it("creates PodcasterProfile row with summaryText, topics, personalityTraits, speakingStyle", async () => {
      const req = createRequest("POST", { podcasterId: seed.podcasterId });
      const res = await POST_BUILD(req);

      expect(res.status).toBe(200);

      // Verify database record
      const profile = await testPrisma.podcasterProfile.findFirst({
        where: { podcasterId: seed.podcasterId },
      });

      expect(profile).not.toBeNull();
      expect(profile!.summaryText).toBeTruthy();
      expect(profile!.topics).toBeTruthy();
      expect(profile!.personalityTraits).toBeTruthy();
      expect(profile!.speakingStyle).toBeTruthy();
    });

    // ── 503 - LLM unreachable ───────────────────────────────────────

    it("returns 503 when LLM is unreachable", async () => {
      mockBuildPodcasterProfile.mockRejectedValueOnce(
        new Error("connect ECONNREFUSED 127.0.0.1:11434")
      );

      const req = createRequest("POST", { podcasterId: seed.podcasterId });
      const res = await POST_BUILD(req);

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("returns 503 when buildPodcasterProfile throws any error", async () => {
      mockBuildPodcasterProfile.mockRejectedValueOnce(
        new Error("LLM timeout")
      );

      const req = createRequest("POST", { podcasterId: seed.podcasterId });
      const res = await POST_BUILD(req);

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    // ── Profile data shape ──────────────────────────────────────────

    it("returns profile with parsed topics and personalityTraits arrays", async () => {
      const req = createRequest("POST", { podcasterId: seed.podcasterId });
      const res = await POST_BUILD(req);

      expect(res.status).toBe(200);
      const body = await res.json();

      // topics and personalityTraits should be arrays (parsed from JSON strings)
      expect(Array.isArray(body.profile.topics)).toBe(true);
      expect(body.profile.topics.length).toBeGreaterThan(0);
      expect(Array.isArray(body.profile.personalityTraits)).toBe(true);
      expect(body.profile.personalityTraits.length).toBeGreaterThan(0);
    });
  });
});
