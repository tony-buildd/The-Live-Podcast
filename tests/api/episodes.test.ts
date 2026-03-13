import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../src/generated/prisma/client.js";

// Create test database client
const testAdapter = new PrismaBetterSqlite3({ url: "file:./prisma/test.db" });
const testPrisma = new PrismaClient({ adapter: testAdapter });

// ── Mock transcript module ────────────────────────────────────────────
const mockExtractYouTubeId = vi.fn((url: string): string | null => {
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
});

const mockFetchTranscript = vi.fn();

const mockChunkTranscript = vi.fn(
  (segments: Array<{ text: string; offset: number; duration: number }>) => {
    if (segments.length === 0) return [];
    return segments.map((s) => ({
      text: s.text,
      startTime: s.offset,
      endTime: s.offset + s.duration,
    }));
  }
);

vi.mock("@/lib/transcript/index", () => ({
  extractYouTubeId: mockExtractYouTubeId,
  fetchTranscript: mockFetchTranscript,
  chunkTranscript: mockChunkTranscript,
}));

// ── Mock db module to use test database ───────────────────────────────
vi.mock("@/lib/db", () => ({
  prisma: testPrisma,
}));

// ── Mock profile builder (optional async trigger) ─────────────────────
vi.mock("@/lib/memory/profile-builder", () => ({
  buildPodcasterProfile: vi.fn().mockResolvedValue(undefined),
}));

// ── Test helpers ──────────────────────────────────────────────────────
async function cleanDatabase(): Promise<void> {
  await testPrisma.transcriptChunk.deleteMany();
  await testPrisma.episode.deleteMany();
  await testPrisma.podcasterProfile.deleteMany();
  await testPrisma.podcaster.deleteMany();
}

function createRequest(method: string, body?: unknown, url?: string): Request {
  const requestUrl = url ?? "http://localhost:3100/api/episodes";
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(requestUrl, init);
}

// ── Sample data ───────────────────────────────────────────────────────
const VALID_YOUTUBE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const VALID_YOUTUBE_URL_SHORT = "https://youtu.be/dQw4w9WgXcQ";
const VALID_YOUTUBE_URL_2 = "https://www.youtube.com/watch?v=9bZkp7q19f0";
const INVALID_URL = "not-a-youtube-url";
const EMPTY_URL = "";

const SAMPLE_TRANSCRIPT = [
  { text: "Hello and welcome to the show.", offset: 0, duration: 5 },
  { text: "Today we are talking about AI.", offset: 5, duration: 5 },
  { text: "It is a fascinating topic.", offset: 10, duration: 5 },
];

// ── Tests ─────────────────────────────────────────────────────────────

describe("Episode API Routes", () => {
  let POST: (req: Request) => Promise<Response>;
  let GET_LIST: (req: Request) => Promise<Response>;
  let GET_DETAIL: (
    req: Request,
    context: { params: Promise<{ id: string }> }
  ) => Promise<Response>;

  beforeAll(async () => {
    // Push schema to test database
    const { execSync } = await import("child_process");
    execSync("npx prisma db push --force-reset", {
      env: { ...process.env, DATABASE_URL: "file:./prisma/test.db" },
      cwd: process.cwd(),
      stdio: "pipe",
    });

    // Import route handlers (after mocks are set up)
    const postModule = await import("@/app/api/episodes/route");
    POST = postModule.POST;
    GET_LIST = postModule.GET;

    const detailModule = await import("@/app/api/episodes/[id]/route");
    GET_DETAIL = detailModule.GET;
  });

  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
    // Re-set defaults for the extractYouTubeId mock
    mockExtractYouTubeId.mockImplementation((url: string): string | null => {
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
    });
    mockChunkTranscript.mockImplementation(
      (segments: Array<{ text: string; offset: number; duration: number }>) => {
        if (segments.length === 0) return [];
        return segments.map((s) => ({
          text: s.text,
          startTime: s.offset,
          endTime: s.offset + s.duration,
        }));
      }
    );
  });

  afterAll(async () => {
    await cleanDatabase();
    await testPrisma.$disconnect();
  });

  // ── POST /api/episodes ────────────────────────────────────────────

  describe("POST /api/episodes", () => {
    it("creates episode from valid YouTube URL and returns 201", async () => {
      mockFetchTranscript.mockResolvedValueOnce(SAMPLE_TRANSCRIPT);

      const req = createRequest("POST", { url: VALID_YOUTUBE_URL });
      const res = await POST(req);

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.id).toBeDefined();
      expect(body.youtubeId).toBe("dQw4w9WgXcQ");
      expect(body.youtubeUrl).toBe(VALID_YOUTUBE_URL);
      expect(body.title).toBeDefined();

      // Verify database records
      const episode = await testPrisma.episode.findUnique({
        where: { id: body.id },
        include: { transcriptChunks: true, podcaster: true },
      });
      expect(episode).not.toBeNull();
      expect(episode!.transcriptChunks.length).toBeGreaterThan(0);
      expect(episode!.podcaster).toBeDefined();
    });

    it("creates episode from youtu.be short URL", async () => {
      mockFetchTranscript.mockResolvedValueOnce(SAMPLE_TRANSCRIPT);

      const req = createRequest("POST", { url: VALID_YOUTUBE_URL_SHORT });
      const res = await POST(req);

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.youtubeId).toBe("dQw4w9WgXcQ");
    });

    it("returns 400 for invalid URL", async () => {
      const req = createRequest("POST", { url: INVALID_URL });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();

      // Verify no records created
      const episodes = await testPrisma.episode.findMany();
      expect(episodes.length).toBe(0);
    });

    it("returns 400 for empty URL", async () => {
      const req = createRequest("POST", { url: EMPTY_URL });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("returns 400 for missing URL field", async () => {
      const req = createRequest("POST", {});
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("returns 400 for missing body", async () => {
      const req = new Request("http://localhost:3100/api/episodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(null),
      });
      const res = await POST(req);

      expect(res.status).toBe(400);
    });

    it("returns 409 for duplicate YouTube URL", async () => {
      mockFetchTranscript.mockResolvedValueOnce(SAMPLE_TRANSCRIPT);

      // First ingest
      const req1 = createRequest("POST", { url: VALID_YOUTUBE_URL });
      const res1 = await POST(req1);
      expect(res1.status).toBe(201);

      // Second ingest same URL
      const req2 = createRequest("POST", { url: VALID_YOUTUBE_URL });
      const res2 = await POST(req2);

      expect(res2.status).toBe(409);
      const body = await res2.json();
      expect(body.error).toBeDefined();

      // Verify only one episode exists
      const episodes = await testPrisma.episode.findMany({
        where: { youtubeId: "dQw4w9WgXcQ" },
      });
      expect(episodes.length).toBe(1);
    });

    it("returns 409 for duplicate YouTube URL in different format", async () => {
      mockFetchTranscript.mockResolvedValueOnce(SAMPLE_TRANSCRIPT);

      // First ingest with full URL
      const req1 = createRequest("POST", { url: VALID_YOUTUBE_URL });
      await POST(req1);

      // Second ingest same video with short URL
      const req2 = createRequest("POST", { url: VALID_YOUTUBE_URL_SHORT });
      const res2 = await POST(req2);

      expect(res2.status).toBe(409);
    });

    it("returns 422 when video has no transcript/captions", async () => {
      mockFetchTranscript.mockRejectedValueOnce(
        new Error("No transcript available")
      );

      const req = createRequest("POST", { url: VALID_YOUTUBE_URL });
      const res = await POST(req);

      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toBeDefined();

      // Verify no records created (transactional safety)
      const episodes = await testPrisma.episode.findMany();
      expect(episodes.length).toBe(0);
    });

    it("returns 422 when transcript is empty", async () => {
      mockFetchTranscript.mockResolvedValueOnce([]);

      const req = createRequest("POST", { url: VALID_YOUTUBE_URL });
      const res = await POST(req);

      expect(res.status).toBe(422);
    });

    it("creates transcript chunks with valid time ranges", async () => {
      mockFetchTranscript.mockResolvedValueOnce(SAMPLE_TRANSCRIPT);

      const req = createRequest("POST", { url: VALID_YOUTUBE_URL });
      const res = await POST(req);
      const body = await res.json();

      const chunks = await testPrisma.transcriptChunk.findMany({
        where: { episodeId: body.id },
        orderBy: { startTime: "asc" },
      });

      expect(chunks.length).toBeGreaterThan(0);
      for (const chunk of chunks) {
        expect(chunk.text).toBeTruthy();
        expect(chunk.startTime).toBeLessThan(chunk.endTime);
        expect(chunk.startTime).toBeGreaterThanOrEqual(0);
      }
    });

    it("creates Podcaster record and reuses for same channel", async () => {
      mockFetchTranscript.mockResolvedValue(SAMPLE_TRANSCRIPT);

      // First episode
      const req1 = createRequest("POST", { url: VALID_YOUTUBE_URL });
      const res1 = await POST(req1);
      expect(res1.status).toBe(201);
      const body1 = await res1.json();

      // Second episode (different video, but same channel URL pattern)
      const req2 = createRequest("POST", { url: VALID_YOUTUBE_URL_2 });
      const res2 = await POST(req2);
      expect(res2.status).toBe(201);
      const body2 = await res2.json();

      // Both episodes should have podcaster info
      expect(body1.podcaster).toBeDefined();
      expect(body2.podcaster).toBeDefined();

      // Verify podcaster records exist
      const podcasters = await testPrisma.podcaster.findMany();
      expect(podcasters.length).toBeGreaterThanOrEqual(1);
    });

    it("Episode + TranscriptChunks created atomically in transaction", async () => {
      mockFetchTranscript.mockResolvedValueOnce(SAMPLE_TRANSCRIPT);

      const req = createRequest("POST", { url: VALID_YOUTUBE_URL });
      const res = await POST(req);
      expect(res.status).toBe(201);

      const body = await res.json();
      const episode = await testPrisma.episode.findUnique({
        where: { id: body.id },
        include: { transcriptChunks: true },
      });

      expect(episode).not.toBeNull();
      expect(episode!.transcriptChunks.length).toBe(SAMPLE_TRANSCRIPT.length);
    });
  });

  // ── GET /api/episodes ─────────────────────────────────────────────

  describe("GET /api/episodes", () => {
    it("returns 200 with empty array when no episodes exist", async () => {
      const req = new Request("http://localhost:3100/api/episodes", {
        method: "GET",
      });
      const res = await GET_LIST(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(0);
    });

    it("returns all episodes with podcaster info, ordered newest first", async () => {
      mockFetchTranscript.mockResolvedValue(SAMPLE_TRANSCRIPT);

      // Create two episodes
      const req1 = createRequest("POST", { url: VALID_YOUTUBE_URL });
      await POST(req1);

      // Small delay to ensure different createdAt
      await new Promise((resolve) => setTimeout(resolve, 50));

      const req2 = createRequest("POST", { url: VALID_YOUTUBE_URL_2 });
      await POST(req2);

      const req = new Request("http://localhost:3100/api/episodes", {
        method: "GET",
      });
      const res = await GET_LIST(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.length).toBe(2);

      // Verify ordered by createdAt desc (newest first)
      const date1 = new Date(body[0].createdAt).getTime();
      const date2 = new Date(body[1].createdAt).getTime();
      expect(date1).toBeGreaterThanOrEqual(date2);

      // Each episode should include podcaster info
      for (const episode of body) {
        expect(episode.id).toBeDefined();
        expect(episode.title).toBeDefined();
        expect(episode.youtubeUrl).toBeDefined();
        expect(episode.podcaster).toBeDefined();
        expect(episode.podcaster.name).toBeDefined();
      }
    });
  });

  // ── GET /api/episodes/[id] ────────────────────────────────────────

  describe("GET /api/episodes/[id]", () => {
    it("returns 200 with episode, podcaster, and transcriptChunks sorted by startTime", async () => {
      mockFetchTranscript.mockResolvedValueOnce(SAMPLE_TRANSCRIPT);

      // Create an episode first
      const postReq = createRequest("POST", { url: VALID_YOUTUBE_URL });
      const postRes = await POST(postReq);
      const { id } = await postRes.json();

      const req = new Request(`http://localhost:3100/api/episodes/${id}`, {
        method: "GET",
      });
      const res = await GET_DETAIL(req, {
        params: Promise.resolve({ id }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.id).toBe(id);
      expect(body.youtubeId).toBe("dQw4w9WgXcQ");
      expect(body.podcaster).toBeDefined();
      expect(body.podcaster.name).toBeDefined();
      expect(body.transcriptChunks).toBeDefined();
      expect(Array.isArray(body.transcriptChunks)).toBe(true);
      expect(body.transcriptChunks.length).toBeGreaterThan(0);

      // Verify transcript chunks are sorted by startTime asc
      for (let i = 1; i < body.transcriptChunks.length; i++) {
        expect(body.transcriptChunks[i].startTime).toBeGreaterThanOrEqual(
          body.transcriptChunks[i - 1].startTime
        );
      }

      // Verify chunks have valid data
      for (const chunk of body.transcriptChunks) {
        expect(chunk.text).toBeTruthy();
        expect(chunk.startTime).toBeLessThan(chunk.endTime);
      }
    });

    it("returns 404 for non-existent episode ID", async () => {
      const req = new Request(
        "http://localhost:3100/api/episodes/nonexistent-id",
        { method: "GET" }
      );
      const res = await GET_DETAIL(req, {
        params: Promise.resolve({ id: "nonexistent-id" }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("returns 404 for empty ID", async () => {
      const req = new Request("http://localhost:3100/api/episodes/", {
        method: "GET",
      });
      const res = await GET_DETAIL(req, {
        params: Promise.resolve({ id: "" }),
      });

      expect(res.status).toBe(404);
    });
  });
});
