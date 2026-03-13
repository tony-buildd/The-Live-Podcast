import { prisma } from "@/lib/db";
import { parseJsonArray } from "@/lib/json-array";
import { Message } from "@/lib/llm/types";
import { search as vectorSearch } from "@/lib/memory/vector-store";

interface ContextBuildParams {
  episodeId: string;
  podcasterId: string;
  userId: string;
  currentTimestamp: number;
  userMessage?: string;
}

export async function buildConversationContext(
  params: ContextBuildParams
): Promise<Message[]> {
  const { episodeId, podcasterId, userId, currentTimestamp, userMessage } =
    params;

  const [recentChunks, podcasterProfile, userMemory, podcaster] =
    await Promise.all([
      prisma.transcriptChunk.findMany({
        where: {
          episodeId,
          startTime: {
            lte: currentTimestamp,
            gte: Math.max(0, currentTimestamp - 300),
          },
        },
        orderBy: { startTime: "asc" },
      }),
      prisma.podcasterProfile.findFirst({
        where: { podcasterId },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.userPodcasterMemory.findUnique({
        where: { userId_podcasterId: { userId, podcasterId } },
      }),
      prisma.podcaster.findUnique({ where: { id: podcasterId } }),
    ]);

  const transcriptContext = recentChunks.map((c) => c.text).join(" ");

  // Semantic search for related content across all episodes
  let relatedContent: string[] = [];
  if (userMessage) {
    try {
      const semanticResults = await vectorSearch(userMessage, 3);
      // Filter out chunks already in the timestamp window to avoid duplication
      const recentChunkIds = new Set(recentChunks.map((c) => c.id));
      relatedContent = semanticResults
        .filter((r) => !recentChunkIds.has(r.id) && r.score > 0.3)
        .map((r) => r.text);
    } catch {
      // Silently ignore vector search failures – fall back to timestamp context
    }
  }

  let systemPrompt = `You are an AI representation of ${podcaster?.name || "the podcaster"}. `;
  systemPrompt += `You embody their personality, knowledge, and conversational style. `;
  systemPrompt += `When the listener pauses the podcast to ask you a question, respond as the podcaster would — with their tone, opinions, and expertise.\n\n`;

  if (podcasterProfile) {
    systemPrompt += `## Your Profile\n`;
    systemPrompt += `${podcasterProfile.summaryText}\n`;
    if (podcasterProfile.speakingStyle) {
      systemPrompt += `Speaking style: ${podcasterProfile.speakingStyle}\n`;
    }
    const topics = parseJsonArray(podcasterProfile.topics);
    if (topics.length > 0) {
      systemPrompt += `Topics you frequently discuss: ${topics.join(", ")}\n`;
    }
    systemPrompt += "\n";
  }

  if (userMemory) {
    systemPrompt += `## Your History with This Listener\n`;
    systemPrompt += `${userMemory.summaryOfPastInteractions}\n`;
    const keyTopics = parseJsonArray(userMemory.keyTopicsDiscussed);
    if (keyTopics.length > 0) {
      systemPrompt += `Topics you've discussed before: ${keyTopics.join(", ")}\n`;
    }
    systemPrompt += "\n";
  }

  systemPrompt += `## What You Were Just Talking About\n`;
  systemPrompt += `The listener paused at ${formatTimestamp(currentTimestamp)} in the episode. `;
  systemPrompt += `Here is the recent transcript context:\n\n`;
  systemPrompt += `"${transcriptContext}"\n\n`;
  if (relatedContent.length > 0) {
    systemPrompt += `## Related Content\n`;
    systemPrompt += `These excerpts from your episodes may also be relevant:\n\n`;
    for (const content of relatedContent) {
      systemPrompt += `- "${content}"\n`;
    }
    systemPrompt += "\n";
  }

  systemPrompt += `Answer the listener's question based on this context and your broader knowledge. `;
  systemPrompt += `Stay in character. Be conversational and helpful.`;

  return [{ role: "system", content: systemPrompt }];
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
