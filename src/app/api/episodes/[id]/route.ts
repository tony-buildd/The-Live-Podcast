import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getConvexClient,
  api,
  isConvexConfigurationError,
} from "@/lib/convex/client";
import { asConvexId } from "@/lib/convex/ids";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (!id || id.trim() === "") {
    return NextResponse.json(
      { error: "Episode not found" },
      { status: 404 }
    );
  }

  try {
    const convex = getConvexClient();
    const episode = await convex.query(api.episodes.getEpisodeDetail, {
      episodeId: asConvexId<"episodes">(id),
      userId,
    });

    if (!episode) {
      return NextResponse.json(
        { error: "Episode not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(episode, { status: 200 });
  } catch (error) {
    if (isConvexConfigurationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    return NextResponse.json(
      { error: "Episode not found" },
      { status: 404 }
    );
  }
}
