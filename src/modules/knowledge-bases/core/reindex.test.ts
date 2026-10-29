import { beforeEach, describe, expect, it, vi } from "vitest";

// ── In-memory Postgres + Qdrant fakes ────────────────────────────────────────
type Point = { id: string; vector: number[]; payload: Record<string, unknown> };
type JobRow = Record<string, unknown>;

const state = vi.hoisted(() => {
  process.env.MULTILINGUAL_EMBEDDINGS_ENABLED = "true";
  process.env.MULTILINGUAL_EMBEDDINGS_BASE_URL = "http://embeddings:80";
  process.env.REINDEX_PAGE_SIZE = "2";
  process.env.EMBED_BATCH_DELAY = "0";
  return {
    kb: { id: "kb-1", qdrant_collection: "kb_one", embedding_index: "standard", org_id: "org-1" },
    planAllows: true,
    registry: new Map<string, Record<string, unknown>>(),
    jobs: new Map<string, JobRow>(),
    collections: new Map<string, Map<string, { vector: number[]; payload: Record<string, unknown> }>>(),
    nextJob: 1,
    registryDefault: null as { providerId: string; modelId: string } | null,
  };
});

function activeJob(kbId: string) {
  return [...state.jobs.values()].find((j) => j.kb_id === kbId && (j.status === "queued" || j.status === "running"));
}

function run(sql: string, params: unknown[] = []): { rows: Record<string, unknown>[]; rowCount: number } {
  const one = (row: Record<string, unknown> | undefined) => ({ rows: row ? [row] : [], rowCount: row ? 1 : 0 });
  const s = sql.replace(/\s+/g, " ");
  if (s.includes("SELECT * FROM kb_vector_collections WHERE collection_name")) return one(state.registry.get(String(params[0])));
  if (s.includes("INSERT INTO kb_vector_collections")) {
    const name = String(params[0]);
    if (!state.registry.has(name)) {
      state.registry.set(name, {
        collection_name: name, kb_id: params[1], embedding_index: params[2], embedding_provider: params[3],
        embedding_model: params[4], dimension: params[5], role: params[6],
      });
    }
    return one(state.registry.get(name));
  }
  if (s.includes("UPDATE kb_vector_collections SET role")) {
    const [name, role] = s.includes("role = $2") ? [params[0], params[1]] : [params[0], s.includes("'retired'") ? "retired" : "live"];
    const row = state.registry.get(String(name));
    if (row) row.role = role;
    return one(row);
  }
  if (s.includes("DELETE FROM kb_vector_collections")) { state.registry.delete(String(params[0])); return one(undefined); }
  if (s.includes("FROM knowledge_bases kb JOIN agents")) return one({ ...state.kb });
  if (s.includes("FROM org_subscriptions")) return one({ allowed: state.planAllows, status: "active", current_period_end: null });
  if (s.includes("FROM subscription_plans WHERE id = 'free'")) return one({ allowed: false });
  if (s.includes("FROM kb_reindex_jobs WHERE kb_id = $1 AND status IN")) return one(activeJob(String(params[0])));
  if (s.includes("FROM kb_reindex_jobs WHERE kb_id = $1 AND status = 'failed'")) {
    // "latest failed" — insertion order is creation order in this fake
    const failed = [...state.jobs.values()].filter(
      (j) => j.kb_id === String(params[0]) && j.status === "failed",
    );
    return one(failed[failed.length - 1]);
  }
  if (s.includes("INSERT INTO kb_reindex_jobs")) {
    const id = `job-${state.nextJob++}`;
    const row: JobRow = {
      id, kb_id: params[0], source_collection: params[1], target_collection: params[2], target_index: params[3],
      embedding_provider: params[4], embedding_model: params[5], dimension: params[6], status: "queued",
      points_total: params[7], points_done: 0, cursor: null, lease_until: null, error_message: null,
      created_at: "now", updated_at: "now", completed_at: null,
    };
    state.jobs.set(id, row);
    return one(row);
  }
  if (s.includes("UPDATE knowledge_bases SET embedding_index")) { state.kb.embedding_index = String(params[1]); return one(undefined); }
  if (s.includes("SET status = 'running'")) {
    const job = state.jobs.get(String(params[0]));
    if (!job || !["queued", "running"].includes(String(job.status)) || job.lease_until) return one(undefined);
    job.status = "running";
    job.lease_until = "held";
    return one(job);
  }
  if (s.includes("SELECT * FROM kb_reindex_jobs WHERE id")) return one(state.jobs.get(String(params[0])));
  if (s.includes("SET cursor = $2")) {
    const job = state.jobs.get(String(params[0]))!;
    job.cursor = params[1] == null ? null : JSON.parse(String(params[1]));
    job.points_done = Number(job.points_done) + Number(params[2]);
    return one(job);
  }
  if (s.includes("SET lease_until = NULL WHERE id")) { state.jobs.get(String(params[0]))!.lease_until = null; return one(undefined); }
  if (s.includes("SET status = 'failed'")) {
    const job = state.jobs.get(String(params[0]))!;
    Object.assign(job, { status: "failed", error_message: params[1], lease_until: null });
    return one(job);
  }
  if (s.includes("UPDATE knowledge_bases SET qdrant_collection")) {
    if (state.kb.qdrant_collection !== params[3]) return { rows: [], rowCount: 0 };
    state.kb.qdrant_collection = String(params[1]);
    state.kb.embedding_index = String(params[2]);
    return { rows: [], rowCount: 1 };
  }
  if (s.includes("SET status = 'cancelled'")) {
    Object.assign(state.jobs.get(String(params[0]))!, { status: "cancelled", lease_until: null });
    return one(undefined);
  }
  if (s.includes("SET status = 'completed'")) {
    Object.assign(state.jobs.get(String(params[0]))!, { status: "completed", lease_until: null, cursor: null });
    return one(undefined);
  }
  throw new Error(`Unexpected SQL in test: ${s.slice(0, 120)}`);
}

vi.mock("@/lib/db", () => ({
  query: vi.fn(async (sql: string, params?: unknown[]) => run(sql, params).rows),
  queryOne: vi.fn(async (sql: string, params?: unknown[]) => run(sql, params).rows[0] ?? null),
  withTransaction: vi.fn(async (fn: (tx: { query: typeof run }) => Promise<unknown>) =>
    fn({ query: (sql: string, params?: unknown[]) => run(sql, params) })),
}));

const client = {
  count: vi.fn(async (name: string) => {
    const c = state.collections.get(name);
    if (!c) throw new Error("Not found");
    return { count: c.size };
  }),
  collectionExists: vi.fn(async (name: string) => ({ exists: state.collections.has(name) })),
  scroll: vi.fn(async (name: string, opts: { limit: number; offset?: string }) => {
    const ids = [...(state.collections.get(name)?.keys() ?? [])].sort();
    const start = opts.offset ? ids.indexOf(opts.offset) : 0;
    const slice = ids.slice(start, start + opts.limit);
    const next = ids[start + opts.limit];
    return {
      points: slice.map((id) => ({ id, payload: state.collections.get(name)!.get(id)!.payload })),
      next_page_offset: next ?? null,
    };
  }),
  upsert: vi.fn(async (name: string, body: { points: Point[] }) => {
    const c = state.collections.get(name);
    if (!c) throw new Error(`no collection ${name}`);
    for (const p of body.points) c.set(String(p.id), { vector: p.vector, payload: p.payload });
  }),
  createPayloadIndex: vi.fn(async () => ({})),
  deleteCollection: vi.fn(async (name: string) => { state.collections.delete(name); }),
  delete: vi.fn(async () => ({})),
};
vi.mock("@/modules/admin/core/vector-store", () => ({
  getQdrantClient: () => client,
  ensureCollectionExists: vi.fn(async (name: string) => {
    if (!state.collections.has(name)) state.collections.set(name, new Map());
  }),
}));
vi.mock("@/modules/knowledge-bases/core/analytics-db", () => ({ logUsageEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/db/migrate", () => ({ loadRuntimeSettingsOnStartup: vi.fn(async () => {}) }));
vi.mock("@/modules/ai-core/resolve", () => ({
  resolveAIConfig: vi.fn(async () => ({})),
  toProviderConfig: vi.fn(() => ({ provider: "openai", embeddingModel: "text-embedding-3-small" })),
  getProviderApiKey: vi.fn(() => "sk-test"),
}));
vi.mock("@/modules/ai-core/factory", () => ({
  ProviderFactory: {
    getProvider: (config: { provider: string; embeddingModel?: string }) => {
      const dimension = config.provider === "tei" ? 1024 : 1536;
      return {
        getProviderName: () => config.provider,
        getModelName: () => config.embeddingModel ?? "text-embedding-3-small",
        getEmbeddingDimension: () => dimension,
        embedBatch: async (texts: string[]) => texts.map(() => [dimension]),
        embedText: async () => [dimension],
      };
    },
  },
}));

// The platform embedding default registry (consumed by targetForIndex to
// align NEW standard indexes with the platform default model).
vi.mock("@/modules/ai-governance/core/registry-db", () => ({
  getPlatformAIRegistry: vi.fn(async () => ({
    embeddingDefault: state.registryDefault ?? null,
    defaults: [],
    providers: [],
    defaultModels: [],
  })),
}));

import { advanceReindexJob, cancelReindex, startReindex } from "./reindex";
import { clearEmbeddingIndexCaches, resolveSearchEmbedding, resolveWriteEmbedding } from "./embedding-index";
import { toProviderConfig } from "@/modules/ai-core/resolve";
import { upsertDocumentsKb } from "@/modules/admin/core/vector-store-kb";

function seedLegacyCollection(count: number) {
  const c = new Map<string, { vector: number[]; payload: Record<string, unknown> }>();
  for (let i = 0; i < count; i++) {
    c.set(`p${i}`, { vector: [1536], payload: { chunk: `chunk ${i}`, documentId: "doc-1", kbId: "kb-1", chunkIndex: i } });
  }
  state.collections.set("kb_one", c);
}

describe("multilingual knowledge index", () => {
  beforeEach(() => {
    state.kb = { id: "kb-1", qdrant_collection: "kb_one", embedding_index: "standard", org_id: "org-1" };
    state.planAllows = true;
    state.registry.clear();
    state.jobs.clear();
    state.collections.clear();
    clearEmbeddingIndexCaches();
    vi.clearAllMocks();
  });

  it("searches a registered collection with the model that built it, and adopts legacy ones", async () => {
    state.registry.set("kb_ml", {
      collection_name: "kb_ml", kb_id: "kb-1", embedding_index: "multilingual", embedding_provider: "tei",
      embedding_model: "intfloat/multilingual-e5-large-instruct", dimension: 1024, role: "live",
    });
    const fallback = { provider: "openai" as const, embeddingModel: "text-embedding-3-small" };
    expect(await resolveSearchEmbedding("kb_ml", fallback, "kb-1")).toMatchObject({ provider: "tei", embeddingDimension: 1024 });

    expect(await resolveSearchEmbedding("kb_legacy", fallback, "kb-1")).toBe(fallback);
    expect(state.registry.get("kb_legacy")).toMatchObject({ embedding_provider: "openai", dimension: 1536, role: "live" });
  });

  it("builds a NEW knowledge base with its chosen index, but keeps a populated legacy one on its model", async () => {
    state.kb.embedding_index = "multilingual";
    const fresh = await resolveWriteEmbedding("kb-1", "kb_one");
    expect(fresh.entry).toMatchObject({ provider: "tei", dimension: 1024, index: "multilingual" });

    clearEmbeddingIndexCaches();
    state.registry.clear();
    seedLegacyCollection(3);
    const legacy = await resolveWriteEmbedding("kb-1", "kb_one");
    expect(legacy.entry).toMatchObject({ provider: "openai", dimension: 1536, index: "standard" });
  });

  it("re-indexes page by page, then swaps the knowledge base to the new collection", async () => {
    seedLegacyCollection(5);
    const job = await startReindex({ kbId: "kb-1", index: "multilingual" });
    expect(job).toMatchObject({ status: "queued", pointsTotal: 5, provider: "tei" });
    expect(state.kb.qdrant_collection).toBe("kb_one"); // still serving the old index

    const done = await advanceReindexJob(job.id, 10_000);
    expect(done?.status).toBe("completed");
    expect(state.kb.qdrant_collection).toBe(job.targetCollection);
    expect(state.kb.embedding_index).toBe("multilingual");
    const target = state.collections.get(job.targetCollection)!;
    expect(target.size).toBe(5);
    expect(target.get("p3")).toEqual({ vector: [1024], payload: expect.objectContaining({ chunk: "chunk 3", documentId: "doc-1" }) });
    expect(state.registry.get("kb_one")?.role).toBe("retired"); // kept for in-flight reads / rollback
    expect(state.registry.get(job.targetCollection)?.role).toBe("live");
    expect(client.scroll).toHaveBeenCalledTimes(3); // 2 + 2 + 1 with REINDEX_PAGE_SIZE=2
  });

  it("mirrors uploads made during a re-index into the new collection", async () => {
    seedLegacyCollection(2);
    const job = await startReindex({ kbId: "kb-1", index: "multilingual" });
    await upsertDocumentsKb("kb_one", ["new chunk"], { kbId: "kb-1", documentId: "doc-2", title: "New", originalFilename: "new.pdf" });
    const live = [...state.collections.get("kb_one")!.values()].find((p) => p.payload.chunk === "new chunk");
    const mirrored = [...state.collections.get(job.targetCollection)!.values()].find((p) => p.payload.chunk === "new chunk");
    expect(live?.vector).toEqual([1536]);
    expect(mirrored?.vector).toEqual([1024]);
    expect(live?.payload.referenceIndexed).toBe(true);
    expect(mirrored?.payload.referenceIndexed).toBe(true);
    expect(live?.payload.referenceIds).toEqual([]);
    expect(mirrored?.payload.referenceIds).toEqual([]);
  });

  it("refuses the multilingual index when the plan does not include it, and one job at a time", async () => {
    seedLegacyCollection(1);
    state.planAllows = false;
    await expect(startReindex({ kbId: "kb-1", index: "multilingual" })).rejects.toMatchObject({ status: 403 });

    state.planAllows = true;
    await startReindex({ kbId: "kb-1", index: "multilingual" });
    await expect(startReindex({ kbId: "kb-1", index: "multilingual" })).rejects.toMatchObject({ status: 409 });
  });

  it("cancelling drops the half-built index and keeps the knowledge base on its current one", async () => {
    seedLegacyCollection(1);
    const job = await startReindex({ kbId: "kb-1", index: "multilingual" });
    await cancelReindex("kb-1");
    expect(state.collections.has(job.targetCollection)).toBe(false);
    expect(state.kb.qdrant_collection).toBe("kb_one");
    expect(state.kb.embedding_index).toBe("standard");
  });

  it("cancelling a FAILED re-index clears the stuck banner state and drops its half-built index", async () => {
    // Production gap (2026-10-29): the KB index panel renders "Cancel
    // re-index" for a FAILED job, but the handler only considered
    // queued/running jobs — cancelling a failed migration to a
    // decommissioned provider (local Qwen embeddings) silently did
    // nothing, so the "Re-index stopped" banner had no exit and Resume
    // just re-attempted the unreachable target.
    seedLegacyCollection(1);
    const job = await startReindex({ kbId: "kb-1", index: "multilingual" });
    expect(state.collections.has(job.targetCollection)).toBe(true);
    // the batch failed mid-flight (target provider became unreachable)
    Object.assign(state.jobs.get(job.id)!, {
      status: "failed",
      error_message: "Embedding failed: fetch failed",
      lease_until: null,
    });

    const cancelled = await cancelReindex("kb-1");
    expect(cancelled).toMatchObject({ id: job.id, status: "cancelled" });
    expect(state.collections.has(job.targetCollection)).toBe(false); // half-built index dropped
    expect(state.registry.has(job.targetCollection)).toBe(false); // registry row dropped
    expect(state.kb.qdrant_collection).toBe("kb_one"); // serving index untouched
    expect(state.kb.embedding_index).toBe("standard");
  });

  it("builds a NEW standard index with the platform embedding default, not a stale tenant pin", async () => {
    // Production defect: the self-heal notice promised a re-index to the
    // platform default (gemini-embedding-2-preview) while the resolver fell
    // back to a tenant/org pin (gemini-embedding-001) and built with THAT.
    seedLegacyCollection(2);
    state.registry.set("kb_one", {
      collection_name: "kb_one", kb_id: "kb-1", embedding_index: "standard",
      embedding_provider: "openai", embedding_model: "text-embedding-3-small", dimension: 1536, role: "live",
    });
    state.registryDefault = { providerId: "gemini", modelId: "gemini-embedding-2-preview" };
    const mock = vi.mocked(toProviderConfig);
    mock.mockImplementation(
      () => ({ provider: "gemini", embeddingModel: "gemini-embedding-001" }) as ReturnType<typeof toProviderConfig>,
    );
    try {
      const job = await startReindex({ kbId: "kb-1", index: "standard" });
      expect(job.provider).toBe("gemini");
      expect(job.model).toBe("gemini-embedding-2-preview");
    } finally {
      mock.mockImplementation(
        () => ({ provider: "openai", embeddingModel: "text-embedding-3-small" }) as ReturnType<typeof toProviderConfig>,
      );
      state.registryDefault = null;
    }
  });

  it("keeps the tenant-resolved model when no platform embedding default is set", async () => {
    seedLegacyCollection(2);
    state.registry.set("kb_one", {
      collection_name: "kb_one", kb_id: "kb-1", embedding_index: "standard",
      embedding_provider: "openai", embedding_model: "text-embedding-3-small", dimension: 1536, role: "live",
    });
    state.registryDefault = null; // registry unreachable / unset
    const mock = vi.mocked(toProviderConfig);
    mock.mockImplementation(
      () => ({ provider: "gemini", embeddingModel: "gemini-embedding-001" }) as ReturnType<typeof toProviderConfig>,
    );
    try {
      const job = await startReindex({ kbId: "kb-1", index: "standard" });
      expect(job.model).toBe("gemini-embedding-001");
    } finally {
      mock.mockImplementation(
        () => ({ provider: "openai", embeddingModel: "text-embedding-3-small" }) as ReturnType<typeof toProviderConfig>,
      );
    }
  });
});
