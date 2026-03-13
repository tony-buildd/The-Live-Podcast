import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../src/generated/prisma/client.js";

// Create test database client
const testAdapter = new PrismaBetterSqlite3({ url: "file:./prisma/test-cross-episode.db" });
const testPrisma = new PrismaClient({ adapter: testAdapter });

// ── Mock db module to use test database ───────────────────────────────
vi.mock("@/lib/db", () => ({
  prisma: testPrisma,
}));

// ── Mock LLM provider ────────────────────────────────────────────────
const mockChat = vi.fn();
vi.mock("@/lib/llm", () => ({
  getLLMProvider: () => ({
    chat: mockChat,
    stream: vi.fn(),
  }),
}));

// ── Mock vector store ────────────────────────────────────────────────
vi.mock("@/lib/memory/vector-store", () => ({
  search: vi.fn().mockResolvedValue([]),
  addChunks: vi.fn().mockResolvedValue(undefined),
  deleteByMetadata: vi.fn().mockResolvedValue(0),
}));

// ── Import modules under test (after mocks) ─────────────────────────
import { updateUserPodcasterMemory, buildPodcasterProfile } from "@/lib/memory/profile-builder";
import { buildConversationContext } from "@/lib/memory/context-builder";
import { parseJsonArray } from "@/lib/json-array";

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

interface SeedData {
  userId: string;
  podcasterId: string;
  episodeId: string;
}

async function seedTestData(): Promise<SeedData> {
  const user = await testPrisma.user.create({
    data: { email: "cross-ep-test@example.com", name: "Test User" },
  });

  const podcaster = await testPrisma.podcaster.create({
    data: {
      name: "Alex Thompson",
      channelUrl: "https://youtube.com/channel/cross-ep-test",
    },
  });

  const episode = await testPrisma.episode.create({
    data: {
      podcasterId: podcaster.id,
      youtubeUrl: "https://www.youtube.com/watch?v=cross-ep-1",
      youtubeId: "cross-ep-1",
      title: "Test Episode 1",
    },
  });

  await testPrisma.transcriptChunk.createMany({
    data: [
      { episodeId: episode.id, text: "Welcome to my show.", startTime: 0, endTime: 30 },
      { episodeId: episode.id, text: "Today we discuss AI trends.", startTime: 30, endTime: 60 },
    ],
  });

  return {
    userId: user.id,
    podcasterId: podcaster.id,
    episodeId: episode.id,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────
describe("Cross-episode memory", () => {
  let seed: SeedData;

  beforeAll(async () => {
    const { execSync } = await import("child_process");
    execSync("npx prisma db push --force-reset", {
      env: { ...process.env, DATABASE_URL: "file:./prisma/test-cross-episode.db" },
      cwd: process.cwd(),
      stdio: "pipe",
    });
  });

  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
    seed = await seedTestData();
  });

  afterAll(async () => {
    await cleanDatabase();
    await testPrisma.$disconnect();
  });

  // ── Memory accumulation across conversations ────────────────────

  describe("updateUserPodcasterMemory", () => {
    it("creates new memory on first conversation", async () => {
      // Create a conversation with messages
      const convo = await testPrisma.conversation.create({
        data: {
          userId: seed.userId,
          podcasterId: seed.podcasterId,
          episodeId: seed.episodeId,
          timestampInEpisode: 30,
        },
      });
      await testPrisma.conversationMessage.createMany({
        data: [
          { conversationId: convo.id, role: "user", content: "What is machine learning?" },
          { conversationId: convo.id, role: "assistant", content: "Machine learning is a subset of AI." },
        ],
      });

      // Mock LLM responses for summary and topics
      mockChat
        .mockResolvedValueOnce("Listener asked about machine learning basics.")
        .mockResolvedValueOnce("machine learning, AI basics");

      await updateUserPodcasterMemory(seed.userId, seed.podcasterId, convo.id);

      const memory = await testPrisma.userPodcasterMemory.findUnique({
        where: { userId_podcasterId: { userId: seed.userId, podcasterId: seed.podcasterId } },
      });

      expect(memory).not.toBeNull();
      expect(memory!.summaryOfPastInteractions).toBe("Listener asked about machine learning basics.");
      const topics = parseJsonArray(memory!.keyTopicsDiscussed);
      expect(topics).toContain("machine learning");
      expect(topics).toContain("AI basics");
    });

    it("accumulates summaries across multiple conversations", async () => {
      // First conversation
      const convo1 = await testPrisma.conversation.create({
        data: {
          userId: seed.userId,
          podcasterId: seed.podcasterId,
          episodeId: seed.episodeId,
          timestampInEpisode: 30,
        },
      });
      await testPrisma.conversationMessage.createMany({
        data: [
          { conversationId: convo1.id, role: "user", content: "Tell me about AI." },
          { conversationId: convo1.id, role: "assistant", content: "AI is fascinating." },
        ],
      });

      mockChat
        .mockResolvedValueOnce("Discussed AI fundamentals.")
        .mockResolvedValueOnce("AI, fundamentals");

      await updateUserPodcasterMemory(seed.userId, seed.podcasterId, convo1.id);

      // Second conversation
      const convo2 = await testPrisma.conversation.create({
        data: {
          userId: seed.userId,
          podcasterId: seed.podcasterId,
          episodeId: seed.episodeId,
          timestampInEpisode: 60,
        },
      });
      await testPrisma.conversationMessage.createMany({
        data: [
          { conversationId: convo2.id, role: "user", content: "What about robotics?" },
          { conversationId: convo2.id, role: "assistant", content: "Robotics uses AI." },
        ],
      });

      mockChat
        .mockResolvedValueOnce("Explored robotics applications of AI.")
        .mockResolvedValueOnce("robotics, AI applications");

      await updateUserPodcasterMemory(seed.userId, seed.podcasterId, convo2.id);

      const memory = await testPrisma.userPodcasterMemory.findUnique({
        where: { userId_podcasterId: { userId: seed.userId, podcasterId: seed.podcasterId } },
      });

      expect(memory).not.toBeNull();
      // Summaries should be separated by \n\n
      expect(memory!.summaryOfPastInteractions).toBe(
        "Discussed AI fundamentals.\n\nExplored robotics applications of AI."
      );
    });

    it("deduplicates topics across conversations", async () => {
      // First conversation - creates memory with initial topics
      const convo1 = await testPrisma.conversation.create({
        data: {
          userId: seed.userId,
          podcasterId: seed.podcasterId,
          episodeId: seed.episodeId,
          timestampInEpisode: 30,
        },
      });
      await testPrisma.conversationMessage.createMany({
        data: [
          { conversationId: convo1.id, role: "user", content: "Tell me about AI." },
          { conversationId: convo1.id, role: "assistant", content: "Sure thing." },
        ],
      });

      mockChat
        .mockResolvedValueOnce("Discussed AI.")
        .mockResolvedValueOnce("machine learning, deep learning, AI");

      await updateUserPodcasterMemory(seed.userId, seed.podcasterId, convo1.id);

      // Second conversation - has overlapping topics
      const convo2 = await testPrisma.conversation.create({
        data: {
          userId: seed.userId,
          podcasterId: seed.podcasterId,
          episodeId: seed.episodeId,
          timestampInEpisode: 60,
        },
      });
      await testPrisma.conversationMessage.createMany({
        data: [
          { conversationId: convo2.id, role: "user", content: "More about ML." },
          { conversationId: convo2.id, role: "assistant", content: "Sure." },
        ],
      });

      mockChat
        .mockResolvedValueOnce("Discussed ML further.")
        .mockResolvedValueOnce("machine learning, neural networks, AI");

      await updateUserPodcasterMemory(seed.userId, seed.podcasterId, convo2.id);

      const memory = await testPrisma.userPodcasterMemory.findUnique({
        where: { userId_podcasterId: { userId: seed.userId, podcasterId: seed.podcasterId } },
      });

      const topics = parseJsonArray(memory!.keyTopicsDiscussed);
      // "machine learning" and "AI" should appear only once each
      const mlCount = topics.filter((t) => t === "machine learning").length;
      const aiCount = topics.filter((t) => t === "AI").length;
      expect(mlCount).toBe(1);
      expect(aiCount).toBe(1);
      // All unique topics should be present
      expect(topics).toContain("machine learning");
      expect(topics).toContain("deep learning");
      expect(topics).toContain("AI");
      expect(topics).toContain("neural networks");
      expect(topics).toHaveLength(4);
    });

    it("does not create memory for empty conversation (0 messages)", async () => {
      const convo = await testPrisma.conversation.create({
        data: {
          userId: seed.userId,
          podcasterId: seed.podcasterId,
          episodeId: seed.episodeId,
          timestampInEpisode: 30,
        },
      });

      await updateUserPodcasterMemory(seed.userId, seed.podcasterId, convo.id);

      const memory = await testPrisma.userPodcasterMemory.findUnique({
        where: { userId_podcasterId: { userId: seed.userId, podcasterId: seed.podcasterId } },
      });

      expect(memory).toBeNull();
      // LLM should not have been called
      expect(mockChat).not.toHaveBeenCalled();
    });
  });

  // ── Context builder with profile and memory ─────────────────────

  describe("buildConversationContext", () => {
    it("includes profile section when PodcasterProfile exists", async () => {
      await testPrisma.podcasterProfile.create({
        data: {
          id: `${seed.podcasterId}-latest`,
          podcasterId: seed.podcasterId,
          summaryText: "Alex is a tech enthusiast who loves AI.",
          topics: JSON.stringify(["AI", "startups", "tech"]),
          personalityTraits: JSON.stringify(["curious", "analytical"]),
          speakingStyle: "Casual and conversational",
        },
      });

      const messages = await buildConversationContext({
        episodeId: seed.episodeId,
        podcasterId: seed.podcasterId,
        userId: seed.userId,
        currentTimestamp: 30,
      });

      const systemPrompt = messages[0].content;
      expect(systemPrompt).toContain("## Your Profile");
      expect(systemPrompt).toContain("Alex is a tech enthusiast who loves AI.");
      expect(systemPrompt).toContain("Speaking style: Casual and conversational");
      expect(systemPrompt).toContain("AI");
      expect(systemPrompt).toContain("startups");
    });

    it("includes memory section when UserPodcasterMemory exists", async () => {
      await testPrisma.userPodcasterMemory.create({
        data: {
          userId: seed.userId,
          podcasterId: seed.podcasterId,
          summaryOfPastInteractions: "Listener asked about AI and machine learning.",
          keyTopicsDiscussed: JSON.stringify(["AI", "machine learning"]),
        },
      });

      const messages = await buildConversationContext({
        episodeId: seed.episodeId,
        podcasterId: seed.podcasterId,
        userId: seed.userId,
        currentTimestamp: 30,
      });

      const systemPrompt = messages[0].content;
      expect(systemPrompt).toContain("## Your History with This Listener");
      expect(systemPrompt).toContain("Listener asked about AI and machine learning.");
      expect(systemPrompt).toContain("Topics you've discussed before: AI, machine learning");
    });

    it("omits profile section when no PodcasterProfile exists", async () => {
      const messages = await buildConversationContext({
        episodeId: seed.episodeId,
        podcasterId: seed.podcasterId,
        userId: seed.userId,
        currentTimestamp: 30,
      });

      const systemPrompt = messages[0].content;
      expect(systemPrompt).not.toContain("## Your Profile");
    });

    it("omits memory section when no UserPodcasterMemory exists", async () => {
      const messages = await buildConversationContext({
        episodeId: seed.episodeId,
        podcasterId: seed.podcasterId,
        userId: seed.userId,
        currentTimestamp: 30,
      });

      const systemPrompt = messages[0].content;
      expect(systemPrompt).not.toContain("## Your History with This Listener");
    });

    it("includes podcaster name in system prompt", async () => {
      const messages = await buildConversationContext({
        episodeId: seed.episodeId,
        podcasterId: seed.podcasterId,
        userId: seed.userId,
        currentTimestamp: 30,
      });

      const systemPrompt = messages[0].content;
      expect(systemPrompt).toContain("Alex Thompson");
    });

    it("uses fallback when podcaster not found", async () => {
      const messages = await buildConversationContext({
        episodeId: seed.episodeId,
        podcasterId: "nonexistent-podcaster-id",
        userId: seed.userId,
        currentTimestamp: 30,
      });

      const systemPrompt = messages[0].content;
      expect(systemPrompt).toContain("the podcaster");
    });

    it("includes both profile and memory when both exist", async () => {
      await testPrisma.podcasterProfile.create({
        data: {
          id: `${seed.podcasterId}-latest`,
          podcasterId: seed.podcasterId,
          summaryText: "Alex is a tech podcaster.",
          topics: JSON.stringify(["tech"]),
          personalityTraits: JSON.stringify(["curious"]),
          speakingStyle: "Conversational",
        },
      });

      await testPrisma.userPodcasterMemory.create({
        data: {
          userId: seed.userId,
          podcasterId: seed.podcasterId,
          summaryOfPastInteractions: "Previous chats about AI.",
          keyTopicsDiscussed: JSON.stringify(["AI"]),
        },
      });

      const messages = await buildConversationContext({
        episodeId: seed.episodeId,
        podcasterId: seed.podcasterId,
        userId: seed.userId,
        currentTimestamp: 30,
      });

      const systemPrompt = messages[0].content;
      expect(systemPrompt).toContain("## Your Profile");
      expect(systemPrompt).toContain("## Your History with This Listener");
      expect(systemPrompt).toContain("## What You Were Just Talking About");
    });
  });

  // ── Profile rebuild on new episode ──────────────────────────────

  describe("buildPodcasterProfile", () => {
    it("rebuilds profile with episode data", async () => {
      mockChat.mockResolvedValueOnce(
        "SUMMARY: Alex is a thoughtful tech podcaster.\n" +
        "SPEAKING_STYLE: Casual and engaging\n" +
        "TOPICS: AI, technology, startups\n" +
        "PERSONALITY_TRAITS: curious, analytical, friendly"
      );

      await buildPodcasterProfile(seed.podcasterId);

      const profile = await testPrisma.podcasterProfile.findFirst({
        where: { podcasterId: seed.podcasterId },
      });

      expect(profile).not.toBeNull();
      expect(profile!.summaryText).toContain("Alex is a thoughtful tech podcaster.");
      expect(profile!.speakingStyle).toBe("Casual and engaging");

      const topics = parseJsonArray(profile!.topics);
      expect(topics).toContain("AI");
      expect(topics).toContain("technology");

      const traits = parseJsonArray(profile!.personalityTraits);
      expect(traits).toContain("curious");
      expect(traits).toContain("analytical");
    });

    it("updates existing profile when called again (e.g. new episode added)", async () => {
      // First build
      mockChat.mockResolvedValueOnce(
        "SUMMARY: Alex talks about tech.\n" +
        "SPEAKING_STYLE: Casual\n" +
        "TOPICS: tech\n" +
        "PERSONALITY_TRAITS: curious"
      );
      await buildPodcasterProfile(seed.podcasterId);

      // Add a second episode
      await testPrisma.episode.create({
        data: {
          podcasterId: seed.podcasterId,
          youtubeUrl: "https://www.youtube.com/watch?v=cross-ep-2",
          youtubeId: "cross-ep-2",
          title: "Test Episode 2",
          transcriptChunks: {
            create: [
              { text: "Today we explore robotics.", startTime: 0, endTime: 30 },
            ],
          },
        },
      });

      // Rebuild profile
      mockChat.mockResolvedValueOnce(
        "SUMMARY: Alex covers tech and robotics.\n" +
        "SPEAKING_STYLE: Energetic and casual\n" +
        "TOPICS: tech, robotics, AI\n" +
        "PERSONALITY_TRAITS: curious, enthusiastic"
      );
      await buildPodcasterProfile(seed.podcasterId);

      const profiles = await testPrisma.podcasterProfile.findMany({
        where: { podcasterId: seed.podcasterId },
      });

      // Should be upserted (same id), not duplicated
      expect(profiles).toHaveLength(1);
      expect(profiles[0].summaryText).toContain("robotics");

      const topics = parseJsonArray(profiles[0].topics);
      expect(topics).toContain("robotics");
    });

    it("does nothing when podcaster has no episodes", async () => {
      // Create a podcaster with no episodes
      const emptyPodcaster = await testPrisma.podcaster.create({
        data: {
          name: "Empty Podcaster",
          channelUrl: "https://youtube.com/channel/empty",
        },
      });

      await buildPodcasterProfile(emptyPodcaster.id);

      const profile = await testPrisma.podcasterProfile.findFirst({
        where: { podcasterId: emptyPodcaster.id },
      });

      expect(profile).toBeNull();
      expect(mockChat).not.toHaveBeenCalled();
    });
  });
});
