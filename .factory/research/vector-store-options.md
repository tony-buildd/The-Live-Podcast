# Vector Store Options Research

> Research date: 2026-03-12
> Context: Next.js app with SQLite + Prisma, need lightweight local vector storage

## Summary & Recommendation

**Recommended approach: `vectra` for vector storage + `@huggingface/transformers` for local embeddings.**

Vectra is the best fit because it's pure TypeScript, file-backed, zero-infrastructure, actively maintained, and has the simplest API. For local embeddings (no API calls), use `@huggingface/transformers` (v3) with the `all-MiniLM-L6-v2` model.

If performance at scale becomes an issue (>10k vectors), consider migrating to `hnswlib-node` for O(log n) search.

---

## Option 1: Vectra

| Property | Details |
|---|---|
| **npm package** | `vectra` |
| **Latest version** | `0.12.3` (published ~Feb 2026) |
| **License** | MIT |
| **Stars** | 590 |
| **Actively maintained** | ✅ Yes — last commit Jan 14, 2026; 18 contributors |

### How it works
- File-backed, in-memory vector database for Node.js
- Each index is a **folder on disk** with an `index.json` file containing vectors + metadata
- Queries use **cosine similarity** with linear scan over all vectors
- Supports Pinecone-compatible MongoDB-style metadata filtering (`$eq`, `$in`, `$and`, `$or`, etc.)
- Two index types:
  - `LocalIndex` — you bring vectors + metadata
  - `LocalDocumentIndex` — you bring text, Vectra chunks/embeds/retrieves
- Also supports **hybrid retrieval** (semantic + BM25 keyword search)

### API Surface
```typescript
import { LocalIndex } from 'vectra';

const index = new LocalIndex('./my-index');
await index.createIndex({ version: 1, metadata_config: { indexed: ['category'] } });
await index.insertItem({ vector: [0.1, 0.2, ...], metadata: { text: 'hello', category: 'greeting' } });
const results = await index.queryItems(queryVector, '', 5); // topK=5
// results: [{ score: 0.95, item: { metadata: {...} } }]
```

### Persistence
- **File-based**: `index.json` stores all vectors + indexed metadata
- Per-item metadata stored as separate JSON files
- Entire index loaded into memory at query time

### Performance
- **Linear scan** — O(n) per query
- Small indexes (<1k vectors): **<1ms** per query
- Medium indexes (1k-10k): **1-2ms** per query
- Memory: ~12KB per 1536-dim vector in memory (JS doubles)
- **Not suitable for** very large corpora (>50k vectors) — entire index in RAM

### Gotchas
- Linear scan means performance degrades linearly with corpus size
- Entire index loaded into RAM — not suitable for very large datasets
- `index.json` is plain JSON — large indexes = slow (de)serialization at startup
- Vectors stored as JSON (not binary) — larger disk footprint than binary formats
- Requires an external embeddings provider OR you bring your own vectors

### Verdict
✅ **Best fit for this project.** Simple, file-backed, TypeScript-native, actively maintained. Perfect for small-to-medium podcast corpus. Can bring your own embeddings (from transformers.js).

---

## Option 2: hnswlib-node

| Property | Details |
|---|---|
| **npm package** | `hnswlib-node` |
| **Latest version** | `3.0.0` (published Mar 2024) |
| **License** | Apache-2.0 |
| **Stars** | 135 |
| **Actively maintained** | ✅ Yes — dependabot/maintenance commits as of Mar 12, 2026; repo actively maintained |

### How it works
- **Native C++ bindings** (via node-addon-api) wrapping the HNSW algorithm
- HNSW = Hierarchical Navigable Small World graphs — state-of-the-art ANN algorithm
- Supports L2 (Euclidean), inner product, and cosine distance metrics
- Much faster than linear scan for large datasets — O(log n) approximate search

### API Surface
```typescript
import { HierarchicalNSW } from 'hnswlib-node';

const index = new HierarchicalNSW('cosine', 384); // metric, dimensions
index.initIndex(10000); // max elements

index.addPoint([0.1, 0.2, ...], 0); // vector, label
index.addPoint([0.3, 0.4, ...], 1);

const result = index.searchKnn([0.1, 0.2, ...], 5); // query, k
// result: { distances: Float32Array, neighbors: Int32Array }

index.writeIndexSync('index.dat');
// Later: index.readIndexSync('index.dat');
```

### Persistence
- **Binary file**: `writeIndexSync('file.dat')` / `readIndexSync('file.dat')`
- Compact binary format — much smaller than JSON
- Must manage metadata separately (only stores vectors + integer labels)

### Performance
- **O(log n) search** via HNSW algorithm
- Orders of magnitude faster than linear scan for large datasets
- Native C++ — no JS overhead for distance computation
- Memory efficient with binary storage

### Gotchas
- ⚠️ **Native addon** — requires node-gyp build toolchain (Python, C++ compiler)
- May have issues on some platforms (ARM Mac, Windows, etc.)
- **No metadata storage** — only stores vectors + integer labels; you must manage metadata mapping yourself
- Must pre-declare `maxElements` at init time
- npm package last published 2 years ago (v3.0.0) though repo is still maintained
- Cannot easily resize index after creation

### Verdict
⚡ **Best for performance at scale**, but adds complexity: native build dependency, no metadata storage, manual ID-to-data mapping needed. Overkill for small datasets. Good upgrade path if vectra becomes too slow.

---

## Option 3: @huggingface/transformers (formerly @xenova/transformers)

| Property | Details |
|---|---|
| **npm package** | `@huggingface/transformers` (v3+) or `@xenova/transformers` (v2, legacy) |
| **Latest version** | v3.x (actively developed) |
| **License** | Apache-2.0 |
| **Stars** | 12k+ (transformers.js repo) |
| **Actively maintained** | ✅ Yes — very active, backed by Hugging Face |

### How it works
- Runs ML models **entirely in JavaScript** using ONNX Runtime
- Supports hundreds of models from Hugging Face Hub
- For embeddings: use the `feature-extraction` pipeline with sentence-transformer models
- Models are downloaded and cached locally on first use (~25-90MB per model)
- Supports WebGPU acceleration (v3)

### API Surface (Embedding Generation)
```typescript
import { pipeline } from '@huggingface/transformers';

// Load model (cached after first download)
const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

// Generate embeddings
const output = await extractor('Hello world', { pooling: 'mean', normalize: true });
const embedding = Array.from(output.data); // Float32Array → number[]
// embedding.length === 384 (for all-MiniLM-L6-v2)
```

### Recommended Models for Embeddings
| Model | Dimensions | Size | Quality |
|---|---|---|---|
| `Xenova/all-MiniLM-L6-v2` | 384 | ~23MB | Good general purpose |
| `Xenova/all-MiniLM-L12-v2` | 384 | ~33MB | Better quality |
| `Xenova/bge-small-en-v1.5` | 384 | ~33MB | Good for retrieval |
| `Xenova/all-mpnet-base-v2` | 768 | ~90MB | Best quality (larger) |

### Performance
- First load: 2-5 seconds (model loading + warm-up)
- Subsequent embeddings: ~10-50ms per sentence (CPU)
- Much faster with WebGPU (browser/Deno) — not applicable for Node.js server-side yet
- 384-dim vectors are ~3x smaller than OpenAI's 1536-dim → less storage, faster search

### Gotchas
- ⚠️ First model download requires internet (then cached in `~/.cache/huggingface`)
- Model loading takes a few seconds — should be done once at startup
- `@xenova/transformers` (v2) is the legacy package; new code should use `@huggingface/transformers` (v3)
- ONNX Runtime can be large (~40MB) — increases node_modules size
- May need `onnxruntime-node` for Node.js backend (auto-detected usually)

### Verdict
✅ **Essential for local embeddings without API calls.** Use `all-MiniLM-L6-v2` for good quality at small size. Pairs perfectly with any vector store option.

---

## Option 4: Custom SQLite Solution (Embeddings in SQLite)

### Approach
Store embedding vectors directly in your existing Prisma/SQLite database as binary blobs or JSON, and compute cosine similarity in JavaScript.

### Implementation Sketch
```prisma
// schema.prisma
model Embedding {
  id        String @id @default(cuid())
  sourceId  String // reference to podcast/episode
  content   String // the text that was embedded
  vector    Bytes  // Float32Array stored as binary
  createdAt DateTime @default(now())
}
```

```typescript
// Store embedding
const float32 = new Float32Array(embedding);
const buffer = Buffer.from(float32.buffer);
await prisma.embedding.create({
  data: { sourceId: 'ep1', content: 'text', vector: buffer }
});

// Search: load all, compute cosine similarity in JS
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const allEmbeddings = await prisma.embedding.findMany();
const queryVec = await generateEmbedding(query);
const scored = allEmbeddings.map(e => {
  const vec = Array.from(new Float32Array(e.vector.buffer));
  return { ...e, score: cosineSimilarity(queryVec, vec) };
}).sort((a, b) => b.score - a.score).slice(0, topK);
```

### Persistence
- Uses existing SQLite database via Prisma
- Binary blob storage for vectors (efficient)
- No additional files or services

### Performance
- Must load ALL embeddings into memory for each query (no index)
- O(n) similarity computation in JavaScript
- For 1k embeddings × 384-dim: ~1-5ms (acceptable)
- For 10k+ embeddings: may become slow (10-50ms+)
- Binary blob storage is compact (~1.5KB per 384-dim vector)

### Gotchas
- ⚠️ No ANN (approximate nearest neighbor) — always exact brute-force
- Must load all vectors into memory for every query (can cache in process)
- No metadata filtering optimization (though you can use Prisma queries to pre-filter)
- Must build and maintain the similarity logic yourself
- SQLite's `Bytes` type with Prisma works but is less convenient than dedicated tools
- No built-in support for incremental index updates

### Verdict
🔧 **Simplest approach with zero dependencies**, but limited. Fine for <1k vectors. For a podcast app that grows, you'll likely want to upgrade to vectra or hnswlib-node.

---

## Option 5 (Bonus): sqlite-vec

| Property | Details |
|---|---|
| **npm package** | `sqlite-vec` |
| **Description** | SQLite extension for vector search |
| **Actively maintained** | ✅ Yes |

### How it works
- SQLite extension that adds vector search capabilities directly to SQLite
- Successor to `sqlite-vss`
- Supports cosine similarity, L2 distance, inner product
- Vector operations happen inside SQLite — no need to load vectors into JS

### Gotchas
- ⚠️ May not work well with Prisma (needs raw SQL and extension loading)
- Extension loading in SQLite can be tricky in some environments
- Less documentation for Node.js/Prisma integration
- Would require bypassing Prisma's query builder for vector operations

### Verdict
🔄 **Interesting but risky** for a Prisma-based project. Would require raw SQL queries and extension management. Better suited for projects using SQLite directly without an ORM.

---

## Comparison Matrix

| Feature | Vectra | hnswlib-node | Custom SQLite | sqlite-vec |
|---|---|---|---|---|
| **npm install** | ✅ Pure JS | ⚠️ Native addon | ✅ No extra deps | ⚠️ Extension |
| **Persistence** | JSON files | Binary file | SQLite (Prisma) | SQLite |
| **Search algorithm** | Linear scan | HNSW (ANN) | Linear scan | KNN in SQLite |
| **Cosine similarity** | ✅ Built-in | ✅ Built-in | 🔧 Manual | ✅ Built-in |
| **Metadata** | ✅ Built-in | ❌ Manual | ✅ Via Prisma | ✅ Via SQL |
| **<1k vectors** | <1ms | <1ms | 1-5ms | <1ms |
| **10k vectors** | 1-2ms | <1ms | 10-50ms | ~5ms |
| **Complexity** | Low | Medium | Low | Medium |
| **Prisma compat** | N/A (separate) | N/A (separate) | ✅ Native | ⚠️ Raw SQL |
| **Active maintenance** | ✅ | ✅ | N/A | ✅ |

---

## Recommended Architecture for This Project

```
┌─────────────────────────────────────────┐
│         Embedding Generation            │
│  @huggingface/transformers              │
│  Model: Xenova/all-MiniLM-L6-v2        │
│  Output: 384-dim normalized vectors     │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│         Vector Storage & Search         │
│  vectra (LocalIndex)                    │
│  - File-backed (./data/vectors/)        │
│  - Cosine similarity search             │
│  - Metadata filtering                   │
│  - <2ms query for typical podcast data  │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│         Application Data                │
│  SQLite + Prisma                        │
│  - Podcast metadata                     │
│  - Episode data                         │
│  - User data                            │
│  - References to vector IDs             │
└─────────────────────────────────────────┘
```

### Install Commands
```bash
npm install vectra @huggingface/transformers
```

### Estimated Sizes
- `vectra`: ~50KB (pure TypeScript)
- `@huggingface/transformers`: ~2MB (+ ~40MB for onnxruntime-node)
- `all-MiniLM-L6-v2` model: ~23MB (cached in ~/.cache/huggingface, downloaded on first use)
