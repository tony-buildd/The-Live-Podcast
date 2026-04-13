import { v } from "convex/values";
import { query } from "./_generated/server";

export const getChunksUpToTimestamp = query({
  args: {
    episodeId: v.id("episodes"),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    const chunks = await ctx.db
      .query("transcriptChunks")
      .withIndex("by_episode_start_time", (q) =>
        q.eq("episodeId", args.episodeId)
      )
      .collect();

    return chunks
      .filter((chunk) => chunk.startTime <= args.timestamp)
      .map((chunk) => ({
        text: chunk.text,
        startTime: chunk.startTime,
        endTime: chunk.endTime,
      }));
  },
});
