"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import YouTubePlayer, {
  type YouTubePlayerHandle,
} from "@/components/YouTubePlayer";
import ChatPanel from "@/components/ChatPanel";
import VoiceConversation from "@/components/VoiceConversation";
import { SpeechRecognitionService } from "@/lib/voice/speech-recognition";
import { SpeechSynthesisService } from "@/lib/voice/speech-synthesis";

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
  const [voiceMode, setVoiceMode] = useState(false);
  const [micError, setMicError] = useState(false);
  const [chatTimestamp, setChatTimestamp] = useState(0);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const jumpInGuardRef = useRef(false);

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
    // Guard against rapid toggling / duplicate instances
    if (jumpInGuardRef.current || chatActive) return;
    jumpInGuardRef.current = true;

    if (playerRef.current) {
      playerRef.current.pause();
      setChatTimestamp(playerRef.current.getCurrentTime());
    }

    // Check if voice is supported (Chrome-like browsers)
    const supportsVoice = SpeechRecognitionService.isSupported() && SpeechSynthesisService.isSupported();
    setVoiceMode(supportsVoice);
    setMicError(false);
    setChatActive(true);

    // Release guard after a short delay
    setTimeout(() => {
      jumpInGuardRef.current = false;
    }, 300);
  }, [chatActive]);

  const handleMicError = useCallback(() => {
    setMicError(true);
    setVoiceMode(false);
  }, []);

  const handleResume = useCallback(async () => {
    // Guard against rapid toggling
    if (jumpInGuardRef.current) return;
    jumpInGuardRef.current = true;

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
    setVoiceMode(false);
    setMicError(false);
    setConversationId(null);
    playerRef.current?.play();

    setTimeout(() => {
      jumpInGuardRef.current = false;
    }, 300);
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
            <div className="flex h-[500px] w-full flex-col gap-3 lg:h-auto lg:min-h-[500px] lg:w-[40%]">
              {/* Mode indicator */}
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                    voiceMode
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                  aria-label={voiceMode ? "Voice mode active" : "Text mode active"}
                >
                  {voiceMode ? (
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                    </svg>
                  ) : (
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.2 48.2 0 0 0 5.265-.602c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                    </svg>
                  )}
                  {voiceMode ? "Voice" : "Text"}
                </span>
                {voiceMode && (
                  <button
                    type="button"
                    onClick={() => setVoiceMode(false)}
                    className="text-xs text-zinc-500 underline hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-300 dark:focus-visible:outline-zinc-50"
                  >
                    Switch to text
                  </button>
                )}
                {!voiceMode && SpeechRecognitionService.isSupported() && !micError && (
                  <button
                    type="button"
                    onClick={() => setVoiceMode(true)}
                    className="text-xs text-zinc-500 underline hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-300 dark:focus-visible:outline-zinc-50"
                  >
                    Switch to voice
                  </button>
                )}
              </div>

              {/* Mic permission error */}
              {micError && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300" role="alert">
                  Microphone access was denied. Using text chat instead.
                </div>
              )}

              {/* Voice or Text conversation */}
              {voiceMode ? (
                <div className="flex-1">
                  <VoiceConversation
                    episodeId={episode.id}
                    podcasterId={episode.podcaster.id}
                    currentTimestamp={chatTimestamp}
                    onMicError={handleMicError}
                  />
                </div>
              ) : (
                <div className="flex-1">
                  <ChatPanel
                    episodeId={episode.id}
                    podcasterId={episode.podcaster.id}
                    currentTimestamp={chatTimestamp}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
