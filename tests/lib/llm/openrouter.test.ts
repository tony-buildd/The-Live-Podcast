import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenRouterProvider } from '../../../src/lib/llm/openrouter';

describe('OpenRouterProvider', () => {
  const mockOptions = {
    apiKey: 'test-key',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'test-model'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear relevant env variables to ensure isolation
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
    delete process.env.YOUR_SITE_URL;
    delete process.env.YOUR_SITE_NAME;
  });

  it('should initialize with provided options', () => {
    const provider = new OpenRouterProvider(mockOptions);
    // @ts-ignore - reaching into private fields for test verification
    expect(provider.apiKey).toBe('test-key');
    // @ts-ignore
    expect(provider.baseUrl).toBe('https://openrouter.ai/api/v1');
    // @ts-ignore
    expect(provider.defaultModel).toBe('test-model');
  });

  it('should fallback to environment variables', () => {
    process.env.OPENROUTER_API_KEY = 'env-key';
    process.env.OPENROUTER_MODEL = 'env-model';
    
    const provider = new OpenRouterProvider();
    // @ts-ignore
    expect(provider.apiKey).toBe('env-key');
    // @ts-ignore
    expect(provider.defaultModel).toBe('env-model');
  });

  it('should call fetch with correct headers and body in chat()', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'hello' } }]
      })
    });
    global.fetch = mockFetch;

    const provider = new OpenRouterProvider(mockOptions);
    const result = await provider.chat([{ role: 'user', content: 'hi' }]);

    expect(result).toBe('hello');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/chat/completions'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-key',
          'Content-Type': 'application/json'
        }),
        body: expect.stringContaining('"model":"test-model"')
      })
    );
  });

  it('should throw error when api response is not ok', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({ error: { message: 'Invalid API Key' } })
    });
    global.fetch = mockFetch;

    const provider = new OpenRouterProvider(mockOptions);
    await expect(provider.chat([])).rejects.toThrow('OpenRouter API error: 401 Unauthorized - Invalid API Key');
  });
});
