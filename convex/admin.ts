import { mutation } from "./_generated/server";

export const resetAllData = mutation({
  args: {},
  handler: async (ctx) => {
    const tableOrder = [
      "conversationMessages",
      "conversations",
      "transcriptChunks",
      "episodes",
      "podcasterProfiles",
      "userPodcasterMemory",
      "podcasters",
      "users",
    ] as const;

    for (const table of tableOrder) {
      const documents = await ctx.db.query(table).collect();
      for (const document of documents) {
        await ctx.db.delete(document._id);
      }
    }

    return { ok: true };
  },
});
