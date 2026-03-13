import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../src/generated/prisma/client.js";

// Create test database client (separate DB to avoid lock conflicts)
const testAdapter = new PrismaBetterSqlite3({ url: "file:./prisma/test-integration.db" });
const testPrisma = new PrismaClient({ adapter: testAdapter });

const mockChat = vi.fn();
const mockStream = vi.fn();

// ── Mock db module to use test database ───────────────────────────────
vi.mock("@/lib/db", () => ({
  prisma: testPrisma,
}));

// ── Mock LLM provider ────────────────────────────────────────────────
vi.mock("@/lib/llm", () => ({
  getLLMProvider: () => ({
    chat: mockChat,
    stream: mockStream,
  }),
}));

// ── Mock vector store ────────────────────────────────────────────────
const mockVectorSearch = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/memory/vector-store", () => ({
  search: mockVectorSearch,
  addChunks: vi.fn().mockResolvedValue(undefined),
  deleteByMetadata: vi.fn().mockResolvedValue(0),
}));

// ── Mock transcript fetcher ──────────────────────────────────────────
const mockFetchTranscript = vi.fn();
vi.mock("@/lib/transcript/index", () => ({
  extractYouTubeId: (url: string): string | null => {
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
  },
  fetchTranscript: mockFetchTranscript,
  chunkTranscript: (segments: Array<{ text: string; offset: number; duration: number }>) => {
    if (segments.length === 0) return [];
    return segments.map((s) => ({
      text: s.text,
      startTime: s.offset,
      endTime: s.offset + s.duration,
    }));
  },
}));

// ── Lazy-loaded modules under test ──────────────────────────────────
let POST_EPISODES: (req: Request) => Promise<Response>;
let POST_CHAT: (req: Request) => Promise<Response>;
let POST_CHAT_END: (req: Request) => Promise<Response>;
let buildConversationContext: typeof import("@/lib/memory/context-builder").buildConversationContext;
let buildPodcasterProfile: typeof import("@/lib/memory/profile-builder").buildPodcasterProfile;
let updateUserPodcasterMemory: typeof import("@/lib/memory/profile-builder").updateUserPodcasterMemory;
let parseJsonArray: typeof import("@/lib/json-array").parseJsonArray;

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

function createRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function* fakeStream(tokens: string[]): AsyncGenerator<string, void, unknown> {
  for (const token of tokens) {
    yield token;
  }
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
  if (buffer.trim().startsWith("data: ")) {
    events.push(buffer.trim().slice(6));
  }
  return events;
}

const SAMPLE_TRANSCRIPT_A = [
  { text: "Welcome to the AI show.", offset: 0, duration: 30 },
  { text: "Today we discuss neural networks.", offset: 30, duration: 30 },
  { text: "Deep learning is transforming industries.", offset: 60, duration: 30 },
];

const SAMPLE_TRANSCRIPT_B = [
  { text: "Welcome back to another episode.", offset: 0, duration: 30 },
  { text: "Let's talk about robotics today.", offset: 30, duration: 30 },
  { text: "Robots are the future of automation.", offset: 60, duration: 30 },
];

// ── Tests ─────────────────────────────────────────────────────────────
describe("Cross-area integration tests", () => {
  let userId: string;

  beforeAll(async () => {
    const { execSync } = await import("child_process");
    execSync("npx prisma db push --force-reset", {
      env: { ...process.env, DATABASE_URL: "file:./prisma/test-integration.db" },
      cwd: process.cwd(),
      stdio: "pipe",
    });

    // Dynamic imports after mocks are registered
    const episodesModule = await import("@/app/api/episodes/route");
    POST_EPISODES = episodesModule.POST;

    const chatModule = await import("@/app/api/chat/route");
    POST_CHAT = chatModule.POST;

    const chatEndModule = await import("@/app/api/chat/end/route");
    POST_CHAT_END = chatEndModule.POST;

    const contextBuilder = await import("@/lib/memory/context-builder");
    buildConversationContext = contextBuilder.buildConversationContext;

    const profileBuilder = await import("@/lib/memory/profile-builder");
    buildPodcasterProfile = profileBuilder.buildPodcasterProfile;
    updateUserPodcasterMemory = profileBuilder.updateUserPodcasterMemory;

    const jsonArray = await import("@/lib/json-array");
    parseJsonArray = jsonArray.parseJsonArray;
  });

  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();

    // Create a test user for all tests
    const user = await testPrisma.user.create({
      data: { email: "integration-test@example.com", name: "Integration User" },
    });
    userId = user.id;

    // Default stream mock
    mockStream.mockReturnValue(fakeStream(["Hello", " there", "!"]));
  });

  afterAll(async () => {
    await cleanDatabase();
    await testPrisma.$disconnect();
  });

  // ── 1. Episode ingestion creates Episode + TranscriptChunks + Podcaster atomically ──

  describe("Episode ingestion atomicity", () => {
    it("creates Episode, TranscriptChunks, and Podcaster atomically", async () => {
      mockFetchTranscript.mockResolvedValueOnce(SAMPLE_TRANSCRIPT_A);

      const req = createRequest("http://localhost:3000/api/episodes", {
        url: "https://www.youtube.com/watch?v=abc12345678",
      });
      const res = await POST_EPISODES(req);
      expect(res.status).toBe(201);

      const body = await res.json();

      // Verify episode exists
      const episode = await testPrisma.episode.findUnique({
        where: { id: body.id },
        include: { transcriptChunks: true, podcaster: true },
      });

      expect(episode).not.toBeNull();
      expect(episode!.podcaster).toBeDefined();
      expect(episode!.podcaster.name).toBeDefined();
      expect(episode!.transcriptChunks).toHaveLength(SAMPLE_TRANSCRIPT_A.length);

      // Verify chunks are correctly stored
      for (let i = 0; i < episode!.transcriptChunks.length; i++) {
        expect(episode!.transcriptChunks[i].text).toBe(SAMPLE_TRANSCRIPT_A[i].text);
      }
    });
  });

  // ── 2. Chat creates Conversation + messages, streams response ──

  describe("Chat creates Conversation + messages, streams response", () => {
    it("creates Conversation, saves user message, streams LLM response, saves assistant message", async () => {
      // Seed a podcaster + episode directly
      const podcaster = await testPrisma.podcaster.create({
        data: { name: "Test Podcaster", channelUrl: "https://youtube.com/channel/chat-test" },
      });
      const episode = await testPrisma.episode.create({
        data: {
          podcasterId: podcaster.id,
          youtubeUrl: "https://www.youtube.com/watch?v=chattest1111",
          youtubeId: "chattest1111",
          title: "Chat Test Episode",
        },
      });
      await testPrisma.transcriptChunk.create({
        data: { episodeId: episode.id, text: "Some transcript text.", startTime: 0, endTime: 60 },
      });

      mockStream.mockReturnValue(fakeStream(["I'm", " the", " podcaster"]));

      const req = createRequest("http://localhost:3000/api/chat", {
        episodeId: episode.id,
        podcasterId: podcaster.id,
        userId,
        timestamp: 30,
        message: "What are you talking about?",
      });

      const res = await POST_CHAT(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");

      const events = await readSSEStream(res);
      expect(events.some((e) => e.includes("I'm"))).toBe(true);
      expect(events.some((e) => e === "[DONE]")).toBe(true);

      // Wait for async save
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify Conversation was created
      const conversations = await testPrisma.conversation.findMany({
        where: { userId, episodeId: episode.id },
      });
      expect(conversations).toHaveLength(1);

      // Verify messages: user + assistant
      const messages = await testPrisma.conversationMessage.findMany({
        where: { conversationId: conversations[0].id },
        orderBy: { createdAt: "asc" },
      });
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe("user");
      expect(messages[0].content).toBe("What are you talking about?");
      expect(messages[1].role).toBe("assistant");
      expect(messages[1].content).toBe("I'm the podcaster");
    });
  });

  // ── 3. Chat end triggers memory persistence ──

  describe("Chat end triggers memory persistence", () => {
    it("creates UserPodcasterMemory after ending a conversation with messages", async () => {
      const podcaster = await testPrisma.podcaster.create({
        data: { name: "Memory Podcaster", channelUrl: "https://youtube.com/channel/mem-test" },
      });
      const episode = await testPrisma.episode.create({
        data: {
          podcasterId: podcaster.id,
          youtubeUrl: "https://www.youtube.com/watch?v=memtest11111",
          youtubeId: "memtest11111",
          title: "Memory Test Episode",
        },
      });

      // Create conversation with messages
      const convo = await testPrisma.conversation.create({
        data: {
          userId,
          podcasterId: podcaster.id,
          episodeId: episode.id,
          timestampInEpisode: 30,
        },
      });
      await testPrisma.conversationMessage.createMany({
        data: [
          { conversationId: convo.id, role: "user", content: "Tell me about AI." },
          { conversationId: convo.id, role: "assistant", content: "AI is amazing!" },
        ],
      });

      // Mock LLM calls for memory summarization
      mockChat
        .mockResolvedValueOnce("Listener asked about AI fundamentals.")
        .mockResolvedValueOnce("AI, fundamentals");

      const req = createRequest("http://localhost:3000/api/chat/end", {
        conversationId: convo.id,
        userId,
        podcasterId: podcaster.id,
      });

      const res = await POST_CHAT_END(req);
      expect(res.status).toBe(200);

      // Verify memory was created
      const memory = await testPrisma.userPodcasterMemory.findUnique({
        where: { userId_podcasterId: { userId, podcasterId: podcaster.id } },
      });
      expect(memory).not.toBeNull();
      expect(memory!.summaryOfPastInteractions).toBe("Listener asked about AI fundamentals.");
      const topics = parseJsonArray(memory!.keyTopicsDiscussed);
      expect(topics).toContain("AI");
      expect(topics).toContain("fundamentals");
    });
  });

  // ── 4. Cross-episode memory: chat in A, end, chat in B with same podcaster ──

  describe("Cross-episode memory flow", () => {
    it("context for episode B includes memory from conversation in episode A", async () => {
      const podcaster = await testPrisma.podcaster.create({
        data: { name: "Cross-Ep Podcaster", channelUrl: "https://youtube.com/channel/cross-ep" },
      });

      // Episode A
      const episodeA = await testPrisma.episode.create({
        data: {
          podcasterId: podcaster.id,
          youtubeUrl: "https://www.youtube.com/watch?v=crossEpAA111",
          youtubeId: "crossEpAA111",
          title: "Episode A - AI",
        },
      });
      await testPrisma.transcriptChunk.createMany({
        data: [
          { episodeId: episodeA.id, text: "Welcome to the AI episode.", startTime: 0, endTime: 30 },
          { episodeId: episodeA.id, text: "Neural networks are powerful.", startTime: 30, endTime: 60 },
        ],
      });

      // Episode B
      const episodeB = await testPrisma.episode.create({
        data: {
          podcasterId: podcaster.id,
          youtubeUrl: "https://www.youtube.com/watch?v=crossEpBB222",
          youtubeId: "crossEpBB222",
          title: "Episode B - Robotics",
        },
      });
      await testPrisma.transcriptChunk.createMany({
        data: [
          { episodeId: episodeB.id, text: "Welcome to the robotics episode.", startTime: 0, endTime: 30 },
          { episodeId: episodeB.id, text: "Robots will change everything.", startTime: 30, endTime: 60 },
        ],
      });

      // Step 1: Chat in episode A
      const convoA = await testPrisma.conversation.create({
        data: {
          userId,
          podcasterId: podcaster.id,
          episodeId: episodeA.id,
          timestampInEpisode: 30,
        },
      });
      await testPrisma.conversationMessage.createMany({
        data: [
          { conversationId: convoA.id, role: "user", content: "Explain neural networks." },
          { conversationId: convoA.id, role: "assistant", content: "Neural networks mimic the brain." },
        ],
      });

      // Step 2: End conversation A → persist memory
      mockChat
        .mockResolvedValueOnce("Listener asked about neural networks and how they work.")
        .mockResolvedValueOnce("neural networks, deep learning");

      await updateUserPodcasterMemory(userId, podcaster.id, convoA.id);

      // Verify memory exists
      const memory = await testPrisma.userPodcasterMemory.findUnique({
        where: { userId_podcasterId: { userId, podcasterId: podcaster.id } },
      });
      expect(memory).not.toBeNull();

      // Step 3: Build context for episode B — should include memory from A
      const messagesB = await buildConversationContext({
        episodeId: episodeB.id,
        podcasterId: podcaster.id,
        userId,
        currentTimestamp: 30,
      });

      const systemPrompt = messagesB[0].content;
      // Should contain memory from episode A
      expect(systemPrompt).toContain("## Your History with This Listener");
      expect(systemPrompt).toContain("neural networks");
      // Should contain episode B transcript context
      expect(systemPrompt).toContain("Welcome to the robotics episode.");
    });
  });

  // ── 5. Profile auto-rebuild: add multiple episodes, verify profile enriched ──

  describe("Profile auto-rebuild with multiple episodes", () => {
    it("profile is enriched after adding multiple episodes", async () => {
      const podcaster = await testPrisma.podcaster.create({
        data: { name: "Profile Podcaster", channelUrl: "https://youtube.com/channel/profile-test" },
      });

      // Episode 1
      await testPrisma.episode.create({
        data: {
          podcasterId: podcaster.id,
          youtubeUrl: "https://www.youtube.com/watch?v=profTest1111",
          youtubeId: "profTest1111",
          title: "Episode 1 - AI",
          transcriptChunks: {
            create: [
              { text: "AI is the future.", startTime: 0, endTime: 30 },
              { text: "Machine learning powers everything.", startTime: 30, endTime: 60 },
            ],
          },
        },
      });

      // First profile build
      mockChat.mockResolvedValueOnce(
        "SUMMARY: A tech podcaster focused on AI.\n" +
        "SPEAKING_STYLE: Energetic\n" +
        "TOPICS: AI\n" +
        "PERSONALITY_TRAITS: passionate"
      );
      await buildPodcasterProfile(podcaster.id);

      let profile = await testPrisma.podcasterProfile.findFirst({
        where: { podcasterId: podcaster.id },
      });
      expect(profile).not.toBeNull();
      expect(profile!.summaryText).toContain("AI");

      // Episode 2
      await testPrisma.episode.create({
        data: {
          podcasterId: podcaster.id,
          youtubeUrl: "https://www.youtube.com/watch?v=profTest2222",
          youtubeId: "profTest2222",
          title: "Episode 2 - Robotics",
          transcriptChunks: {
            create: [
              { text: "Robotics is exciting.", startTime: 0, endTime: 30 },
            ],
          },
        },
      });

      // Rebuild profile with more episodes
      mockChat.mockResolvedValueOnce(
        "SUMMARY: A tech podcaster covering AI and robotics.\n" +
        "SPEAKING_STYLE: Energetic and detailed\n" +
        "TOPICS: AI, robotics, technology\n" +
        "PERSONALITY_TRAITS: passionate, analytical"
      );
      await buildPodcasterProfile(podcaster.id);

      profile = await testPrisma.podcasterProfile.findFirst({
        where: { podcasterId: podcaster.id },
      });
      expect(profile).not.toBeNull();
      expect(profile!.summaryText).toContain("robotics");

      const topics = parseJsonArray(profile!.topics);
      expect(topics).toContain("AI");
      expect(topics).toContain("robotics");
      expect(topics).toContain("technology");
    });
  });

  // ── 6. Empty conversation doesn't create memory ──

  describe("Empty conversation doesn't create memory", () => {
    it("chat/end with zero-message conversation does not persist memory", async () => {
      const podcaster = await testPrisma.podcaster.create({
        data: { name: "Empty Convo Podcaster", channelUrl: "https://youtube.com/channel/empty-convo" },
      });
      const episode = await testPrisma.episode.create({
        data: {
          podcasterId: podcaster.id,
          youtubeUrl: "https://www.youtube.com/watch?v=emptyConvo11",
          youtubeId: "emptyConvo11",
          title: "Empty Convo Episode",
        },
      });

      // Create conversation with NO messages
      const convo = await testPrisma.conversation.create({
        data: {
          userId,
          podcasterId: podcaster.id,
          episodeId: episode.id,
          timestampInEpisode: 10,
        },
      });

      const req = createRequest("http://localhost:3000/api/chat/end", {
        conversationId: convo.id,
        userId,
        podcasterId: podcaster.id,
      });

      const res = await POST_CHAT_END(req);
      expect(res.status).toBe(200);

      // Verify no memory was created
      const memory = await testPrisma.userPodcasterMemory.findUnique({
        where: { userId_podcasterId: { userId, podcasterId: podcaster.id } },
      });
      expect(memory).toBeNull();
      expect(mockChat).not.toHaveBeenCalled();
    });

    it("updateUserPodcasterMemory is no-op for empty conversation", async () => {
      const podcaster = await testPrisma.podcaster.create({
        data: { name: "Noop Podcaster", channelUrl: "https://youtube.com/channel/noop" },
      });
      const episode = await testPrisma.episode.create({
        data: {
          podcasterId: podcaster.id,
          youtubeUrl: "https://www.youtube.com/watch?v=noopConvo111",
          youtubeId: "noopConvo111",
          title: "Noop Episode",
        },
      });

      const convo = await testPrisma.conversation.create({
        data: {
          userId,
          podcasterId: podcaster.id,
          episodeId: episode.id,
          timestampInEpisode: 10,
        },
      });

      await updateUserPodcasterMemory(userId, podcaster.id, convo.id);

      const memory = await testPrisma.userPodcasterMemory.findUnique({
        where: { userId_podcasterId: { userId, podcasterId: podcaster.id } },
      });
      expect(memory).toBeNull();
      expect(mockChat).not.toHaveBeenCalled();
    });
  });

  // ── 7. Cascade deletion: delete episode → TranscriptChunks and Conversations cascade ──

  describe("Cascade deletion", () => {
    it("deleting an episode cascades to TranscriptChunks and Conversations", async () => {
      const podcaster = await testPrisma.podcaster.create({
        data: { name: "Cascade Podcaster", channelUrl: "https://youtube.com/channel/cascade" },
      });
      const episode = await testPrisma.episode.create({
        data: {
          podcasterId: podcaster.id,
          youtubeUrl: "https://www.youtube.com/watch?v=cascadeDel11",
          youtubeId: "cascadeDel11",
          title: "Cascade Episode",
        },
      });

      // Create transcript chunks
      await testPrisma.transcriptChunk.createMany({
        data: [
          { episodeId: episode.id, text: "Chunk 1", startTime: 0, endTime: 30 },
          { episodeId: episode.id, text: "Chunk 2", startTime: 30, endTime: 60 },
        ],
      });

      // Create conversation with messages
      const convo = await testPrisma.conversation.create({
        data: {
          userId,
          podcasterId: podcaster.id,
          episodeId: episode.id,
          timestampInEpisode: 30,
        },
      });
      await testPrisma.conversationMessage.createMany({
        data: [
          { conversationId: convo.id, role: "user", content: "Hello" },
          { conversationId: convo.id, role: "assistant", content: "Hi!" },
        ],
      });

      // Verify data exists before deletion
      expect(await testPrisma.transcriptChunk.count({ where: { episodeId: episode.id } })).toBe(2);
      expect(await testPrisma.conversation.count({ where: { episodeId: episode.id } })).toBe(1);
      expect(await testPrisma.conversationMessage.count({ where: { conversationId: convo.id } })).toBe(2);

      // Delete the episode
      await testPrisma.episode.delete({ where: { id: episode.id } });

      // Verify cascade deletion
      expect(await testPrisma.transcriptChunk.count({ where: { episodeId: episode.id } })).toBe(0);
      expect(await testPrisma.conversation.count({ where: { episodeId: episode.id } })).toBe(0);
      expect(await testPrisma.conversationMessage.count({ where: { conversationId: convo.id } })).toBe(0);
    });

    it("deleting a podcaster cascades to episodes, profiles, and memory", async () => {
      const podcaster = await testPrisma.podcaster.create({
        data: { name: "Full Cascade", channelUrl: "https://youtube.com/channel/full-cascade" },
      });
      const episode = await testPrisma.episode.create({
        data: {
          podcasterId: podcaster.id,
          youtubeUrl: "https://www.youtube.com/watch?v=fullCascade1",
          youtubeId: "fullCascade1",
          title: "Full Cascade Episode",
        },
      });
      await testPrisma.transcriptChunk.create({
        data: { episodeId: episode.id, text: "Data", startTime: 0, endTime: 30 },
      });
      await testPrisma.podcasterProfile.create({
        data: {
          id: `${podcaster.id}-latest`,
          podcasterId: podcaster.id,
          summaryText: "A podcaster.",
          topics: "[]",
          personalityTraits: "[]",
        },
      });
      await testPrisma.userPodcasterMemory.create({
        data: {
          userId,
          podcasterId: podcaster.id,
          summaryOfPastInteractions: "Some memory.",
          keyTopicsDiscussed: "[]",
        },
      });

      // Delete podcaster
      await testPrisma.podcaster.delete({ where: { id: podcaster.id } });

      // Verify all cascaded
      expect(await testPrisma.episode.count({ where: { podcasterId: podcaster.id } })).toBe(0);
      expect(await testPrisma.podcasterProfile.count({ where: { podcasterId: podcaster.id } })).toBe(0);
      expect(await testPrisma.userPodcasterMemory.count({ where: { podcasterId: podcaster.id } })).toBe(0);
    });
  });

  // ── 8. Context builder includes timestamp-based transcript + semantic results ──

  describe("Context builder includes timestamp-based transcript + semantic results", () => {
    it("includes recent transcript chunks within 5-minute window", async () => {
      const podcaster = await testPrisma.podcaster.create({
        data: { name: "Context Podcaster", channelUrl: "https://youtube.com/channel/context-test" },
      });
      const episode = await testPrisma.episode.create({
        data: {
          podcasterId: podcaster.id,
          youtubeUrl: "https://www.youtube.com/watch?v=contextTst11",
          youtubeId: "contextTst11",
          title: "Context Episode",
        },
      });
      await testPrisma.transcriptChunk.createMany({
        data: [
          { episodeId: episode.id, text: "Early part of the episode.", startTime: 0, endTime: 30 },
          { episodeId: episode.id, text: "Discussion about machine learning.", startTime: 100, endTime: 130 },
          { episodeId: episode.id, text: "Now talking about deep learning.", startTime: 200, endTime: 230 },
          { episodeId: episode.id, text: "Far future content.", startTime: 600, endTime: 630 },
        ],
      });

      // Build context at timestamp 220 (should include chunks within [0, 220] ∩ [220-300, 220] = [-80, 220])
      // So startTime >= max(0, 220-300)=0, startTime <= 220
      // All except "Far future content" (startTime=600) should be included
      const messages = await buildConversationContext({
        episodeId: episode.id,
        podcasterId: podcaster.id,
        userId,
        currentTimestamp: 220,
      });

      const systemPrompt = messages[0].content;
      expect(systemPrompt).toContain("Early part of the episode.");
      expect(systemPrompt).toContain("Discussion about machine learning.");
      expect(systemPrompt).toContain("Now talking about deep learning.");
      expect(systemPrompt).not.toContain("Far future content.");
    });

    it("includes semantic search results when userMessage is provided", async () => {
      const podcaster = await testPrisma.podcaster.create({
        data: { name: "Semantic Podcaster", channelUrl: "https://youtube.com/channel/semantic-test" },
      });
      const episode = await testPrisma.episode.create({
        data: {
          podcasterId: podcaster.id,
          youtubeUrl: "https://www.youtube.com/watch?v=semanticTst1",
          youtubeId: "semanticTst1",
          title: "Semantic Episode",
        },
      });
      await testPrisma.transcriptChunk.create({
        data: { episodeId: episode.id, text: "Current transcript context.", startTime: 0, endTime: 30 },
      });

      // Mock vector search to return related content
      mockVectorSearch.mockResolvedValueOnce([
        { id: "semantic-chunk-1", text: "Related content from another episode about quantum computing.", score: 0.8 },
        { id: "semantic-chunk-2", text: "Another related excerpt about algorithms.", score: 0.5 },
      ]);

      const messages = await buildConversationContext({
        episodeId: episode.id,
        podcasterId: podcaster.id,
        userId,
        currentTimestamp: 15,
        userMessage: "Tell me about quantum computing",
      });

      const systemPrompt = messages[0].content;
      expect(systemPrompt).toContain("## Related Content");
      expect(systemPrompt).toContain("quantum computing");
      expect(systemPrompt).toContain("algorithms");
    });

    it("filters out low-score semantic results", async () => {
      const podcaster = await testPrisma.podcaster.create({
        data: { name: "Filter Podcaster", channelUrl: "https://youtube.com/channel/filter-test" },
      });
      const episode = await testPrisma.episode.create({
        data: {
          podcasterId: podcaster.id,
          youtubeUrl: "https://www.youtube.com/watch?v=filterTest11",
          youtubeId: "filterTest11",
          title: "Filter Episode",
        },
      });
      await testPrisma.transcriptChunk.create({
        data: { episodeId: episode.id, text: "Current context.", startTime: 0, endTime: 30 },
      });

      // Only return low-score results
      mockVectorSearch.mockResolvedValueOnce([
        { id: "low-score", text: "Irrelevant content.", score: 0.1 },
      ]);

      const messages = await buildConversationContext({
        episodeId: episode.id,
        podcasterId: podcaster.id,
        userId,
        currentTimestamp: 15,
        userMessage: "Something random",
      });

      const systemPrompt = messages[0].content;
      expect(systemPrompt).not.toContain("## Related Content");
      expect(systemPrompt).not.toContain("Irrelevant content.");
    });
  });

  // ── 9. Multiple conversations accumulate memory ──

  describe("Multiple conversations accumulate memory", () => {
    it("summaries are appended and topics are deduped across conversations", async () => {
      const podcaster = await testPrisma.podcaster.create({
        data: { name: "Accumulate Podcaster", channelUrl: "https://youtube.com/channel/accumulate" },
      });
      const episode = await testPrisma.episode.create({
        data: {
          podcasterId: podcaster.id,
          youtubeUrl: "https://www.youtube.com/watch?v=accumulate11",
          youtubeId: "accumulate11",
          title: "Accumulate Episode",
        },
      });

      // Conversation 1
      const convo1 = await testPrisma.conversation.create({
        data: {
          userId,
          podcasterId: podcaster.id,
          episodeId: episode.id,
          timestampInEpisode: 30,
        },
      });
      await testPrisma.conversationMessage.createMany({
        data: [
          { conversationId: convo1.id, role: "user", content: "What is AI?" },
          { conversationId: convo1.id, role: "assistant", content: "AI is intelligence from machines." },
        ],
      });

      mockChat
        .mockResolvedValueOnce("Discussed AI basics.")
        .mockResolvedValueOnce("AI, machine learning, basics");

      await updateUserPodcasterMemory(userId, podcaster.id, convo1.id);

      // Verify first memory
      let memory = await testPrisma.userPodcasterMemory.findUnique({
        where: { userId_podcasterId: { userId, podcasterId: podcaster.id } },
      });
      expect(memory).not.toBeNull();
      expect(memory!.summaryOfPastInteractions).toBe("Discussed AI basics.");

      // Conversation 2
      const convo2 = await testPrisma.conversation.create({
        data: {
          userId,
          podcasterId: podcaster.id,
          episodeId: episode.id,
          timestampInEpisode: 60,
        },
      });
      await testPrisma.conversationMessage.createMany({
        data: [
          { conversationId: convo2.id, role: "user", content: "Tell me about robotics." },
          { conversationId: convo2.id, role: "assistant", content: "Robotics uses AI." },
        ],
      });

      mockChat
        .mockResolvedValueOnce("Explored robotics and AI applications.")
        .mockResolvedValueOnce("robotics, AI, automation");

      await updateUserPodcasterMemory(userId, podcaster.id, convo2.id);

      // Verify accumulated memory
      memory = await testPrisma.userPodcasterMemory.findUnique({
        where: { userId_podcasterId: { userId, podcasterId: podcaster.id } },
      });
      expect(memory).not.toBeNull();

      // Summaries appended
      expect(memory!.summaryOfPastInteractions).toBe(
        "Discussed AI basics.\n\nExplored robotics and AI applications."
      );

      // Topics deduped
      const topics = parseJsonArray(memory!.keyTopicsDiscussed);
      expect(topics).toContain("AI");
      expect(topics).toContain("machine learning");
      expect(topics).toContain("basics");
      expect(topics).toContain("robotics");
      expect(topics).toContain("automation");

      // AI should appear only once (deduped)
      const aiCount = topics.filter((t) => t === "AI").length;
      expect(aiCount).toBe(1);
    });

    it("third conversation further accumulates onto existing memory", async () => {
      const podcaster = await testPrisma.podcaster.create({
        data: { name: "Triple Podcaster", channelUrl: "https://youtube.com/channel/triple" },
      });
      const episode = await testPrisma.episode.create({
        data: {
          podcasterId: podcaster.id,
          youtubeUrl: "https://www.youtube.com/watch?v=tripleConvo1",
          youtubeId: "tripleConvo1",
          title: "Triple Episode",
        },
      });

      // Pre-seed existing memory (simulating 2 prior conversations)
      await testPrisma.userPodcasterMemory.create({
        data: {
          userId,
          podcasterId: podcaster.id,
          summaryOfPastInteractions: "First chat.\n\nSecond chat.",
          keyTopicsDiscussed: JSON.stringify(["AI", "robotics"]),
        },
      });

      // Third conversation
      const convo3 = await testPrisma.conversation.create({
        data: {
          userId,
          podcasterId: podcaster.id,
          episodeId: episode.id,
          timestampInEpisode: 90,
        },
      });
      await testPrisma.conversationMessage.createMany({
        data: [
          { conversationId: convo3.id, role: "user", content: "What about quantum computing?" },
          { conversationId: convo3.id, role: "assistant", content: "Quantum computing is next." },
        ],
      });

      mockChat
        .mockResolvedValueOnce("Third conversation about quantum computing.")
        .mockResolvedValueOnce("quantum computing, AI");

      await updateUserPodcasterMemory(userId, podcaster.id, convo3.id);

      const memory = await testPrisma.userPodcasterMemory.findUnique({
        where: { userId_podcasterId: { userId, podcasterId: podcaster.id } },
      });

      expect(memory!.summaryOfPastInteractions).toBe(
        "First chat.\n\nSecond chat.\n\nThird conversation about quantum computing."
      );

      const topics = parseJsonArray(memory!.keyTopicsDiscussed);
      expect(topics).toContain("AI");
      expect(topics).toContain("robotics");
      expect(topics).toContain("quantum computing");
      // AI deduped
      expect(topics.filter((t) => t === "AI")).toHaveLength(1);
    });
  });
});
