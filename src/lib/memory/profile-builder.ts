import { api, getConvexClient } from "@/lib/convex/client";

export async function buildPodcasterProfile(podcasterId: string): Promise<void> {
  const convex = getConvexClient();
  await convex.action(api.profiles.rebuildPodcasterProfile, { podcasterId });
}

export async function updateUserPodcasterMemory(
  userId: string,
  podcasterId: string,
  conversationId: string,
): Promise<void> {
  const convex = getConvexClient();
  await convex.action(api.chat.endConversation, {
    userId,
    podcasterId,
    conversationId,
  });
}
