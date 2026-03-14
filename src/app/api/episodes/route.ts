import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getConvexClient, api } from "@/lib/convex/client";

interface PostRequestBody {
  url?: string;
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PostRequestBody;
  try {
    body = (await request.json()) as PostRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  // Validate body and url field
  if (!body || typeof body.url !== "string" || body.url.trim() === "") {
    return NextResponse.json(
      { error: "Missing or empty 'url' field" },
      { status: 400 }
    );
  }

  const url = body.url.trim();

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

  try {
    const episode = await convex.action(api.episodes.ingestEpisode, { url });
    return NextResponse.json(episode, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to ingest episode";

    if (message.includes("already been ingested")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (message.includes("Invalid YouTube URL")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (
      message.includes("No transcript") ||
      message.includes("Transcript") ||
      message.includes("captions")
    ) {
      return NextResponse.json({ error: message }, { status: 422 });
    }

    return NextResponse.json({ error: message }, { status: 503 });
  }
}

export async function GET(): Promise<Response> {
  const convex = getConvexClient();
  const episodes = await convex.query(api.episodes.listEpisodes, {});

  return NextResponse.json(episodes, { status: 200 });
}
