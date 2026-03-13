import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildPodcasterProfile } from "@/lib/memory/profile-builder";
import { parseJsonArray } from "@/lib/json-array";

interface BuildRequestBody {
  podcasterId?: string;
}

/**
 * POST /api/profiles/build
 *
 * Accept JSON body with podcasterId. Call buildPodcasterProfile() to build
 * or update the podcaster's profile using LLM analysis of transcript data.
 * Returns 200 with profile data on success, 404 if podcaster not found,
 * 503 if LLM is unreachable.
 */
export async function POST(request: Request): Promise<Response> {
  // Parse request body
  let body: BuildRequestBody;
  try {
    body = (await request.json()) as BuildRequestBody;
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

  // Validate podcasterId
  const { podcasterId } = body;
  if (!podcasterId || typeof podcasterId !== "string" || podcasterId.trim() === "") {
    return NextResponse.json(
      { error: "Missing or empty 'podcasterId' field" },
      { status: 400 }
    );
  }

  // Check if podcaster exists
  const podcaster = await prisma.podcaster.findUnique({
    where: { id: podcasterId },
  });

  if (!podcaster) {
    return NextResponse.json(
      { error: "Podcaster not found" },
      { status: 404 }
    );
  }

  // Build the profile
  try {
    await buildPodcasterProfile(podcasterId);
  } catch {
    return NextResponse.json(
      { error: "AI service is currently unavailable. Could not build profile." },
      { status: 503 }
    );
  }

  // Fetch the created/updated profile
  const profile = await prisma.podcasterProfile.findFirst({
    where: { podcasterId },
    orderBy: { updatedAt: "desc" },
  });

  if (!profile) {
    // Profile building succeeded but no profile was created (e.g., no episodes)
    return NextResponse.json(
      { profile: null, message: "No profile data available (no episodes found)" },
      { status: 200 }
    );
  }

  // Return profile with parsed JSON array fields
  return NextResponse.json(
    {
      profile: {
        id: profile.id,
        podcasterId: profile.podcasterId,
        summaryText: profile.summaryText,
        topics: parseJsonArray(profile.topics),
        personalityTraits: parseJsonArray(profile.personalityTraits),
        speakingStyle: profile.speakingStyle,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      },
    },
    { status: 200 }
  );
}
