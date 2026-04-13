import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const EMBEDDING_DIMENSION = 1536;

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_clerk_user_id", ["clerkUserId"]),

  podcasters: defineTable({
    name: v.string(),
    channelUrl: v.string(),
    description: v.optional(v.string()),
    profileEmbeddingSummary: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_channel_url", ["channelUrl"]),

  episodes: defineTable({
    userId: v.optional(v.string()),
    podcasterId: v.id("podcasters"),
    youtubeUrl: v.string(),
    youtubeId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_youtube_id", ["userId", "youtubeId"])
    .index("by_youtube_id", ["youtubeId"])
    .index("by_podcaster", ["podcasterId"]),

  transcriptChunks: defineTable({
    episodeId: v.id("episodes"),
    podcasterId: v.id("podcasters"),
    text: v.string(),
    startTime: v.number(),
    endTime: v.number(),
    embedding: v.optional(v.array(v.float64())),
    embeddingSource: v.optional(v.string()),
  })
    .index("by_episode", ["episodeId"])
    .index("by_episode_start_time", ["episodeId", "startTime"])
    .index("by_podcaster", ["podcasterId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: EMBEDDING_DIMENSION,
      filterFields: ["podcasterId", "episodeId"],
    }),

  conversations: defineTable({
    userId: v.string(),
    podcasterId: v.id("podcasters"),
    episodeId: v.id("episodes"),
    timestampInEpisode: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_podcaster", ["userId", "podcasterId"])
    .index("by_episode", ["episodeId"]),

  conversationMessages: defineTable({
    conversationId: v.id("conversations"),
    role: v.string(),
    content: v.string(),
    createdAt: v.number(),
  }).index("by_conversation", ["conversationId"]),

  podcasterProfiles: defineTable({
    podcasterId: v.id("podcasters"),
    summaryText: v.string(),
    topics: v.array(v.string()),
    personalityTraits: v.array(v.string()),
    speakingStyle: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_podcaster", ["podcasterId"]),

  userPodcasterMemory: defineTable({
    userId: v.string(),
    podcasterId: v.id("podcasters"),
    summaryOfPastInteractions: v.string(),
    keyTopicsDiscussed: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_podcaster", ["userId", "podcasterId"])
    .index("by_user", ["userId"])
    .index("by_podcaster", ["podcasterId"]),
});
