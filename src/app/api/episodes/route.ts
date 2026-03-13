import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  extractYouTubeId,
  fetchTranscript,
  chunkTranscript,
} from "@/lib/transcript/index";
import { buildPodcasterProfile } from "@/lib/memory/profile-builder";
import { addChunks } from "@/lib/memory/vector-store";

interface PostRequestBody {
  url?: string;
}

/**
 * POST /api/episodes
 *
 * Accept JSON body with 'url' field. Extract YouTube video ID,
 * validate URL, check for duplicates, fetch transcript, and create
 * Podcaster + Episode + TranscriptChunks in a Prisma transaction.
 */
export async function POST(request: Request): Promise<Response> {
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

  // Extract YouTube video ID
  const youtubeId = extractYouTubeId(url);
  if (!youtubeId) {
    return NextResponse.json(
      { error: "Invalid YouTube URL. Supported formats: youtube.com/watch, youtu.be, youtube.com/embed, youtube.com/shorts" },
      { status: 400 }
    );
  }

  // Check for duplicate
  const existing = await prisma.episode.findUnique({
    where: { youtubeId },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Episode with this YouTube video has already been ingested" },
      { status: 409 }
    );
  }

  // Fetch transcript
  let segments;
  try {
    segments = await fetchTranscript(youtubeId);
  } catch {
    return NextResponse.json(
      { error: "Could not fetch transcript. The video may not have captions available." },
      { status: 422 }
    );
  }

  if (!segments || segments.length === 0) {
    return NextResponse.json(
      { error: "No transcript available for this video" },
      { status: 422 }
    );
  }

  // Chunk transcript
  const chunks = chunkTranscript(segments);

  // Derive a placeholder channel URL from the video ID
  // (youtube-transcript doesn't provide channel info)
  const channelUrl = `https://www.youtube.com/channel/placeholder-${youtubeId}`;

  // Create Podcaster (upsert), Episode, and TranscriptChunks in a transaction
  const episode = await prisma.$transaction(async (tx) => {
    // Upsert podcaster by channelUrl
    const podcaster = await tx.podcaster.upsert({
      where: { channelUrl },
      create: {
        name: `Podcaster (${youtubeId})`,
        channelUrl,
      },
      update: {},
    });

    // Create episode
    const newEpisode = await tx.episode.create({
      data: {
        podcasterId: podcaster.id,
        youtubeUrl: url,
        youtubeId,
        title: `Episode ${youtubeId}`,
      },
    });

    // Create transcript chunks
    if (chunks.length > 0) {
      await tx.transcriptChunk.createMany({
        data: chunks.map((chunk) => ({
          episodeId: newEpisode.id,
          text: chunk.text,
          startTime: chunk.startTime,
          endTime: chunk.endTime,
        })),
      });
    }

    // Return episode with relations
    return tx.episode.findUniqueOrThrow({
      where: { id: newEpisode.id },
      include: {
        podcaster: true,
        transcriptChunks: {
          orderBy: { startTime: "asc" },
        },
      },
    });
  });

  // Optionally trigger profile building async (fire-and-forget)
  buildPodcasterProfile(episode.podcasterId).catch(() => {
    // Silently ignore profile building failures
  });

  // Embed transcript chunks in the vector store (fire-and-forget)
  const chunkItems = episode.transcriptChunks.map((chunk) => ({
    id: chunk.id,
    text: chunk.text,
    metadata: {
      episodeId: episode.id,
      podcasterId: episode.podcasterId,
      startTime: chunk.startTime,
      endTime: chunk.endTime,
    },
  }));
  addChunks(chunkItems)
    .then(async () => {
      // Set embeddingId on each chunk after successful embedding
      await Promise.all(
        episode.transcriptChunks.map((chunk) =>
          prisma.transcriptChunk.update({
            where: { id: chunk.id },
            data: { embeddingId: chunk.id },
          }),
        ),
      );
    })
    .catch(() => {
      // Silently ignore embedding failures
    });

  return NextResponse.json(episode, { status: 201 });
}

/**
 * GET /api/episodes
 *
 * Return all episodes with podcaster info, ordered by createdAt desc.
 */
export async function GET(): Promise<Response> {
  const episodes = await prisma.episode.findMany({
    include: {
      podcaster: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(episodes, { status: 200 });
}
