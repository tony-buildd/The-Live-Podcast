import { prisma } from "@/lib/db";
import { getLLMProvider } from "@/lib/llm";
import { parseJsonArray, stringifyJsonArray } from "@/lib/json-array";

export async function buildPodcasterProfile(podcasterId: string): Promise<void> {
  const episodes = await prisma.episode.findMany({
    where: { podcasterId },
    include: {
      transcriptChunks: {
        orderBy: { startTime: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (episodes.length === 0) return;

  const transcriptSamples = episodes
    .map((ep) => {
      const chunks = ep.transcriptChunks.slice(0, 5);
      return `Episode: "${ep.title}"\n${chunks.map((c) => c.text).join(" ")}`;
    })
    .join("\n\n---\n\n");

  const llm = getLLMProvider();
  const response = await llm.chat([
    {
      role: "system",
      content:
        "You analyze podcast transcripts to build a personality profile of the podcaster. " +
        "Extract their speaking style, key opinions, recurring topics, and personality traits. " +
        "Respond in a structured format.",
    },
    {
      role: "user",
      content:
        `Analyze these transcript samples and create a profile:\n\n${transcriptSamples}\n\n` +
        `Respond with:\n` +
        `SUMMARY: (2-3 paragraph description of who they are and how they communicate)\n` +
        `SPEAKING_STYLE: (one sentence)\n` +
        `TOPICS: (comma-separated list)\n` +
        `PERSONALITY_TRAITS: (comma-separated list)`,
    },
  ]);

  const summary = extractSection(response, "SUMMARY");
  const style = extractSection(response, "SPEAKING_STYLE");
  const topics = extractSection(response, "TOPICS")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const traits = extractSection(response, "PERSONALITY_TRAITS")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  await prisma.podcasterProfile.upsert({
    where: { id: `${podcasterId}-latest` },
    create: {
      id: `${podcasterId}-latest`,
      podcasterId,
      summaryText: summary || response,
      topics: stringifyJsonArray(topics),
      personalityTraits: stringifyJsonArray(traits),
      speakingStyle: style || null,
    },
    update: {
      summaryText: summary || response,
      topics: stringifyJsonArray(topics),
      personalityTraits: stringifyJsonArray(traits),
      speakingStyle: style || null,
    },
  });
}

function extractSection(text: string, section: string): string {
  const regex = new RegExp(`${section}:\\s*(.+?)(?=\\n[A-Z_]+:|$)`, "s");
  const match = text.match(regex);
  return match ? match[1].trim() : "";
}

export async function updateUserPodcasterMemory(
  userId: string,
  podcasterId: string,
  conversationId: string
): Promise<void> {
  const messages = await prisma.conversationMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });

  if (messages.length === 0) return;

  const conversationText = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const llm = getLLMProvider();
  const summary = await llm.chat([
    {
      role: "system",
      content:
        "Summarize this conversation between a listener and a podcaster AI. " +
        "Focus on: key topics discussed, questions asked, insights shared, and any personal details the listener revealed. " +
        "Keep it concise (2-3 sentences).",
    },
    { role: "user", content: conversationText },
  ]);

  const topicsResponse = await llm.chat([
    {
      role: "system",
      content: "Extract key topics from this conversation as a comma-separated list.",
    },
    { role: "user", content: conversationText },
  ]);

  const newTopics = topicsResponse
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const existing = await prisma.userPodcasterMemory.findUnique({
    where: { userId_podcasterId: { userId, podcasterId } },
  });

  if (existing) {
    const existingTopics = parseJsonArray(existing.keyTopicsDiscussed);
    const mergedTopics = [...new Set([...existingTopics, ...newTopics])];
    await prisma.userPodcasterMemory.update({
      where: { userId_podcasterId: { userId, podcasterId } },
      data: {
        summaryOfPastInteractions: `${existing.summaryOfPastInteractions}\n\n${summary}`,
        keyTopicsDiscussed: stringifyJsonArray(mergedTopics),
      },
    });
  } else {
    await prisma.userPodcasterMemory.create({
      data: {
        userId,
        podcasterId,
        summaryOfPastInteractions: summary,
        keyTopicsDiscussed: stringifyJsonArray(newTopics),
      },
    });
  }
}
