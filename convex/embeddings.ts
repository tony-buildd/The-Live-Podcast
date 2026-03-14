import { EMBEDDING_DIMENSION } from "./schema";

function normalize(values: number[]): number[] {
  const magnitude = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return values;
  return values.map((v) => v / magnitude);
}

function deterministicEmbedding(text: string): number[] {
  const values = new Array<number>(EMBEDDING_DIMENSION).fill(0);
  const normalized = text.toLowerCase();

  for (let i = 0; i < normalized.length; i += 1) {
    const charCode = normalized.charCodeAt(i);
    const indexA = (charCode * 31 + i) % EMBEDDING_DIMENSION;
    const indexB = (charCode * 131 + i * 7) % EMBEDDING_DIMENSION;
    values[indexA] += 1;
    values[indexB] -= 0.5;
  }

  return normalize(values);
}

async function openAIEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_EMBEDDINGS_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const embedding = json.data?.[0]?.embedding;

  if (!embedding || embedding.length !== EMBEDDING_DIMENSION) {
    return null;
  }

  return normalize(embedding);
}

export async function embed(text: string): Promise<number[]> {
  const fromOpenAI = await openAIEmbedding(text);
  if (fromOpenAI) {
    return fromOpenAI;
  }
  return deterministicEmbedding(text);
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  for (const text of texts) {
    embeddings.push(await embed(text));
  }
  return embeddings;
}
