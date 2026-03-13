import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";

let instance: FeatureExtractionPipeline | null = null;
let loading: Promise<FeatureExtractionPipeline> | null = null;

/**
 * Returns a singleton feature-extraction pipeline.
 * The first call downloads the ONNX model (~23 MB); subsequent calls reuse it.
 */
async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (instance) return instance;

  if (!loading) {
    loading = pipeline("feature-extraction", MODEL_NAME, {
      dtype: "fp32",
    }).then((pipe) => {
      instance = pipe;
      return pipe;
    });
  }

  return loading;
}

/**
 * Generate a 384-dimensional embedding for a single text.
 */
export async function embed(text: string): Promise<number[]> {
  const pipe = await getPipeline();
  const output = await pipe(text, { pooling: "mean", normalize: true });
  // output is a Tensor – convert to a plain number[]
  return Array.from(output.data as Float32Array);
}

/**
 * Generate embeddings for a batch of texts.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const pipe = await getPipeline();
  const results: number[][] = [];
  // Process individually to avoid large tensor issues
  for (const text of texts) {
    const output = await pipe(text, { pooling: "mean", normalize: true });
    results.push(Array.from(output.data as Float32Array));
  }
  return results;
}
