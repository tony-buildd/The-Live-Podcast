import { LLMProvider, Message, LLMOptions } from "./types";

export class OllamaProvider implements LLMProvider {
  private baseUrl: string;
  private defaultModel: string;

  constructor(
    baseUrl = "http://localhost:11434",
    defaultModel = "llama3.1"
  ) {
    this.baseUrl = process.env.OLLAMA_BASE_URL || baseUrl;
    this.defaultModel = process.env.OLLAMA_MODEL || defaultModel;
  }

  async chat(messages: Message[], options?: LLMOptions): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options?.model || this.defaultModel,
        messages,
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.maxTokens ?? 2048,
        },
      }),
    });

    if (!response.ok) {
      let detail = "";
      try {
        const body = (await response.json()) as { error?: string };
        detail = body.error ? ` - ${body.error}` : "";
      } catch {
        // ignore body parse issues
      }
      throw new Error(
        `Ollama API error: ${response.status} ${response.statusText}${detail}`,
      );
    }

    const data = await response.json();
    return data.message.content;
  }

  async *stream(
    messages: Message[],
    options?: LLMOptions
  ): AsyncGenerator<string, void, unknown> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options?.model || this.defaultModel,
        messages,
        stream: true,
        options: {
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.maxTokens ?? 2048,
        },
      }),
    });

    if (!response.ok) {
      let detail = "";
      try {
        const body = (await response.json()) as { error?: string };
        detail = body.error ? ` - ${body.error}` : "";
      } catch {
        // ignore body parse issues
      }
      throw new Error(
        `Ollama API error: ${response.status} ${response.statusText}${detail}`,
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.message?.content) {
            yield parsed.message.content;
          }
        } catch {
          // skip malformed JSON
        }
      }
    }
  }
}
