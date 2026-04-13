import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { chunkTranscript, extractYouTubeId } from "./transcript";

export const listEpisodes = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const episodes = await ctx.db
      .query("episodes")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    return Promise.all(
      episodes.map(async (episode) => {
        const podcaster = await ctx.db.get(episode.podcasterId);

        return {
          id: episode._id,
          title: episode.title,
          youtubeId: episode.youtubeId,
          thumbnailUrl: episode.thumbnailUrl,
          description: episode.description,
          podcaster: podcaster
            ? {
                id: podcaster._id,
                name: podcaster.name,
              }
            : {
                id: "",
                name: "Unknown podcaster",
              },
        };
      }),
    );
  },
});

export const getEpisodeDetailInternal = internalQuery({
  args: {
    episodeId: v.id("episodes"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const episode = await ctx.db.get(args.episodeId);
    if (!episode || episode.userId !== args.userId) {
      return null;
    }

    const podcaster = await ctx.db.get(episode.podcasterId);
    const transcriptChunks = await ctx.db
      .query("transcriptChunks")
      .withIndex("by_episode_start_time", (q) => q.eq("episodeId", episode._id))
      .collect();

    return {
      id: episode._id,
      podcasterId: episode.podcasterId,
      youtubeUrl: episode.youtubeUrl,
      youtubeId: episode.youtubeId,
      title: episode.title,
      description: episode.description,
      thumbnailUrl: episode.thumbnailUrl,
      publishedAt: episode.publishedAt,
      createdAt: episode.createdAt,
      updatedAt: episode.updatedAt,
      podcaster: podcaster
        ? {
            id: podcaster._id,
            name: podcaster.name,
            channelUrl: podcaster.channelUrl,
            description: podcaster.description,
          }
        : null,
      transcriptChunks: transcriptChunks.map((chunk) => ({
        id: chunk._id,
        text: chunk.text,
        startTime: chunk.startTime,
        endTime: chunk.endTime,
      })),
    };
  },
});

export const getEpisodeDetail: ReturnType<typeof query> = query({
  args: {
    episodeId: v.id("episodes"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.runQuery(internal.episodes.getEpisodeDetailInternal, args);
  },
});

const segmentValidator = v.object({
  text: v.string(),
  offset: v.number(),
  duration: v.number(),
});

export const ingestEpisode: ReturnType<typeof action> = action({
  args: {
    userId: v.string(),
    url: v.string(),
    segments: v.array(segmentValidator),
  },
  handler: async (ctx, args) => {
    const trimmedUrl = args.url.trim();
    const youtubeId = extractYouTubeId(trimmedUrl);

    if (!youtubeId) {
      throw new ConvexError(
        "Invalid YouTube URL. Supported formats: youtube.com/watch, youtu.be, youtube.com/embed, youtube.com/shorts",
      );
    }

    const existing = await ctx.runQuery(internal.episodes.getEpisodeByYoutubeId, {
      userId: args.userId,
      youtubeId,
    });

    if (existing) {
      throw new ConvexError(
        "Episode with this YouTube video has already been ingested",
      );
    }

    if (args.segments.length === 0) {
      throw new ConvexError("No transcript available for this video");
    }

    const chunks = chunkTranscript(args.segments);
    const channelUrl = `https://www.youtube.com/channel/placeholder-${youtubeId}`;

    const podcasterId = await ctx.runMutation(internal.episodes.upsertPodcaster, {
      channelUrl,
      name: `Podcaster (${youtubeId})`,
    });

    const episodeId = await ctx.runMutation(internal.episodes.createEpisodeWithChunks, {
      podcasterId,
      userId: args.userId,
      youtubeUrl: trimmedUrl,
      youtubeId,
      title: `Episode ${youtubeId}`,
      chunks,
    });

    // Schedule both as background jobs so ingest returns immediately.
    // Embeddings and profile will be ready shortly after.
    await ctx.scheduler.runAfter(0, internal.memory.reindexEpisodeChunksInternal, {
      episodeId,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.profiles.rebuildPodcasterProfileInternal,
      {
      podcasterId,
      },
    );

    const episode = await ctx.runQuery(internal.episodes.getEpisodeDetailInternal, {
      episodeId,
      userId: args.userId,
    });

    if (!episode) {
      throw new ConvexError("Failed to load ingested episode");
    }

    return episode;
  },
});

export const getEpisodeByYoutubeId = internalQuery({
  args: {
    userId: v.string(),
    youtubeId: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("episodes")
      .withIndex("by_user_youtube_id", (q) =>
        q.eq("userId", args.userId).eq("youtubeId", args.youtubeId),
      )
      .first();
  },
});

export const upsertPodcaster = internalMutation({
  args: {
    channelUrl: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("podcasters")
      .withIndex("by_channel_url", (q) => q.eq("channelUrl", args.channelUrl))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        updatedAt: now,
      });
      return existing._id;
    }

    return ctx.db.insert("podcasters", {
      name: args.name,
      channelUrl: args.channelUrl,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const createEpisodeWithChunks = internalMutation({
  args: {
    podcasterId: v.id("podcasters"),
    userId: v.string(),
    youtubeUrl: v.string(),
    youtubeId: v.string(),
    title: v.string(),
    chunks: v.array(
      v.object({
        text: v.string(),
        startTime: v.number(),
        endTime: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const episodeId = await ctx.db.insert("episodes", {
      userId: args.userId,
      podcasterId: args.podcasterId,
      youtubeUrl: args.youtubeUrl,
      youtubeId: args.youtubeId,
      title: args.title,
      createdAt: now,
      updatedAt: now,
    });

    for (const chunk of args.chunks) {
      await ctx.db.insert("transcriptChunks", {
        episodeId,
        podcasterId: args.podcasterId,
        text: chunk.text,
        startTime: chunk.startTime,
        endTime: chunk.endTime,
      });
    }

    return episodeId;
  },
});
