import { LLMProvider } from "./types";
import { OpenAIProvider } from "./openai";
import { OllamaProvider } from "./ollama";
import { OpenRouterProvider } from "./openrouter";

export type { LLMProvider, Message, LLMOptions } from "./types";

export type ProviderType = "openai" | "ollama" | "openrouter";

export function createLLMProvider(type?: ProviderType): LLMProvider {
  const provider = type || (process.env.LLM_PROVIDER as ProviderType) || "ollama";

  switch (provider) {
    case "openai":
      return new OpenAIProvider();
    case "openrouter":
      return new OpenRouterProvider();
    case "ollama":
      return new OllamaProvider();
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

const _providers: Partial<Record<ProviderType, LLMProvider>> = {};

/**
 * Gets an LLM provider.
 * If type is specified, it returns that specific provider (cached).
 * If no type is specified, it returns the default provider from env.
 */
export function getLLMProvider(type?: ProviderType): LLMProvider {
  const targetType = type || (process.env.LLM_PROVIDER as ProviderType) || "ollama";
  
  if (!_providers[targetType]) {
    _providers[targetType] = createLLMProvider(targetType);
  }
  return _providers[targetType]!;
}
