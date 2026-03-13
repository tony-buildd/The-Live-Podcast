export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface LLMProvider {
  chat(messages: Message[], options?: LLMOptions): Promise<string>;
  stream(
    messages: Message[],
    options?: LLMOptions
  ): AsyncGenerator<string, void, unknown>;
}
