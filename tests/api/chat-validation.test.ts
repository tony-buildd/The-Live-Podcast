import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  currentUserMock,
  apiRefs,
  mutationMock,
  queryMock,
  streamMock,
} = vi.hoisted(() => ({
  authMock: vi.fn<() => Promise<{ userId: string | null }>>(),
  currentUserMock: vi.fn(),
  apiRefs: {
    users: { ensureUser: "users.ensureUser" },
    chat: {
      startConversation: "chat.startConversation",
      appendAssistantMessage: "chat.appendAssistantMessage",
      listConversationMessages: "chat.listConversationMessages",
    },
    transcriptChunks: {
      getChunksUpToTimestamp: "transcriptChunks.getChunksUpToTimestamp",
    },
    episodes: {
      getEpisodeById: "episodes.getEpisodeById",
    },
  },
  mutationMock: vi.fn(),
  queryMock: vi.fn(),
  streamMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  currentUser: currentUserMock,
}));

vi.mock("@/lib/convex/client", () => ({
  api: apiRefs,
  getConvexClient: () => ({
    mutation: mutationMock,
    query: queryMock,
  }),
  isConvexConfigurationError: () => false,
}));

vi.mock("@/lib/llm", () => ({
  getLLMProvider: () => ({
    chat: vi.fn(),
    stream: streamMock,
  }),
}));

import { POST } from "@/app/api/chat/route";

async function* oneTokenStream(): AsyncGenerator<string, void, unknown> {
  yield "hello";
}

async function drainStream(response: Response): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;

  let finished = false;
  while (!finished) {
    const { done } = await reader.read();
    finished = done;
  }
}

describe("POST /api/chat validation", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: "server_user" });
    currentUserMock.mockResolvedValue({
      emailAddresses: [{ emailAddress: "user@example.com" }],
      fullName: "Server User",
      imageUrl: "https://example.com/avatar.png",
    });

    mutationMock.mockReset();
    queryMock.mockReset();
    streamMock.mockReset();

    mutationMock.mockImplementation(
      async (ref: string, args: Record<string, unknown>) => {
        if (ref === apiRefs.users.ensureUser) {
          return "user_doc";
        }
        if (ref === apiRefs.chat.startConversation) {
          return { conversationId: "conv_1" };
        }
        if (ref === apiRefs.chat.appendAssistantMessage) {
          return "msg_1";
        }
        throw new Error(`Unexpected mutation ref: ${ref} (${JSON.stringify(args)})`);
      },
    );

    queryMock.mockImplementation(
      async (ref: string) => {
        if (ref === apiRefs.transcriptChunks.getChunksUpToTimestamp) {
          return [{ text: "some transcript", startTime: 0, endTime: 15 }];
        }
        if (ref === apiRefs.episodes.getEpisodeById) {
          return { title: "Test Episode", youtubeId: "abc123" };
        }
        if (ref === apiRefs.chat.listConversationMessages) {
          return [];
        }
        return [];
      },
    );
    streamMock.mockReturnValue(oneTokenStream());
  });

  it("returns 400 when required payload fields are missing", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeId: "episode_1", message: "hello" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Missing required fields");
  });

  it("returns 400 for whitespace-only messages", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        episodeId: "episode_1",
        podcasterId: "podcaster_1",
        timestamp: 12,
        message: "   \n\t ",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Message cannot be empty or whitespace-only",
    });
  });

  it("uses authenticated userId and ignores any client-provided userId", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        episodeId: "episode_1",
        podcasterId: "podcaster_1",
        timestamp: 30,
        message: "Can you recap?",
        userId: "attacker_user",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await drainStream(res);

    const startConversationCall = mutationMock.mock.calls.find(
      (call) => call[0] === apiRefs.chat.startConversation,
    );

    expect(startConversationCall).toBeDefined();
    const args = startConversationCall?.[1] as { userId: string };
    expect(args.userId).toBe("server_user");
    expect(args.userId).not.toBe("attacker_user");
  });
});
