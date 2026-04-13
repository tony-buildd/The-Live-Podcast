import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";

export const startConversation = mutation({
  args: {
    userId: v.string(),
    episodeId: v.id("episodes"),
    podcasterId: v.id("podcasters"),
    timestamp: v.number(),
    message: v.string(),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args) => {
    const trimmedMessage = args.message.trim();
    if (!trimmedMessage) {
      throw new ConvexError("Message cannot be empty or whitespace-only");
    }

    const episode = await ctx.db.get(args.episodeId);
    if (!episode) {
      throw new ConvexError("Episode not found");
    }

    const podcaster = await ctx.db.get(args.podcasterId);
    if (!podcaster) {
      throw new ConvexError("Podcaster not found");
    }
    if (episode.podcasterId !== args.podcasterId) {
      throw new ConvexError("Episode does not belong to the specified podcaster");
    }

    let activeConversationId = args.conversationId;

    if (activeConversationId) {
      const existing = await ctx.db.get(activeConversationId);
      if (!existing) {
        throw new ConvexError("Conversation not found");
      }
      if (existing.userId !== args.userId) {
        throw new ConvexError("Conversation does not belong to authenticated user");
      }
    } else {
      const now = Date.now();
      activeConversationId = await ctx.db.insert("conversations", {
        userId: args.userId,
        podcasterId: args.podcasterId,
        episodeId: args.episodeId,
        timestampInEpisode: args.timestamp,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.insert("conversationMessages", {
      conversationId: activeConversationId,
      role: "user",
      content: trimmedMessage,
      createdAt: Date.now(),
    });

    return { conversationId: activeConversationId };
  },
});

export const listConversationMessages = query({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("conversationMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .collect();

    return messages.map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content,
    }));
  },
});

export const appendAssistantMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new ConvexError("Conversation not found");
    }

    return ctx.db.insert("conversationMessages", {
      conversationId: args.conversationId,
      role: "assistant",
      content: args.content,
      createdAt: Date.now(),
    });
  },
});

export const endConversation = action({
  args: {
    conversationId: v.id("conversations"),
    userId: v.string(),
    podcasterId: v.id("podcasters"),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.runQuery(internal.chat.getConversationById, {
      conversationId: args.conversationId,
    });

    if (!conversation) {
      throw new ConvexError("Conversation not found");
    }

    if (conversation.userId !== args.userId) {
      throw new ConvexError("Conversation does not belong to authenticated user");
    }

    if (conversation.podcasterId !== args.podcasterId) {
      throw new ConvexError("Conversation podcaster mismatch");
    }

    const messageCount = await ctx.runQuery(internal.chat.getConversationMessageCount, {
      conversationId: args.conversationId,
    });

    if (messageCount === 0) {
      return { message: "No messages in conversation, nothing to persist" };
    }

    await ctx.runAction(internal.profiles.updateUserPodcasterMemoryFromConversation, {
      userId: args.userId,
      podcasterId: args.podcasterId,
      conversationId: args.conversationId,
    });

    return { message: "Memory updated successfully" };
  },
});

export const getConversationById = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      return null;
    }

    return {
      id: conversation._id,
      userId: conversation.userId,
      podcasterId: conversation.podcasterId,
      episodeId: conversation.episodeId,
    };
  },
});

export const getConversationMessageCount = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("conversationMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .collect();

    return messages.length;
  },
});
