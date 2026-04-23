import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getLLMProvider } from "@/lib/llm";
import type { Message } from "@/lib/llm/types";
import {
  getConvexClient,
  api,
  isConvexConfigurationError,
} from "@/lib/convex/client";
import { asConvexId } from "@/lib/convex/ids";
import { buildMvpSystemPrompt } from "@/lib/chat/system-prompt";
import type { Id } from "../../../../convex/_generated/dataModel";

interface ChatRequestBody {
  episodeId?: string;
  podcasterId?: string;
  timestamp?: number;
  message?: string;
  conversationId?: string;
}

type ChatStreamEvent =
  | { type: "conversation"; conversationId: string }
  | { type: "token"; content: string }
  | { type: "done" }
  | { type: "error"; message: string };

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  if (!body) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { episodeId, podcasterId, timestamp, message, conversationId } = body;
  const normalizedConversationId =
    typeof conversationId === "string" && conversationId.trim() !== ""
      ? conversationId
      : undefined;

  const missingFields: string[] = [];
  if (!episodeId) missingFields.push("episodeId");
  if (!podcasterId) missingFields.push("podcasterId");
  if (timestamp === undefined || timestamp === null) missingFields.push("timestamp");
  if (message === undefined || message === null) missingFields.push("message");

  if (missingFields.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missingFields.join(", ")}` },
      { status: 400 }
    );
  }

  if (typeof message !== "string" || message.trim() === "") {
    return NextResponse.json(
      { error: "Message cannot be empty or whitespace-only" },
      { status: 400 }
    );
  }

  if (
    typeof episodeId !== "string" ||
    typeof podcasterId !== "string" ||
    typeof timestamp !== "number"
  ) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const typedTimestamp = timestamp;
  const typedMessage = message;

  let convex;
  try {
    convex = getConvexClient();
    const clerkUser = await currentUser();
    await convex
      .mutation(api.users.ensureUser, {
        clerkUserId: userId,
        email: clerkUser?.emailAddresses[0]?.emailAddress,
        name: clerkUser?.fullName ?? undefined,
        imageUrl: clerkUser?.imageUrl,
      })
      .catch(() => undefined);
  } catch (error) {
    if (isConvexConfigurationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    const message =
      error instanceof Error ? error.message : "Conversation setup failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const typedEpisodeId = asConvexId<"episodes">(episodeId);
  const typedPodcasterId = asConvexId<"podcasters">(podcasterId);
  const typedConversationId =
    normalizedConversationId === undefined
      ? undefined
      : asConvexId<"conversations">(normalizedConversationId);

  let activeConversationId: Id<"conversations">;
  try {
    const start = await convex.mutation(api.chat.startConversation, {
      userId,
      episodeId: typedEpisodeId,
      podcasterId: typedPodcasterId,
      timestamp: typedTimestamp,
      message: typedMessage,
      conversationId: typedConversationId,
    });
    activeConversationId = start.conversationId;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Conversation setup failed";
    const status = errorMessage.includes("not found") ? 400 : 403;
    return NextResponse.json({ error: errorMessage }, { status });
  }

  let llmMessages: Message[];
  let stream: AsyncGenerator<string, void, unknown>;
  try {
    const debugFullContext = process.env.CHAT_DEBUG_FULL_CONTEXT === "true";

    // Fetch transcript chunks up to the pause timestamp
    const chunks = await convex.query(api.transcriptChunks.getChunksUpToTimestamp, {
      episodeId: typedEpisodeId,
      timestamp: typedTimestamp,
    });

    console.log(`[Chat:API] Found ${chunks.length} transcript chunks up to ${typedTimestamp}s`);
    const fullTranscript = chunks.map((c) => c.text).join(" ");
    if (chunks.length > 0) {
      console.log(`[Chat:API] First chunk start: ${chunks[0].startTime}s, Last chunk end: ${chunks[chunks.length - 1].endTime}s`);
      console.log(`[Chat:API] Total transcript length: ${fullTranscript.length} characters`);

      const overlapsPausePoint = chunks.some(
        (chunk) => chunk.startTime <= typedTimestamp && chunk.endTime > typedTimestamp
      );
      if (overlapsPausePoint) {
        console.warn(
          "[Chat:API] At least one chunk overlaps the pause timestamp, so transcript context may include lines slightly ahead of the paused frame."
        );
      }

      if (debugFullContext) {
        console.log(
          "[Chat:API] Full transcript chunks:",
          JSON.stringify(
            chunks.map((chunk) => ({
              startTime: chunk.startTime,
              endTime: chunk.endTime,
              text: chunk.text,
            })),
            null,
            2
          )
        );
        console.log("[Chat:API] Full transcript content:", fullTranscript);
      }
    } else {
      console.warn(`[Chat:API] No transcript chunks found for episode ${typedEpisodeId} up to timestamp ${typedTimestamp}s`);
    }

    // Fetch episode for the title
    const episode = await convex.query(api.episodes.getEpisodeById, {
      episodeId: typedEpisodeId,
    });
    const videoTitle = episode?.title ?? "this video";

    const systemMessages: Message[] = [{
      role: "system",
      content: buildMvpSystemPrompt({
        videoTitle,
        currentTimestamp: typedTimestamp,
        chunks,
      }),
    }];

    const priorMessages = await convex.query(api.chat.listConversationMessages, {
      conversationId: activeConversationId,
    });

    llmMessages = [
      ...systemMessages,
      ...priorMessages,
    ];

    console.log(`[Chat:API] Sending ${llmMessages.length} messages to LLM provider`);
    if (debugFullContext) {
      console.log("[Chat:API] Full LLM message payload:", JSON.stringify(llmMessages, null, 2));
    }

    const llm = getLLMProvider();
    stream = llm.stream(llmMessages);

    const first = await stream.next();
    if (first.done) {
      await convex.mutation(api.chat.appendAssistantMessage, {
        conversationId: activeConversationId,
        content: "",
      });

      const emptyReadable = new ReadableStream({
        start(controller) {
          enqueueSseEvent(controller, {
            type: "conversation",
            conversationId: String(activeConversationId),
          });
          enqueueSseEvent(controller, { type: "done" });
          controller.close();
        },
      });
      return new Response(emptyReadable, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const firstToken = first.value;
    const convoId = activeConversationId;

    const readable = new ReadableStream({
      async start(controller) {
        let fullContent = "";

        try {
          enqueueSseEvent(controller, {
            type: "conversation",
            conversationId: String(convoId),
          });

          fullContent += firstToken;
          enqueueSseEvent(controller, { type: "token", content: firstToken });

          for await (const token of stream) {
            fullContent += token;
            enqueueSseEvent(controller, { type: "token", content: token });
          }

          if (debugFullContext) {
            console.log("[Chat:API] Full assistant response:", fullContent);
          }

          await convex.mutation(api.chat.appendAssistantMessage, {
            conversationId: convoId,
            content: fullContent,
          });

          enqueueSseEvent(controller, { type: "done" });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Streaming failed before the response could be saved.";
          enqueueSseEvent(controller, { type: "error", message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI service is currently unavailable.";
    return NextResponse.json(
      { error: message },
      { status: 503 }
    );
  }
}

function enqueueSseEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: ChatStreamEvent,
): void {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
}

