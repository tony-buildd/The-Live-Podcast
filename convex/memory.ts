import { v } from "convex/values";
import { embed, embedBatch } from "./embeddings";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";

interface RecentChunk {
  id: Id<"transcriptChunks">;
  text: string;
  startTime: number;
  endTime: number;
}

interface ConversationContextData {
  recentChunks: RecentChunk[];
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
  podcaster: {
    id: string;
    name: string;
  } | null;
}

interface SemanticSearchResult {
  id: string;
  text: string;
  score: number;
}

export const getConversationContext = action({
  args: {
    episodeId: v.id("episodes"),
    podcasterId: v.id("podcasters"),
    userId: v.string(),
    currentTimestamp: v.number(),
    userMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const baseContext = (await ctx.runQuery(internal.memory.getBaseContextData, {
      episodeId: args.episodeId,
      podcasterId: args.podcasterId,
      userId: args.userId,
      currentTimestamp: args.currentTimestamp,
    })) as ConversationContextData;

    let relatedContent: string[] = [];
    const trimmedMessage = args.userMessage?.trim();
    if (trimmedMessage) {
      const embedding = await embed(trimmedMessage);
      const semanticResults = (await ctx.runQuery(
        internal.memory.semanticSearchByEmbedding,
        {
          embedding,
          podcasterId: args.podcasterId,
          currentEpisodeId: args.episodeId,
          currentTimestamp: args.currentTimestamp,
          excludeChunkIds: baseContext.recentChunks.map((chunk: RecentChunk) => chunk.id),
          topK: 8,
        },
      )) as SemanticSearchResult[];

      relatedContent = semanticResults
        .filter((result: SemanticSearchResult) => result.score > 0.3)
        .map((result: SemanticSearchResult) => result.text)
        .slice(0, 3);
    }

    return {
      podcaster: baseContext.podcaster,
      podcasterProfile: baseContext.podcasterProfile,
      userMemory: baseContext.userMemory,
      recentChunks: baseContext.recentChunks,
      transcriptContext: baseContext.recentChunks.map((chunk: RecentChunk) => chunk.text).join(" "),
      relatedContent,
      currentTimestampLabel: formatTimestamp(args.currentTimestamp),
    };
  },
});

export const reindexEpisodeChunks = action({
  args: {
    episodeId: v.id("episodes"),
  },
  handler: async (ctx, args) => {
    const chunks = (await ctx.runQuery(internal.memory.getEpisodeChunksForEmbedding, {
      episodeId: args.episodeId,
    })) as Array<{ id: Id<"transcriptChunks">; text: string }>;

    if (chunks.length === 0) {
      return { embedded: 0 };
    }

    const embeddings = await embedBatch(chunks.map((chunk) => chunk.text));
    await ctx.runMutation(internal.memory.setChunkEmbeddings, {
      updates: chunks.map((chunk, index) => ({
        chunkId: chunk.id,
        embedding: embeddings[index],
      })),
    });

    return { embedded: chunks.length };
  },
});

export const reindexEpisodeChunksInternal = internalAction({
  args: {
    episodeId: v.id("episodes"),
  },
  handler: async (ctx, args) => {
    const chunks = (await ctx.runQuery(internal.memory.getEpisodeChunksForEmbedding, {
      episodeId: args.episodeId,
    })) as Array<{ id: Id<"transcriptChunks">; text: string }>;

    if (chunks.length === 0) {
      return { embedded: 0 };
    }

    const embeddings = await embedBatch(chunks.map((chunk) => chunk.text));
    await ctx.runMutation(internal.memory.setChunkEmbeddings, {
      updates: chunks.map((chunk, index) => ({
        chunkId: chunk.id,
        embedding: embeddings[index],
      })),
    });

    return { embedded: chunks.length };
  },
});

export const getBaseContextData = internalQuery({
  args: {
    episodeId: v.id("episodes"),
    podcasterId: v.id("podcasters"),
    userId: v.string(),
    currentTimestamp: v.number(),
  },
  handler: async (ctx, args) => {
    const windowStart = Math.max(0, args.currentTimestamp - 300);
    const allEpisodeChunks = await ctx.db
      .query("transcriptChunks")
      .withIndex("by_episode_start_time", (q) => q.eq("episodeId", args.episodeId))
      .collect();

    const recentChunks = allEpisodeChunks
      .filter((chunk) => {
        return (
          chunk.startTime <= args.currentTimestamp && chunk.startTime >= windowStart
          && chunk.endTime <= args.currentTimestamp
        );
      })
      .map((chunk) => ({
        id: chunk._id,
        text: chunk.text,
        startTime: chunk.startTime,
        endTime: chunk.endTime,
      }));

    const podcasterProfile = await ctx.db
      .query("podcasterProfiles")
      .withIndex("by_podcaster", (q) => q.eq("podcasterId", args.podcasterId))
      .order("desc")
      .first();

    const userMemory = await ctx.db
      .query("userPodcasterMemory")
      .withIndex("by_user_podcaster", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("podcasterId"), args.podcasterId))
      .first();

    const podcaster = await ctx.db.get(args.podcasterId);

    return {
      recentChunks,
      podcasterProfile: podcasterProfile
        ? {
            summaryText: podcasterProfile.summaryText,
            topics: podcasterProfile.topics,
            personalityTraits: podcasterProfile.personalityTraits,
            speakingStyle: podcasterProfile.speakingStyle,
          }
        : null,
      userMemory: userMemory
        ? {
            summaryOfPastInteractions: userMemory.summaryOfPastInteractions,
            keyTopicsDiscussed: userMemory.keyTopicsDiscussed,
          }
        : null,
      podcaster: podcaster
        ? {
            id: podcaster._id,
            name: podcaster.name,
          }
        : null,
    };
  },
});

export const semanticSearchByEmbedding = internalQuery({
  args: {
    embedding: v.array(v.float64()),
    podcasterId: v.id("podcasters"),
    currentEpisodeId: v.id("episodes"),
    currentTimestamp: v.number(),
    excludeChunkIds: v.array(v.id("transcriptChunks")),
    topK: v.number(),
  },
  handler: async (ctx, args) => {
    // TODO: replace with Convex vector search once generated server types are available locally.
    const excluded = new Set(args.excludeChunkIds.map((id) => String(id)));
    const chunks = await ctx.db
      .query("transcriptChunks")
      .withIndex("by_podcaster", (q) => q.eq("podcasterId", args.podcasterId))
      .collect();

    const scored = chunks
      .filter((chunk) => !excluded.has(String(chunk._id)))
      .filter((chunk) => {
        if (chunk.episodeId !== args.currentEpisodeId) {
          return true;
        }

        return chunk.endTime <= args.currentTimestamp;
      })
      .map((chunk) => ({
        id: String(chunk._id),
        text: chunk.text,
        score: cosineSimilarity(args.embedding, chunk.embedding ?? []),
      }))
      .filter((item) => Number.isFinite(item.score))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(0, args.topK));

    return scored;
  },
});

export const getEpisodeChunksForEmbedding = internalQuery({
  args: {
    episodeId: v.id("episodes"),
  },
  handler: async (ctx, args) => {
    const chunks = await ctx.db
      .query("transcriptChunks")
      .withIndex("by_episode", (q) => q.eq("episodeId", args.episodeId))
      .collect();

    return chunks.map((chunk) => ({
      id: chunk._id,
      text: chunk.text,
    }));
  },
});

export const setChunkEmbeddings = internalMutation({
  args: {
    updates: v.array(
      v.object({
        chunkId: v.id("transcriptChunks"),
        embedding: v.array(v.float64()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const update of args.updates) {
      await ctx.db.patch(update.chunkId, {
        embedding: update.embedding,
        embeddingSource: process.env.OPENAI_EMBEDDINGS_API_KEY
          ? "openai"
          : "deterministic",
      });
    }
  },
});

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i += 1) {
    const av = a[i];
    const bv = b[i];
    dot += av * bv;
    magA += av * av;
    magB += bv * bv;
  }

  if (magA === 0 || magB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
