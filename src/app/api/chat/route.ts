import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getLLMProvider } from "@/lib/llm";
import type { Message } from "@/lib/llm/types";
import { getConvexClient, api } from "@/lib/convex/client";

interface ChatRequestBody {
  episodeId?: string;
  podcasterId?: string;
  timestamp?: number;
  message?: string;
  conversationId?: string;
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const convex = getConvexClient();
  const clerkUser = await currentUser();
  await convex
    .mutation(api.users.ensureUser, {
      clerkUserId: userId,
      email: clerkUser?.emailAddresses[0]?.emailAddress,
      name: clerkUser?.fullName ?? undefined,
      imageUrl: clerkUser?.imageUrl,
    })
    .catch(() => undefined);

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

  let activeConversationId: string;
  try {
    const start = await convex.mutation(api.chat.startConversation, {
      userId,
      episodeId,
      podcasterId,
      timestamp,
      message,
      conversationId,
    });
    activeConversationId = String(start.conversationId);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Conversation setup failed";
    const status = errorMessage.includes("not found") ? 400 : 403;
    return NextResponse.json({ error: errorMessage }, { status });
  }

  const context = await convex.action(api.memory.getConversationContext, {
    episodeId,
    podcasterId,
    userId,
    currentTimestamp: timestamp,
    userMessage: message,
  });

  const systemMessages: Message[] = [{
    role: "system",
    content: buildSystemPrompt(context),
  }];

  const priorMessages = await convex.query(api.chat.listConversationMessages, {
    conversationId: activeConversationId,
  });

  const llmMessages: Message[] = [
    ...systemMessages,
    ...priorMessages,
  ];

  const llm = getLLMProvider();
  let stream: AsyncGenerator<string, void, unknown>;
  try {
    stream = llm.stream(llmMessages);

    const first = await stream.next();
    if (first.done) {
      await convex.mutation(api.chat.appendAssistantMessage, {
        conversationId: activeConversationId,
        content: "",
      });

      const emptyReadable = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(`data: {"conversationId":"${activeConversationId}"}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
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
        const encoder = new TextEncoder();
        let fullContent = "";

        try {
          controller.enqueue(
            encoder.encode(`data: {"conversationId":"${convoId}"}\n\n`)
          );

          fullContent += firstToken;
          controller.enqueue(encoder.encode(`data: ${firstToken}\n\n`));

          for await (const token of stream) {
            fullContent += token;
            controller.enqueue(encoder.encode(`data: ${token}\n\n`));
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));

          await convex.mutation(api.chat.appendAssistantMessage, {
            conversationId: convoId,
            content: fullContent,
          });
        } catch {
          controller.enqueue(encoder.encode("data: [ERROR]\n\n"));
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
  } catch {
    return NextResponse.json(
      { error: "AI service is currently unavailable. Please try again later." },
      { status: 503 }
    );
  }
}

function buildSystemPrompt(context: {
  podcaster: { id: string; name: string } | null;
  podcasterProfile: {
    summaryText: string;
    topics: string[];
    personalityTraits: string[];
    speakingStyle?: string;
  } | null;
  userMemory: {
    summaryOfPastInteractions: string;
    keyTopicsDiscussed: string[];
  } | null;
  transcriptContext: string;
  relatedContent: string[];
  currentTimestampLabel: string;
}): string {
  let systemPrompt = `You are an AI representation of ${context.podcaster?.name || "the podcaster"}. `;
  systemPrompt += "You embody their personality, knowledge, and conversational style. ";
  systemPrompt += "When the listener pauses the podcast to ask a question, respond as the podcaster would.\n\n";

  if (context.podcasterProfile) {
    systemPrompt += "## Your Profile\n";
    systemPrompt += `${context.podcasterProfile.summaryText}\n`;
    if (context.podcasterProfile.speakingStyle) {
      systemPrompt += `Speaking style: ${context.podcasterProfile.speakingStyle}\n`;
    }
    if (context.podcasterProfile.topics.length > 0) {
      systemPrompt += `Topics you frequently discuss: ${context.podcasterProfile.topics.join(", ")}\n`;
    }
    systemPrompt += "\n";
  }

  if (context.userMemory) {
    systemPrompt += "## Your History with This Listener\n";
    systemPrompt += `${context.userMemory.summaryOfPastInteractions}\n`;
    if (context.userMemory.keyTopicsDiscussed.length > 0) {
      systemPrompt += `Topics discussed before: ${context.userMemory.keyTopicsDiscussed.join(", ")}\n`;
    }
    systemPrompt += "\n";
  }

  systemPrompt += "## What You Were Just Talking About\n";
  systemPrompt += `The listener paused at ${context.currentTimestampLabel}.\n`;
  systemPrompt += `Recent transcript context: "${context.transcriptContext}"\n\n`;

  if (context.relatedContent.length > 0) {
    systemPrompt += "## Related Content\n";
    for (const item of context.relatedContent) {
      systemPrompt += `- "${item}"\n`;
    }
    systemPrompt += "\n";
  }

  systemPrompt += "Answer based on this context. Stay in character. Be conversational and helpful.";
  return systemPrompt;
}
