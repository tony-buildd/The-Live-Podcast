import { prisma } from "@/lib/db";
import { parseJsonArray } from "@/lib/json-array";
import { Message } from "@/lib/llm/types";

interface ContextBuildParams {
  episodeId: string;
  podcasterId: string;
  userId: string;
  currentTimestamp: number;
}

export async function buildConversationContext(
  params: ContextBuildParams
): Promise<Message[]> {
  const { episodeId, podcasterId, userId, currentTimestamp } = params;

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
  systemPrompt += `Answer the listener's question based on this context and your broader knowledge. `;
  systemPrompt += `Stay in character. Be conversational and helpful.`;

  return [{ role: "system", content: systemPrompt }];
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
