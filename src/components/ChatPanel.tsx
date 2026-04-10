"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { toast } from "sonner";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

interface ChatPanelProps {
  episodeId: string;
  podcasterId: string;
  currentTimestamp: number;
  onConversationIdChange?: (conversationId: string | null) => void;
  onUserInteraction?: () => void;
}

export default function ChatPanel({
  episodeId,
  podcasterId,
  currentTimestamp,
  onConversationIdChange,
  onUserInteraction,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const userScrolledUpRef = useRef(false);

  // Auto-focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Detect if user scrolled up to pause auto-scroll
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // If user is within 60px of bottom, consider them "following"
      userScrolledUpRef.current = scrollHeight - scrollTop - clientHeight > 60;
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll on new messages (only if user hasn't scrolled up)
  useEffect(() => {
    if (!userScrolledUpRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const streamResponse = useCallback(
    async (userMessage: string, assistantIndex: number) => {
      setStreaming(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            episodeId,
            podcasterId,
            timestamp: currentTimestamp,
            message: userMessage,
            conversationId,
          }),
        });

        if (!res.ok || !res.body) {
          toast.error("Failed to get a response. Please try again.");
          setMessages((prev) => {
            const updated = [...prev];
            updated[assistantIndex] = {
              role: "assistant",
              content:
                updated[assistantIndex].content ||
                "Something went wrong. Please try again.",
              error: true,
            };
            return updated;
          });
          setStreaming(false);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          // Keep the last incomplete line in buffer
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);

            if (data === "[DONE]" || data === "[ERROR]") continue;

            // Try to parse conversationId from metadata
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

            // Append token to the assistant message at assistantIndex
            setMessages((prev) => {
              const updated = [...prev];
              const msg = updated[assistantIndex];
              if (msg && msg.role === "assistant") {
                updated[assistantIndex] = {
                  ...msg,
                  content: msg.content + data,
                };
              }
              return updated;
            });
          }
        }

        // Mark as non-error on success
        setMessages((prev) => {
          const updated = [...prev];
          const msg = updated[assistantIndex];
          if (msg && msg.role === "assistant") {
            updated[assistantIndex] = { ...msg, error: false };
          }
          return updated;
        });
      } catch {
        toast.error("Connection error. Please try again.");
        setMessages((prev) => {
          const updated = [...prev];
          updated[assistantIndex] = {
            role: "assistant",
            content:
              updated[assistantIndex].content ||
              "Connection error. Please try again.",
            error: true,
          };
          return updated;
        });
      } finally {
        setStreaming(false);
      }
    },
    [episodeId, podcasterId, currentTimestamp, conversationId, onConversationIdChange],
  );

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    onUserInteraction?.();

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    setInput("");

    setMessages((prev) => {
      const updated = [...prev, userMessage, { role: "assistant" as const, content: "" }];
      return updated;
    });

    // The assistant message index is messages.length + 1 (after user message)
    const assistantIndex = messages.length + 1;
    await streamResponse(trimmed, assistantIndex);
  }, [input, streaming, messages.length, streamResponse, onUserInteraction]);

  const handleRetry = useCallback(
    async (assistantIndex: number) => {
      if (streaming) return;

      // Find the user message before the failed assistant message
      const userMsg = messages[assistantIndex - 1];
      if (!userMsg || userMsg.role !== "user") return;

      // Reset the assistant message content and error state
      setMessages((prev) => {
        const updated = [...prev];
        updated[assistantIndex] = { role: "assistant", content: "" };
        return updated;
      });

      await streamResponse(userMsg.content, assistantIndex);
    },
    [streaming, messages, streamResponse],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  return (
    <div className="flex h-full flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header */}
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Chat
        </h2>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <p className="text-center text-sm text-zinc-400 dark:text-zinc-500">
            Ask a question about this episode…
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`mb-3 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div className="max-w-[85%]">
              <div
                className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                }`}
              >
                {/* Typing indicator for empty assistant messages while streaming */}
                {msg.role === "assistant" && msg.content === "" && streaming && !msg.error ? (
                  <div className="flex items-center gap-1 py-1" aria-label="Typing">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 dark:bg-zinc-500" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 dark:bg-zinc-500" style={{ animationDelay: "150ms" }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 dark:bg-zinc-500" style={{ animationDelay: "300ms" }} />
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
              {/* Error indicator + Retry button */}
              {msg.error && (
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs text-red-500 dark:text-red-400">
                    Failed to send
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleRetry(i)}
                    disabled={streaming}
                    className="text-xs font-medium text-zinc-600 underline hover:text-zinc-800 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              onUserInteraction?.();
              setInput(e.target.value);
            }}
            onFocus={() => onUserInteraction?.()}
            onKeyDown={handleKeyDown}
            disabled={streaming}
            placeholder="Type a message…"
            rows={1}
            className="flex-1 resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-zinc-500 dark:focus-visible:outline-zinc-50"
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={streaming || !input.trim()}
            aria-label="Send message"
            className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300 dark:focus-visible:outline-zinc-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
