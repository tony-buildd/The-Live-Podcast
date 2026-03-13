import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateUserPodcasterMemory } from "@/lib/memory/profile-builder";

interface ChatEndRequestBody {
  conversationId?: string;
  userId?: string;
  podcasterId?: string;
}

/**
 * POST /api/chat/end
 *
 * End a conversation and persist user-podcaster memory.
 * Accepts conversationId, userId, podcasterId.
 * If the conversation has zero messages, this is a no-op.
 */
export async function POST(request: Request): Promise<Response> {
  // Parse request body
  let body: ChatEndRequestBody;
  try {
    body = (await request.json()) as ChatEndRequestBody;
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
  const { conversationId, userId, podcasterId } = body;

  const missingFields: string[] = [];
  if (!conversationId) missingFields.push("conversationId");
  if (!userId) missingFields.push("userId");
  if (!podcasterId) missingFields.push("podcasterId");

  if (missingFields.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missingFields.join(", ")}` },
      { status: 400 }
    );
  }

  // Check if conversation has any messages
  const messageCount = await prisma.conversationMessage.count({
    where: { conversationId: conversationId! },
  });

  // If zero messages, no-op — just return 200
  if (messageCount === 0) {
    return NextResponse.json(
      { message: "No messages in conversation, nothing to persist" },
      { status: 200 }
    );
  }

  // Call updateUserPodcasterMemory
  await updateUserPodcasterMemory(userId!, podcasterId!, conversationId!);

  return NextResponse.json(
    { message: "Memory updated successfully" },
    { status: 200 }
  );
}
