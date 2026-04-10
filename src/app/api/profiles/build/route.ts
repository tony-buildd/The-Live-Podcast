import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getConvexClient,
  api,
  isConvexConfigurationError,
} from "@/lib/convex/client";

interface BuildRequestBody {
  podcasterId?: string;
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const { podcasterId } = body;
  if (!podcasterId || typeof podcasterId !== "string" || podcasterId.trim() === "") {
    return NextResponse.json(
      { error: "Missing or empty 'podcasterId' field" },
      { status: 400 }
    );
  }

  try {
    const convex = getConvexClient();
    const podcaster = await convex.query(api.profiles.getPodcasterById, {
      podcasterId,
    });

    if (!podcaster) {
      return NextResponse.json(
        { error: "Podcaster not found" },
        { status: 404 }
      );
    }

    const result = await convex.action(api.profiles.rebuildPodcasterProfile, {
      podcasterId,
    });

    if (!result.profile) {
      return NextResponse.json(
        { profile: null, message: "No profile data available (no episodes found)" },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        } catch (error) {
          if (isConvexConfigurationError(error)) {
            return NextResponse.json({ error: error.message }, { status: 503 });
          }

          return NextResponse.json(
            { error: "AI service is currently unavailable. Could not build profile." },
            { status: 503 }
          );
        profile: {
          podcasterId,
          summaryText: result.profile.summaryText,
          topics: result.profile.topics,
          personalityTraits: result.profile.personalityTraits,
          speakingStyle: result.profile.speakingStyle,
        },
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { error: "AI service is currently unavailable. Could not build profile." },
      { status: 503 }
    );
  }
}
