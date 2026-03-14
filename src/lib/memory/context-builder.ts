import { api, getConvexClient } from "@/lib/convex/client";
import type { Message } from "@/lib/llm/types";

export interface BuildConversationContextArgs {
  episodeId: string;
  podcasterId: string;
  userId: string;
  currentTimestamp: number;
  userMessage?: string;
}

interface ConversationContext {
  podcaster: { id: string; name: string } | null;
  podcasterProfile: {
    summaryText: string;
    topics: string[];
    personalityTraits: string[];
    speakingStyle?: string;
  } | null;
  userMemory: {
    summaryOfPastInteractions: string;
    keyTopicsDiscussed: string[];
  } | null;
  transcriptContext: string;
  relatedContent: string[];
  currentTimestampLabel: string;
}

export async function buildConversationContext(
  args: BuildConversationContextArgs,
): Promise<Message[]> {
  const convex = getConvexClient();
  const context = (await convex.action(
    api.memory.getConversationContext,
    args,
  )) as ConversationContext;

  return [
    {
      role: "system",
      content: buildSystemPrompt(context),
    },
  ];
}

function buildSystemPrompt(context: ConversationContext): string {
  let systemPrompt = `You are an AI representation of ${context.podcaster?.name || "the podcaster"}. `;
  systemPrompt += "You embody their personality, knowledge, and conversational style. ";
  systemPrompt += "When the listener pauses the podcast to ask a question, respond as the podcaster would.\n\n";

  if (context.podcasterProfile) {
    systemPrompt += "## Your Profile\n";
    systemPrompt += `${context.podcasterProfile.summaryText}\n`;
    if (context.podcasterProfile.speakingStyle) {
      systemPrompt += `Speaking style: ${context.podcasterProfile.speakingStyle}\n`;
    }
    if (context.podcasterProfile.topics.length > 0) {
      systemPrompt += `Topics you frequently discuss: ${context.podcasterProfile.topics.join(", ")}\n`;
    }
    systemPrompt += "\n";
  }

  if (context.userMemory) {
    systemPrompt += "## Your History with This Listener\n";
    systemPrompt += `${context.userMemory.summaryOfPastInteractions}\n`;
    if (context.userMemory.keyTopicsDiscussed.length > 0) {
      systemPrompt += `Topics discussed before: ${context.userMemory.keyTopicsDiscussed.join(", ")}\n`;
    }
    systemPrompt += "\n";
  }

  systemPrompt += "## What You Were Just Talking About\n";
  systemPrompt += `The listener paused at ${context.currentTimestampLabel}.\n`;
  systemPrompt += `Recent transcript context: \"${context.transcriptContext}\"\n\n`;

  if (context.relatedContent.length > 0) {
    systemPrompt += "## Related Content\n";
    for (const item of context.relatedContent) {
      systemPrompt += `- \"${item}\"\n`;
    }
    systemPrompt += "\n";
  }

  systemPrompt += "Answer based on this context. Stay in character. Be conversational and helpful.";
  return systemPrompt;
}
