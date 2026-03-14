import { NextResponse } from "next/server";
import { getConvexClient, api } from "@/lib/convex/client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
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
      episodeId: id,
    });

    if (!episode) {
      return NextResponse.json(
        { error: "Episode not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(episode, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Episode not found" },
      { status: 404 }
    );
  }
}
