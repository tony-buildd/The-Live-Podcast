import path from "path";
import { LocalIndex, type MetadataTypes } from "vectra";
import { embed, embedBatch } from "./embeddings";

type ChunkMetadata = Record<string, MetadataTypes>;

const INDEX_DIR = path.resolve(process.cwd(), ".vectorstore");

let index: LocalIndex | null = null;

/**
 * Return (and lazily create) the singleton LocalIndex instance.
 */
async function getIndex(): Promise<LocalIndex> {
  if (index) return index;

  index = new LocalIndex(INDEX_DIR);
  const exists = await index.isIndexCreated();
  if (!exists) {
    await index.createIndex();
  }
  return index;
}

export interface ChunkInput {
  id: string;
  text: string;
  metadata: Record<string, MetadataTypes>;
}

export interface SearchResult {
  id: string;
  text: string;
  score: number;
  metadata: Record<string, MetadataTypes>;
}

/**
 * Embed and store transcript chunks in the vector index.
 */
export async function addChunks(items: ChunkInput[]): Promise<void> {
  if (items.length === 0) return;

  const idx = await getIndex();
  const texts = items.map((i) => i.text);
  const vectors = await embedBatch(texts);

  await idx.beginUpdate();
  try {
    for (let i = 0; i < items.length; i++) {
      const metadata: ChunkMetadata = {
        ...items[i].metadata,
        text: items[i].text,
      };
      await idx.upsertItem({
        id: items[i].id,
        vector: vectors[i],
        metadata,
      });
    }
    await idx.endUpdate();
  } catch (err) {
    idx.cancelUpdate();
    throw err;
  }
}

/**
 * Semantic search: embed the query and return the top-K closest chunks.
 */
export async function search(
  query: string,
  topK = 5,
): Promise<SearchResult[]> {
  const idx = await getIndex();
  const vector = await embed(query);

  const results = await idx.queryItems(vector, query, topK);

  return results.map((r) => ({
    id: r.item.id,
    text: String(r.item.metadata.text ?? ""),
    score: r.score,
    metadata: r.item.metadata,
  }));
}

/**
 * Delete all items whose metadata matches the given filter values.
 * E.g. deleteByMetadata({ episodeId: "abc123" }) removes every chunk for that episode.
 */
export async function deleteByMetadata(
  filter: Record<string, MetadataTypes>,
): Promise<number> {
  const idx = await getIndex();
  const items = await idx.listItemsByMetadata(filter);

  if (items.length === 0) return 0;

  await idx.beginUpdate();
  try {
    for (const item of items) {
      await idx.deleteItem(item.id);
    }
    await idx.endUpdate();
  } catch (err) {
    idx.cancelUpdate();
    throw err;
  }

  return items.length;
}
