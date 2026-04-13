import { LLMProvider, Message, LLMOptions } from "./types";

export class OpenRouterProvider implements LLMProvider {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  /**
   * Initializes the OpenRouter provider.
   * Priority: passed options > environment variables > hardcoded defaults.
   */
  constructor(options?: { apiKey?: string; baseUrl?: string; model?: string }) {
    this.apiKey = options?.apiKey || process.env.OPENROUTER_API_KEY || "";
    this.baseUrl = options?.baseUrl || process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
    this.defaultModel = options?.model || process.env.OPENROUTER_MODEL || "openai/gpt-3.5-turbo";
  }

  /**
   * Standard chat completion (non-streaming).
   * OpenRouter requires HTTP-Referer and X-OpenRouter-Title for better rankings/analytics.
   */
  async chat(messages: Message[], options?: LLMOptions): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        // Required by OpenRouter for ranking/referral tracking
        "HTTP-Referer": process.env.YOUR_SITE_URL || "http://localhost:3000",
        "X-OpenRouter-Title": process.env.YOUR_SITE_NAME || "The Live Podcast",
      },
      body: JSON.stringify({
        model: options?.model || this.defaultModel,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2048,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}${errorData.error?.message ? ` - ${errorData.error.message}` : ""}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  /**
   * Streaming chat completion using Server-Sent Events (SSE).
   * Yields content chunks as they arrive from the provider.
   */
  async *stream(
    messages: Message[],
    options?: LLMOptions
  ): AsyncGenerator<string, void, unknown> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": process.env.YOUR_SITE_URL || "http://localhost:3000",
        "X-OpenRouter-Title": process.env.YOUR_SITE_NAME || "The Live Podcast",
      },
      body: JSON.stringify({
        model: options?.model || this.defaultModel,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2048,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}${errorData.error?.message ? ` - ${errorData.error.message}` : ""}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    // SSE parsing loop
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep the trailing partial line in the buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        
        const data = trimmed.slice(6);
        if (data === "[DONE]") return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // Silent catch for potential heartbeat or malformed frames
        }
      }
    }
  }
}
