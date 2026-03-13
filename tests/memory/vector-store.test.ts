import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the embeddings module so tests don't download a real model
vi.mock("@/lib/memory/embeddings", () => {
  // Simple deterministic mock: hash text into a 384-dim vector
  function fakeEmbed(text: string): number[] {
    const vec = new Array(384).fill(0);
    for (let i = 0; i < text.length; i++) {
      vec[i % 384] += text.charCodeAt(i) / 1000;
    }
    // Normalize
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }

  return {
    embed: vi.fn(async (text: string) => fakeEmbed(text)),
    embedBatch: vi.fn(async (texts: string[]) => texts.map(fakeEmbed)),
  };
});

// Use a temp directory for the vector index so tests are isolated
import path from "path";
import os from "os";
import fs from "fs";

const tmpDir = path.join(os.tmpdir(), `vectra-test-${Date.now()}`);

vi.mock("vectra", async () => {
  const actual = await vi.importActual<typeof import("vectra")>("vectra");
  const OriginalLocalIndex = actual.LocalIndex;

  // Patch LocalIndex to use a temp dir
  class TestLocalIndex extends OriginalLocalIndex {
    constructor() {
      super(tmpDir);
    }
  }

  return { ...actual, LocalIndex: TestLocalIndex };
});

// We need to re-mock the vector-store module to use our temp dir
// Instead, let's just test via the public API with the mocked embeddings
import { addChunks, search, deleteByMetadata } from "@/lib/memory/vector-store";
import { embed, embedBatch } from "@/lib/memory/embeddings";

describe("vector-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("embed() returns a 384-dim vector", async () => {
    const vec = await embed("hello world");
    expect(vec).toHaveLength(384);
    expect(typeof vec[0]).toBe("number");
  });

  it("embedBatch() returns vectors for each input", async () => {
    const vecs = await embedBatch(["hello", "world"]);
    expect(vecs).toHaveLength(2);
    expect(vecs[0]).toHaveLength(384);
    expect(vecs[1]).toHaveLength(384);
  });

  it("addChunks stores items and search retrieves them", async () => {
    await addChunks([
      {
        id: "chunk-1",
        text: "Machine learning is a subset of artificial intelligence",
        metadata: { episodeId: "ep-1" },
      },
      {
        id: "chunk-2",
        text: "Neural networks are inspired by the human brain",
        metadata: { episodeId: "ep-1" },
      },
      {
        id: "chunk-3",
        text: "Cooking pasta requires boiling water and salt",
        metadata: { episodeId: "ep-2" },
      },
    ]);

    const results = await search("artificial intelligence and machine learning", 3);

    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(3);

    // Each result should have the expected shape
    for (const r of results) {
      expect(r).toHaveProperty("id");
      expect(r).toHaveProperty("text");
      expect(r).toHaveProperty("score");
      expect(typeof r.score).toBe("number");
    }
  });

  it("search returns ranked results (highest score first)", async () => {
    const results = await search("machine learning AI", 3);

    expect(results.length).toBeGreaterThan(0);
    // Results should be sorted by score descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("deleteByMetadata removes matching items", async () => {
    // Add items for a specific episode
    await addChunks([
      {
        id: "del-1",
        text: "Episode to delete first chunk",
        metadata: { episodeId: "ep-delete" },
      },
      {
        id: "del-2",
        text: "Episode to delete second chunk",
        metadata: { episodeId: "ep-delete" },
      },
    ]);

    const deleted = await deleteByMetadata({ episodeId: "ep-delete" });
    expect(deleted).toBe(2);

    // Searching should no longer return deleted items
    const results = await search("Episode to delete", 10);
    const deletedIds = results.filter(
      (r) => r.id === "del-1" || r.id === "del-2",
    );
    expect(deletedIds).toHaveLength(0);
  });
});
