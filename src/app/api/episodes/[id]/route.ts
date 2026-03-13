import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/episodes/[id]
 *
 * Return single episode with podcaster and transcriptChunks (ordered by startTime asc).
 * Return 404 for invalid or non-existent ID.
 */
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

  const episode = await prisma.episode.findUnique({
    where: { id },
    include: {
      podcaster: true,
      transcriptChunks: {
        orderBy: { startTime: "asc" },
      },
    },
  });

  if (!episode) {
    return NextResponse.json(
      { error: "Episode not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(episode, { status: 200 });
}
