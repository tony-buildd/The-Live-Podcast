import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getLLMProvider } from "@/lib/llm";
import { buildConversationContext } from "@/lib/memory/context-builder";
import type { Message } from "@/lib/llm/types";

interface ChatRequestBody {
  episodeId?: string;
  podcasterId?: string;
  userId?: string;
  timestamp?: number;
  message?: string;
  conversationId?: string;
}

/**
 * POST /api/chat
 *
 * Core chat endpoint. Accepts JSON body with episodeId, podcasterId, userId,
 * timestamp, message, and optional conversationId. Streams LLM response as SSE.
 */
export async function POST(request: Request): Promise<Response> {
  // Parse request body
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

  // Validate required fields
  const { episodeId, podcasterId, userId, timestamp, message, conversationId } = body;

  const missingFields: string[] = [];
  if (!episodeId) missingFields.push("episodeId");
  if (!podcasterId) missingFields.push("podcasterId");
  if (!userId) missingFields.push("userId");
  if (timestamp === undefined || timestamp === null) missingFields.push("timestamp");
  if (message === undefined || message === null) missingFields.push("message");

  if (missingFields.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missingFields.join(", ")}` },
      { status: 400 }
    );
  }

  // Validate message is not empty/whitespace
  if (typeof message !== "string" || message.trim() === "") {
    return NextResponse.json(
      { error: "Message cannot be empty or whitespace-only" },
      { status: 400 }
    );
  }

  // If conversationId provided, verify it exists
  let activeConversationId = conversationId;
  if (conversationId) {
    const existingConversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!existingConversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 400 }
      );
    }
  }

  // If no conversationId, create a new Conversation
  if (!activeConversationId) {
    const newConversation = await prisma.conversation.create({
      data: {
        userId: userId!,
        podcasterId: podcasterId!,
        episodeId: episodeId!,
        timestampInEpisode: timestamp!,
      },
    });
    activeConversationId = newConversation.id;
  }

  // Save user message BEFORE streaming
  await prisma.conversationMessage.create({
    data: {
      conversationId: activeConversationId,
      role: "user",
      content: message!.trim(),
    },
  });

  // Build conversation context (system prompt)
  const systemMessages = await buildConversationContext({
    episodeId: episodeId!,
    podcasterId: podcasterId!,
    userId: userId!,
    currentTimestamp: timestamp!,
  });

  // Fetch prior messages for multi-turn history
  const priorMessages = await prisma.conversationMessage.findMany({
    where: { conversationId: activeConversationId },
    orderBy: { createdAt: "asc" },
  });

  // Build full message array: system prompt + prior messages
  const llmMessages: Message[] = [
    ...systemMessages,
    ...priorMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  // Try to stream from LLM
  const llm = getLLMProvider();
  let stream: AsyncGenerator<string, void, unknown>;
  try {
    stream = llm.stream(llmMessages);
    // Try to get the first token to detect connection errors early
    const first = await stream.next();
    if (first.done) {
      // Empty response from LLM — save empty assistant message and return
      await prisma.conversationMessage.create({
        data: {
          conversationId: activeConversationId,
          role: "assistant",
          content: "",
        },
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

    // We got a first token; now set up the full SSE stream
    const firstToken = first.value;
    const convoId = activeConversationId;

    const readable = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let fullContent = "";

        try {
          // Send metadata event with conversationId
          controller.enqueue(
            encoder.encode(`data: {"conversationId":"${convoId}"}\n\n`)
          );

          // Send first token
          fullContent += firstToken;
          controller.enqueue(encoder.encode(`data: ${firstToken}\n\n`));

          // Stream remaining tokens
          for await (const token of stream) {
            fullContent += token;
            controller.enqueue(encoder.encode(`data: ${token}\n\n`));
          }

          // Send done event
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));

          // Save assistant message with full content
          await prisma.conversationMessage.create({
            data: {
              conversationId: convoId,
              role: "assistant",
              content: fullContent,
            },
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
