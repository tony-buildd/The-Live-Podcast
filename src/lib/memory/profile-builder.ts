import { api, getConvexClient } from "@/lib/convex/client";
import { asConvexId } from "@/lib/convex/ids";

export async function buildPodcasterProfile(podcasterId: string): Promise<void> {
  const convex = getConvexClient();
  await convex.action(api.profiles.rebuildPodcasterProfile, {
    podcasterId: asConvexId<"podcasters">(podcasterId),
  });
}

export async function updateUserPodcasterMemory(
  userId: string,
  podcasterId: string,
  conversationId: string,
): Promise<void> {
  const convex = getConvexClient();
  await convex.action(api.chat.endConversation, {
    userId,
    podcasterId: asConvexId<"podcasters">(podcasterId),
    conversationId: asConvexId<"conversations">(conversationId),
  });
}
