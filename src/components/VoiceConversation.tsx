"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SpeechRecognitionService } from "@/lib/voice/speech-recognition";
import { SpeechSynthesisService } from "@/lib/voice/speech-synthesis";

type VoiceState = "idle" | "listening" | "processing" | "speaking";

interface VoiceConversationProps {
  episodeId: string;
  podcasterId: string;
  currentTimestamp: number;
  onMicError?: () => void;
  onConversationIdChange?: (conversationId: string | null) => void;
}

export default function VoiceConversation({
  episodeId,
  podcasterId,
  currentTimestamp,
  onMicError,
  onConversationIdChange,
}: VoiceConversationProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [lastResponse, setLastResponse] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionService | null>(null);
  const synthesisRef = useRef<SpeechSynthesisService | null>(null);
  const mountedRef = useRef(true);

  // Send message to chat API (mirrors ChatPanel logic)
  const sendToChatAPI = useCallback(
    async (message: string): Promise<string> => {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          episodeId,
          podcasterId,
          timestamp: currentTimestamp,
          message,
          conversationId,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Chat API request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullResponse = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);

          if (data === "[DONE]" || data === "[ERROR]") continue;

          try {
            const parsed = JSON.parse(data) as { conversationId?: string };
            if (parsed.conversationId) {
              setConversationId(parsed.conversationId);
              onConversationIdChange?.(parsed.conversationId);
              continue;
            }
          } catch {
            // Not JSON — it's a text token
          }

          fullResponse += data;
        }
      }

      return fullResponse;
    },
    [episodeId, podcasterId, currentTimestamp, conversationId, onConversationIdChange],
  );

  // Start listening via speech recognition
  const startListening = useCallback(() => {
    if (!mountedRef.current || muted) return;

    setTranscript("");
    setVoiceState("listening");

    const recognition = new SpeechRecognitionService({
      onResult: (text, isFinal) => {
        if (!mountedRef.current) return;
        setTranscript(text);

        if (isFinal) {
          setVoiceState("processing");
          recognition.stop();

          void sendToChatAPI(text).then((response) => {
            if (!mountedRef.current) return;
            setLastResponse(response);
            setVoiceState("speaking");

            synthesisRef.current?.speak(response);
          }).catch(() => {
            if (!mountedRef.current) return;
            setLastResponse("Sorry, something went wrong. Please try again.");
            setVoiceState("idle");
          });
        }
      },
      onError: (error) => {
        if (!mountedRef.current) return;
        if (error === "not-allowed" || error === "audio-capture") {
          onMicError?.();
        }
        setVoiceState("idle");
      },
      onEnd: () => {
        // Recognition ended naturally; only restart if still listening
        if (!mountedRef.current) return;
        // If we're still in listening state (no final result yet), recognition timed out
        // Don't auto-restart — user will re-activate
      },
    });

    recognitionRef.current = recognition;
    recognition.start();
  }, [muted, sendToChatAPI, onMicError]);

  // Initialize synthesis service
  useEffect(() => {
    mountedRef.current = true;

    const synthesis = new SpeechSynthesisService({
      onEnd: () => {
        if (!mountedRef.current) return;
        setVoiceState("idle");
        // Auto-restart listening after TTS finishes
        startListening();
      },
      onError: () => {
        if (!mountedRef.current) return;
        setVoiceState("idle");
      },
    });

    synthesisRef.current = synthesis;

    return () => {
      mountedRef.current = false;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      synthesis.cancel();
      synthesisRef.current = null;
    };
  }, [startListening]);

  // Handle mute toggle
  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const newMuted = !prev;
      if (newMuted) {
        // Muting: stop recognition but stay in voice mode
        recognitionRef.current?.abort();
        recognitionRef.current = null;
        if (voiceState === "listening") {
          setVoiceState("idle");
        }
      }
      return newMuted;
    });
  }, [voiceState]);

  // Activate voice: start listening
  const activate = useCallback(() => {
    if (voiceState !== "idle") return;
    startListening();
  }, [voiceState, startListening]);

  return (
    <div
      className="flex flex-col items-center gap-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
      role="region"
      aria-label="Voice conversation"
    >
      {/* State indicator */}
      <div className="flex flex-col items-center gap-2">
        {voiceState === "idle" && (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
            <svg
              className="h-8 w-8 text-zinc-400 dark:text-zinc-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
              />
            </svg>
          </div>
        )}

        {voiceState === "listening" && (
          <div className="flex h-16 w-16 animate-pulse items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <svg
              className="h-8 w-8 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
              />
            </svg>
          </div>
        )}

        {voiceState === "processing" && (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-100"
              role="status"
              aria-label="Processing your message"
            />
          </div>
        )}

        {voiceState === "speaking" && (
          <div className="flex h-16 w-16 items-center justify-center gap-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30">
            <span
              className="inline-block h-4 w-1 animate-[voice-wave_0.8s_ease-in-out_infinite] rounded-full bg-blue-500"
              aria-hidden="true"
            />
            <span
              className="inline-block h-6 w-1 animate-[voice-wave_0.8s_ease-in-out_0.15s_infinite] rounded-full bg-blue-500"
              aria-hidden="true"
            />
            <span
              className="inline-block h-8 w-1 animate-[voice-wave_0.8s_ease-in-out_0.3s_infinite] rounded-full bg-blue-500"
              aria-hidden="true"
            />
            <span
              className="inline-block h-6 w-1 animate-[voice-wave_0.8s_ease-in-out_0.45s_infinite] rounded-full bg-blue-500"
              aria-hidden="true"
            />
            <span
              className="inline-block h-4 w-1 animate-[voice-wave_0.8s_ease-in-out_0.6s_infinite] rounded-full bg-blue-500"
              aria-hidden="true"
            />
          </div>
        )}

        {/* State label */}
        <p
          className="text-sm font-medium text-zinc-600 dark:text-zinc-400"
          aria-live="polite"
        >
          {voiceState === "idle" && (muted ? "Muted" : "Ready")}
          {voiceState === "listening" && "Listening…"}
          {voiceState === "processing" && "Thinking…"}
          {voiceState === "speaking" && "Speaking…"}
        </p>
      </div>

      {/* Transcript / Response display */}
      {transcript && voiceState === "listening" && (
        <p className="max-w-full text-center text-sm text-zinc-700 dark:text-zinc-300">
          {transcript}
        </p>
      )}
      {lastResponse && voiceState === "speaking" && (
        <p className="max-h-32 max-w-full overflow-y-auto text-center text-sm text-zinc-700 dark:text-zinc-300">
          {lastResponse}
        </p>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3">
        {/* Activate / Start listening button */}
        {voiceState === "idle" && !muted && (
          <button
            type="button"
            onClick={activate}
            aria-label="Start voice conversation"
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
                d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
              />
            </svg>
            Tap to speak
          </button>
        )}

        {/* Mute toggle */}
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "Unmute microphone" : "Mute microphone"}
          aria-pressed={muted}
          className={`inline-flex items-center justify-center rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:focus-visible:outline-zinc-50 ${
            muted
              ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
              : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
          }`}
        >
          {muted ? (
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
                d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z"
              />
            </svg>
          ) : (
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
                d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
