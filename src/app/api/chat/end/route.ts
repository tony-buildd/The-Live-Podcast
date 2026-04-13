import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getConvexClient,
  api,
  isConvexConfigurationError,
} from "@/lib/convex/client";
import { asConvexId } from "@/lib/convex/ids";

interface ChatEndRequestBody {
  conversationId?: string;
  podcasterId?: string;
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const { conversationId, podcasterId } = body;

  const missingFields: string[] = [];
  if (!conversationId) missingFields.push("conversationId");
  if (!podcasterId) missingFields.push("podcasterId");

  if (missingFields.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missingFields.join(", ")}` },
      { status: 400 }
    );
  }

  if (typeof conversationId !== "string" || typeof podcasterId !== "string") {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  try {
    const convex = getConvexClient();
    const result = await convex.action(api.chat.endConversation, {
      conversationId: asConvexId<"conversations">(conversationId),
      userId,
      podcasterId: asConvexId<"podcasters">(podcasterId),
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (isConvexConfigurationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    const message =
      error instanceof Error ? error.message : "Failed to end conversation";
    const status = message.includes("not found") ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}
