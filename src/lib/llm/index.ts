import { LLMProvider } from "./types";
import { OpenAIProvider } from "./openai";
import { OllamaProvider } from "./ollama";

export type { LLMProvider, Message, LLMOptions } from "./types";

export function createLLMProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER || "ollama";

  switch (provider) {
    case "openai":
      return new OpenAIProvider();
    case "ollama":
      return new OllamaProvider();
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

let _provider: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (!_provider) {
    _provider = createLLMProvider();
  }
  return _provider;
}
