/**
 * src/modules/knowledge-bases/core/embedding-selfheal.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Self-healing for a knowledge-base collection whose registered embedding
 * provider has a dead credential.
 *
 * The scenario this closes (seen in production docker logs): the platform's
 * OpenAI key dies (401 invalid_api_key). The admin switches the platform
 * embedding default to Gemini. But every existing Qdrant collection was BUILT
 * with OpenAI embeddings, and retrieval embeds the query with the model that
 * built the collection (embedding-index.ts) — so every KB chat still hits the
 * dead OpenAI key and fails with 401, on both the agent preview and the
 * published widget, until someone re-indexes each KB by hand.
 *
 * When a search embedding fails with an auth/quota error AND the platform
 * embedding default points at a DIFFERENT provider, this module enqueues the
 * re-index job automatically and returns an actionable, public-safe message.
 * The background workers (instrumentation poller / worker route) advance the
 * job; the swap is atomic per KB.
 */

import type { ProviderConfig } from "@/modules/ai-core/types";
import { recordRuntimeIncident } from "@/modules/platform-health/core/incidents";
import { getActiveReindexJob, getKbIndexContext } from "./embedding-index";
import { ReindexError, startReindex } from "./reindex";
import { getPlatformAIRegistry } from "@/modules/ai-governance/core/registry-db";

/**
 * Thrown after a successful self-heal trigger. The message is deliberately
 * public-safe and actionable — chat surfaces surface it verbatim instead of
 * the generic "Knowledge-base search failed" dead end.
 */
export class EmbeddingBackboneBrokenError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "EmbeddingBackboneBrokenError";
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

function looksLikeCredentialOrBillingFailure(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error);
  return /invalid_api_key|incorrect api key|api key not valid|unauthorized|\b401\b|permission.?denied|\b403\b|insufficient_quota|quota|billing|deprecated/i.test(
    raw,
  );
}

function providerLabel(provider: string): string {
  return provider === "openai" ? "OpenAI" : provider === "gemini" ? "Gemini" : provider;
}

/**
 * Attempt to self-heal a failed search embedding.
 *
 * Returns an EmbeddingBackboneBrokenError carrying the public-safe guidance
 * when healing was possible (job enqueued, already running, or attempted),
 * and null when this failure is NOT a self-heal case (same provider as the
 * default, no default, resolution errors, network hiccups, …) — the caller
 * then rethrows the original error unchanged.
 */
export async function selfHealBrokenCollectionEmbedding(params: {
  kbId: string;
  collectionName: string;
  providerConfig: ProviderConfig;
  error: unknown;
}): Promise<EmbeddingBackboneBrokenError | null> {
  const failedProvider = params.providerConfig.provider;
  if (failedProvider !== "openai" && failedProvider !== "gemini") return null;
  if (!looksLikeCredentialOrBillingFailure(params.error)) return null;
  if (!params.kbId) return null;

  let registry: Awaited<ReturnType<typeof getPlatformAIRegistry>>;
  try {
    registry = await getPlatformAIRegistry();
  } catch {
    return null;
  }
  const embeddingDefault = registry.embeddingDefault ?? null;
  // Same provider as the failing one (or nothing configured): switching the
  // default away is the operator's job — surface the original error.
  if (!embeddingDefault || embeddingDefault.providerId === failedProvider) return null;

  // Multilingual KBs are governed by the multilingual settings, never by the
  // platform embedding default.
  const context = await getKbIndexContext(params.kbId).catch(() => null);
  if (context && context.desiredIndex !== "standard") return null;

  const from = `${providerLabel(failedProvider)}${params.providerConfig.embeddingModel ? ` (${params.providerConfig.embeddingModel})` : ""}`;
  const to = `${providerLabel(embeddingDefault.providerId)}/${embeddingDefault.modelId}`;

  const activeJob = await getActiveReindexJob(params.kbId).catch(() => null);
  if (activeJob) {
    return new EmbeddingBackboneBrokenError(
      `This knowledge base's search index was built with ${from} embeddings, and that provider's credential is being rejected. ` +
        `A re-index to ${to} is already in progress (${activeJob.pointsDone}/${activeJob.pointsTotal} points) — ` +
        `answers resume automatically once the new index is swapped in.`,
      { cause: params.error },
    );
  }

  try {
    await startReindex({ kbId: params.kbId, index: "standard", userId: null });
    void recordRuntimeIncident({
      key: `ai-embedding-migration:${params.kbId}`,
      serviceName: "Embedding backbone migration",
      healthy: false,
      severity: "warning",
      message:
        `The live index for one knowledge base was built with ${from} embeddings, whose credential is now being rejected. ` +
        `A re-index to the platform default ${to} was started automatically; KB answers resume when the swap completes.`,
    }).catch(() => undefined);
    return new EmbeddingBackboneBrokenError(
      `This knowledge base's search index was built with ${from} embeddings, and that provider's credential is being rejected. ` +
        `A re-index to the platform embedding default (${to}) has been started automatically — answers resume as soon as the new index finishes building. ` +
        `Track progress under the knowledge base's index settings.`,
      { cause: params.error },
    );
  } catch (startError) {
    if (startError instanceof ReindexError) {
      // ALREADY_INDEXED (race with the admin action) or REINDEX_RUNNING
      // (race with another request) — the migration is covered either way.
      if (startError.code === "REINDEX_RUNNING" || startError.code === "ALREADY_INDEXED") {
        return new EmbeddingBackboneBrokenError(
          `This knowledge base's search index was built with ${from} embeddings, whose credential is being rejected. ` +
            `The migration to ${to} is already queued or running — answers resume once the new index is active.`,
          { cause: params.error },
        );
      }
      return null;
    }
    console.error("[embedding-selfheal] could not start re-index job:", startError);
    void recordRuntimeIncident({
      key: "ai-embedding-migration-failed",
      serviceName: "Embedding backbone migration",
      healthy: false,
      severity: "critical",
      message:
        `Search failed with a ${providerLabel(failedProvider)} credential error, and the automatic re-index to ${to} could not be started: ` +
        `${(startError as Error).message}. Fix the ${providerLabel(failedProvider)} credential or re-index manually.`,
    }).catch(() => undefined);
    return null;
  }
}
