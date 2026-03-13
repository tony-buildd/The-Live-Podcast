"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import YouTubePlayer, {
  type YouTubePlayerHandle,
} from "@/components/YouTubePlayer";
import ChatPanel from "@/components/ChatPanel";

interface Episode {
  id: string;
  title: string;
  youtubeId: string;
  thumbnailUrl?: string | null;
  description?: string | null;
  podcaster: {
    id: string;
    name: string;
  };
}

export default function WatchPage() {
  const params = useParams<{ id: string }>();
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chatActive, setChatActive] = useState(false);
  const [chatTimestamp, setChatTimestamp] = useState(0);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const playerRef = useRef<YouTubePlayerHandle>(null);

  useEffect(() => {
    if (!params.id) {
      setError(true);
      setLoading(false);
      return;
    }

    async function fetchEpisode() {
      try {
        const res = await fetch(`/api/episodes/${params.id}`);
        if (!res.ok) {
          setError(true);
          setLoading(false);
          return;
        }
        const data = (await res.json()) as Episode;
        setEpisode(data);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    void fetchEpisode();
  }, [params.id]);

  const handleJumpIn = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.pause();
      setChatTimestamp(playerRef.current.getCurrentTime());
    }
    setChatActive(true);
  }, []);

  const handleResume = useCallback(async () => {
    // End the conversation if we have one
    if (conversationId && episode) {
      try {
        await fetch("/api/chat/end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId,
            userId: "default-user",
            podcasterId: episode.podcaster.id,
          }),
        });
      } catch {
        // Silently continue — don't block resume on network error
      }
    }

    setChatActive(false);
    setConversationId(null);
    playerRef.current?.play();
  }, [conversationId, episode]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" role="status" aria-label="Loading" />
      </div>
    );
  }

  if (error || !episode) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-32 text-center sm:px-6">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Episode not found
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          The episode you&apos;re looking for doesn&apos;t exist or has been
          removed.
        </p>
        <Link
          href="/library"
          className="mt-6 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300 dark:focus-visible:outline-zinc-50"
        >
          Back to Library
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-white dark:bg-zinc-950">
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Episode title */}
        <h1 className="mb-4 text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-xl">
          {episode.title}
        </h1>
        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          {episode.podcaster.name}
        </p>

        {/* Layout: side-by-side on desktop, stacked on mobile */}
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Player column */}
          <div className={chatActive ? "w-full lg:w-[60%]" : "w-full"}>
            <YouTubePlayer ref={playerRef} videoId={episode.youtubeId} />

            {/* Action buttons */}
            <div className="mt-4 flex items-center gap-3">
              {!chatActive && (
                <button
                  type="button"
                  onClick={handleJumpIn}
                  className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300 dark:focus-visible:outline-zinc-50"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
                    />
                  </svg>
                  Jump In
                </button>
              )}
              {chatActive && (
                <button
                  type="button"
                  onClick={() => void handleResume()}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 dark:focus-visible:outline-zinc-50"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
                    />
                  </svg>
                  Resume
                </button>
              )}
            </div>
          </div>

          {/* Chat column */}
          {chatActive && (
            <div className="h-[500px] w-full lg:h-auto lg:min-h-[500px] lg:w-[40%]">
              <ChatPanel
                episodeId={episode.id}
                podcasterId={episode.podcaster.id}
                currentTimestamp={chatTimestamp}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
