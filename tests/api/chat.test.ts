import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../src/generated/prisma/client.js";

// Create test database client (separate from episodes tests to avoid lock conflicts)
const testAdapter = new PrismaBetterSqlite3({ url: "file:./prisma/test-chat.db" });
const testPrisma = new PrismaClient({ adapter: testAdapter });

// ── Mock db module to use test database ───────────────────────────────
vi.mock("@/lib/db", () => ({
  prisma: testPrisma,
}));

// ── Mock LLM provider ────────────────────────────────────────────────
const mockStream = vi.fn();
const mockChat = vi.fn();

vi.mock("@/lib/llm", () => ({
  getLLMProvider: () => ({
    stream: mockStream,
    chat: mockChat,
  }),
}));

// ── Mock context builder ─────────────────────────────────────────────
const mockBuildConversationContext = vi.fn();
vi.mock("@/lib/memory/context-builder", () => ({
  buildConversationContext: mockBuildConversationContext,
}));

// ── Mock profile builder / memory ────────────────────────────────────
const mockUpdateUserPodcasterMemory = vi.fn();
vi.mock("@/lib/memory/profile-builder", () => ({
  buildPodcasterProfile: vi.fn().mockResolvedValue(undefined),
  updateUserPodcasterMemory: mockUpdateUserPodcasterMemory,
}));

// ── Helper: create an async generator from tokens ────────────────────
async function* fakeStream(tokens: string[]): AsyncGenerator<string, void, unknown> {
  for (const token of tokens) {
    yield token;
  }
}

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
  const requestUrl = url ?? "http://localhost:3100/api/chat";
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
  userId: string;
  podcasterId: string;
  episodeId: string;
}

async function seedTestData(): Promise<SeedData> {
  const user = await testPrisma.user.create({
    data: {
      email: "testuser@example.com",
      name: "Test User",
    },
  });

  const podcaster = await testPrisma.podcaster.create({
    data: {
      name: "Test Podcaster",
      channelUrl: "https://youtube.com/channel/test-channel",
    },
  });

  const episode = await testPrisma.episode.create({
    data: {
      podcasterId: podcaster.id,
      youtubeUrl: "https://www.youtube.com/watch?v=test123test",
      youtubeId: "test123test",
      title: "Test Episode",
    },
  });

  await testPrisma.transcriptChunk.createMany({
    data: [
      { episodeId: episode.id, text: "Hello and welcome to the show.", startTime: 0, endTime: 60 },
      { episodeId: episode.id, text: "Today we talk about AI.", startTime: 60, endTime: 120 },
      { episodeId: episode.id, text: "It is a fascinating topic.", startTime: 120, endTime: 180 },
    ],
  });

  return {
    userId: user.id,
    podcasterId: podcaster.id,
    episodeId: episode.id,
  };
}

async function readSSEStream(response: Response): Promise<string[]> {
  const reader = response.body?.getReader();
  if (!reader) return [];

  const decoder = new TextDecoder();
  const events: string[] = [];
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data: ")) {
        events.push(trimmed.slice(6));
      }
    }
  }

  // Process remaining buffer
  if (buffer.trim().startsWith("data: ")) {
    events.push(buffer.trim().slice(6));
  }

  return events;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("Chat API Routes", () => {
  let POST_CHAT: (req: Request) => Promise<Response>;
  let POST_CHAT_END: (req: Request) => Promise<Response>;
  let seed: SeedData;

  beforeAll(async () => {
    // Push schema to test database
    const { execSync } = await import("child_process");
    execSync("npx prisma db push --force-reset", {
      env: { ...process.env, DATABASE_URL: "file:./prisma/test-chat.db" },
      cwd: process.cwd(),
      stdio: "pipe",
    });

    // Import route handlers (after mocks are set up)
    const chatModule = await import("@/app/api/chat/route");
    POST_CHAT = chatModule.POST;

    const chatEndModule = await import("@/app/api/chat/end/route");
    POST_CHAT_END = chatEndModule.POST;
  });

  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();

    // Re-seed test data
    seed = await seedTestData();

    // Default mock: context builder returns a system message
    mockBuildConversationContext.mockResolvedValue([
      { role: "system", content: "You are an AI podcaster." },
    ]);

    // Default mock: stream returns tokens
    mockStream.mockReturnValue(fakeStream(["Hello", " there", "!"]));

    // Default mock: updateUserPodcasterMemory succeeds
    mockUpdateUserPodcasterMemory.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await cleanDatabase();
    await testPrisma.$disconnect();
  });

  // ── POST /api/chat ──────────────────────────────────────────────────

  describe("POST /api/chat", () => {
    // ── Validation ──────────────────────────────────────────────────

    it("returns 400 when episodeId is missing", async () => {
      const req = createRequest("POST", {
        podcasterId: seed.podcasterId,
        userId: seed.userId,
        timestamp: 90,
        message: "What did you mean?",
      });
      const res = await POST_CHAT(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("returns 400 when podcasterId is missing", async () => {
      const req = createRequest("POST", {
        episodeId: seed.episodeId,
        userId: seed.userId,
        timestamp: 90,
        message: "What did you mean?",
      });
      const res = await POST_CHAT(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("returns 400 when userId is missing", async () => {
      const req = createRequest("POST", {
        episodeId: seed.episodeId,
        podcasterId: seed.podcasterId,
        timestamp: 90,
        message: "What did you mean?",
      });
      const res = await POST_CHAT(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("returns 400 when message is missing", async () => {
      const req = createRequest("POST", {
        episodeId: seed.episodeId,
        podcasterId: seed.podcasterId,
        userId: seed.userId,
        timestamp: 90,
      });
      const res = await POST_CHAT(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("returns 400 when timestamp is missing", async () => {
      const req = createRequest("POST", {
        episodeId: seed.episodeId,
        podcasterId: seed.podcasterId,
        userId: seed.userId,
        message: "What did you mean?",
      });
      const res = await POST_CHAT(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("returns 400 for empty message", async () => {
      const req = createRequest("POST", {
        episodeId: seed.episodeId,
        podcasterId: seed.podcasterId,
        userId: seed.userId,
        timestamp: 90,
        message: "",
      });
      const res = await POST_CHAT(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();

      // No ConversationMessage should be created
      const messages = await testPrisma.conversationMessage.findMany();
      expect(messages.length).toBe(0);
    });

    it("returns 400 for whitespace-only message", async () => {
      const req = createRequest("POST", {
        episodeId: seed.episodeId,
        podcasterId: seed.podcasterId,
        userId: seed.userId,
        timestamp: 90,
        message: "   \n\t  ",
      });
      const res = await POST_CHAT(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();

      // No ConversationMessage should be created
      const messages = await testPrisma.conversationMessage.findMany();
      expect(messages.length).toBe(0);
    });

    it("returns 400 for invalid JSON body", async () => {
      const req = new Request("http://localhost:3100/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      const res = await POST_CHAT(req);
      expect(res.status).toBe(400);
    });

    // ── New conversation (no conversationId) ────────────────────────

    it("creates new conversation when no conversationId provided", async () => {
      const req = createRequest("POST", {
        episodeId: seed.episodeId,
        podcasterId: seed.podcasterId,
        userId: seed.userId,
        timestamp: 90,
        message: "What did you just say about AI?",
      });

      const res = await POST_CHAT(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");

      // Read SSE events
      const events = await readSSEStream(res);
      expect(events.length).toBeGreaterThan(0);

      // Verify new Conversation was created
      const conversations = await testPrisma.conversation.findMany({
        where: { userId: seed.userId, episodeId: seed.episodeId },
      });
      expect(conversations.length).toBe(1);
      expect(conversations[0].timestampInEpisode).toBe(90);
    });

    it("streams SSE response with correct format", async () => {
      mockStream.mockReturnValue(fakeStream(["Hello", " world"]));

      const req = createRequest("POST", {
        episodeId: seed.episodeId,
        podcasterId: seed.podcasterId,
        userId: seed.userId,
        timestamp: 90,
        message: "Tell me more",
      });

      const res = await POST_CHAT(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");

      const events = await readSSEStream(res);
      // Should have data events for tokens
      expect(events.some((e) => e.includes("Hello"))).toBe(true);
      expect(events.some((e) => e.includes(" world"))).toBe(true);
    });

    it("persists user message before streaming begins", async () => {
      // Track when user message is saved vs when stream starts
      let userMessageSavedBeforeStream = false;

      mockStream.mockImplementation(async function* () {
        // Check if user message exists when stream starts
        const messages = await testPrisma.conversationMessage.findMany({
          where: { role: "user" },
        });
        userMessageSavedBeforeStream = messages.length > 0;
        yield "response";
      });

      const req = createRequest("POST", {
        episodeId: seed.episodeId,
        podcasterId: seed.podcasterId,
        userId: seed.userId,
        timestamp: 90,
        message: "Test message",
      });

      const res = await POST_CHAT(req);
      await readSSEStream(res);

      expect(userMessageSavedBeforeStream).toBe(true);
    });

    it("persists assistant message after stream completes with full content", async () => {
      mockStream.mockReturnValue(fakeStream(["Part1", " Part2", " Part3"]));

      const req = createRequest("POST", {
        episodeId: seed.episodeId,
        podcasterId: seed.podcasterId,
        userId: seed.userId,
        timestamp: 90,
        message: "Tell me about this",
      });

      const res = await POST_CHAT(req);
      await readSSEStream(res);

      // Wait a tick for the async save to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify both user and assistant messages are saved
      const messages = await testPrisma.conversationMessage.findMany({
        orderBy: { createdAt: "asc" },
      });

      expect(messages.length).toBe(2);
      expect(messages[0].role).toBe("user");
      expect(messages[0].content).toBe("Tell me about this");
      expect(messages[1].role).toBe("assistant");
      expect(messages[1].content).toBe("Part1 Part2 Part3");
    });

    // ── Existing conversation (conversationId provided) ──────────

    it("reuses existing conversation when conversationId provided", async () => {
      // Create a conversation first
      const conversation = await testPrisma.conversation.create({
        data: {
          userId: seed.userId,
          podcasterId: seed.podcasterId,
          episodeId: seed.episodeId,
          timestampInEpisode: 90,
        },
      });

      const req = createRequest("POST", {
        episodeId: seed.episodeId,
        podcasterId: seed.podcasterId,
        userId: seed.userId,
        timestamp: 90,
        message: "Follow up question",
        conversationId: conversation.id,
      });

      const res = await POST_CHAT(req);
      expect(res.status).toBe(200);

      await readSSEStream(res);

      // No new conversation should be created
      const conversations = await testPrisma.conversation.findMany();
      expect(conversations.length).toBe(1);
      expect(conversations[0].id).toBe(conversation.id);
    });

    it("returns 400 when conversationId does not exist", async () => {
      const req = createRequest("POST", {
        episodeId: seed.episodeId,
        podcasterId: seed.podcasterId,
        userId: seed.userId,
        timestamp: 90,
        message: "Follow up question",
        conversationId: "nonexistent-convo-id",
      });

      const res = await POST_CHAT(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    // ── Multi-turn history ──────────────────────────────────────────

    it("includes prior messages in LLM call for multi-turn conversation", async () => {
      // Create conversation with existing messages
      const conversation = await testPrisma.conversation.create({
        data: {
          userId: seed.userId,
          podcasterId: seed.podcasterId,
          episodeId: seed.episodeId,
          timestampInEpisode: 90,
        },
      });

      await testPrisma.conversationMessage.createMany({
        data: [
          { conversationId: conversation.id, role: "user", content: "First question" },
          { conversationId: conversation.id, role: "assistant", content: "First answer" },
        ],
      });

      let capturedMessages: Array<{ role: string; content: string }> = [];
      mockStream.mockImplementation(async function* (messages: Array<{ role: string; content: string }>) {
        capturedMessages = messages;
        yield "response";
      });

      const req = createRequest("POST", {
        episodeId: seed.episodeId,
        podcasterId: seed.podcasterId,
        userId: seed.userId,
        timestamp: 90,
        message: "Second question",
        conversationId: conversation.id,
      });

      const res = await POST_CHAT(req);
      await readSSEStream(res);

      // The LLM should receive: system prompt + prior messages + new user message
      expect(capturedMessages.length).toBeGreaterThanOrEqual(4); // system + 2 prior + 1 new
      expect(capturedMessages[0].role).toBe("system");
      expect(capturedMessages.find((m) => m.content === "First question")).toBeDefined();
      expect(capturedMessages.find((m) => m.content === "First answer")).toBeDefined();
      expect(capturedMessages[capturedMessages.length - 1].content).toBe("Second question");
    });

    // ── Context builder called correctly ────────────────────────────

    it("calls buildConversationContext with correct parameters", async () => {
      const req = createRequest("POST", {
        episodeId: seed.episodeId,
        podcasterId: seed.podcasterId,
        userId: seed.userId,
        timestamp: 120,
        message: "Question about the topic",
      });

      const res = await POST_CHAT(req);
      await readSSEStream(res);

      expect(mockBuildConversationContext).toHaveBeenCalledWith({
        episodeId: seed.episodeId,
        podcasterId: seed.podcasterId,
        userId: seed.userId,
        currentTimestamp: 120,
      });
    });

    // ── LLM error handling ──────────────────────────────────────────

    it("returns 503 when LLM provider is unreachable", async () => {
      mockStream.mockImplementation(async function* () {
        throw new Error("connect ECONNREFUSED 127.0.0.1:11434");
      });

      const req = createRequest("POST", {
        episodeId: seed.episodeId,
        podcasterId: seed.podcasterId,
        userId: seed.userId,
        timestamp: 90,
        message: "Hello",
      });

      const res = await POST_CHAT(req);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    // ── SSE stream includes conversationId ─────────────────────────

    it("includes conversationId in SSE stream metadata", async () => {
      const req = createRequest("POST", {
        episodeId: seed.episodeId,
        podcasterId: seed.podcasterId,
        userId: seed.userId,
        timestamp: 90,
        message: "Hello",
      });

      const res = await POST_CHAT(req);
      const events = await readSSEStream(res);

      // One of the events should contain the conversationId
      const allText = events.join(" ");
      // Verify conversation was created
      const conversations = await testPrisma.conversation.findMany();
      expect(conversations.length).toBe(1);
      // The conversationId should be present somewhere in the stream
      expect(allText).toContain(conversations[0].id);
    });
  });

  // ── POST /api/chat/end ──────────────────────────────────────────────

  describe("POST /api/chat/end", () => {
    it("returns 200 and triggers updateUserPodcasterMemory", async () => {
      // Create conversation with messages
      const conversation = await testPrisma.conversation.create({
        data: {
          userId: seed.userId,
          podcasterId: seed.podcasterId,
          episodeId: seed.episodeId,
          timestampInEpisode: 90,
        },
      });

      await testPrisma.conversationMessage.createMany({
        data: [
          { conversationId: conversation.id, role: "user", content: "Question" },
          { conversationId: conversation.id, role: "assistant", content: "Answer" },
        ],
      });

      const req = createRequest(
        "POST",
        {
          conversationId: conversation.id,
          userId: seed.userId,
          podcasterId: seed.podcasterId,
        },
        "http://localhost:3100/api/chat/end"
      );

      const res = await POST_CHAT_END(req);
      expect(res.status).toBe(200);

      expect(mockUpdateUserPodcasterMemory).toHaveBeenCalledWith(
        seed.userId,
        seed.podcasterId,
        conversation.id
      );
    });

    it("returns 200 and is no-op for zero-message conversation", async () => {
      // Create conversation WITHOUT messages
      const conversation = await testPrisma.conversation.create({
        data: {
          userId: seed.userId,
          podcasterId: seed.podcasterId,
          episodeId: seed.episodeId,
          timestampInEpisode: 90,
        },
      });

      const req = createRequest(
        "POST",
        {
          conversationId: conversation.id,
          userId: seed.userId,
          podcasterId: seed.podcasterId,
        },
        "http://localhost:3100/api/chat/end"
      );

      const res = await POST_CHAT_END(req);
      expect(res.status).toBe(200);

      // updateUserPodcasterMemory should NOT be called for zero messages
      expect(mockUpdateUserPodcasterMemory).not.toHaveBeenCalled();
    });

    it("returns 400 when conversationId is missing", async () => {
      const req = createRequest(
        "POST",
        {
          userId: seed.userId,
          podcasterId: seed.podcasterId,
        },
        "http://localhost:3100/api/chat/end"
      );

      const res = await POST_CHAT_END(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("returns 400 when userId is missing", async () => {
      const req = createRequest(
        "POST",
        {
          conversationId: "some-id",
          podcasterId: seed.podcasterId,
        },
        "http://localhost:3100/api/chat/end"
      );

      const res = await POST_CHAT_END(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("returns 400 when podcasterId is missing", async () => {
      const req = createRequest(
        "POST",
        {
          conversationId: "some-id",
          userId: seed.userId,
        },
        "http://localhost:3100/api/chat/end"
      );

      const res = await POST_CHAT_END(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("returns 400 for invalid JSON body", async () => {
      const req = new Request("http://localhost:3100/api/chat/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      const res = await POST_CHAT_END(req);
      expect(res.status).toBe(400);
    });
  });
});
