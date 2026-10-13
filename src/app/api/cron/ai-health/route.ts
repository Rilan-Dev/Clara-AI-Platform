import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { getPlatformAIRegistry, recordProviderHealth } from "@/modules/ai-governance/core/registry-db";
import { testProviderConnection } from "@/modules/ai-governance/core/health";
import {
  syncPlatformHealthIncidents,
  type PlatformHealthCheck,
} from "@/modules/platform-health/core/incidents";

/**
 * GET /api/cron/ai-health
 * ─────────────────────────────────────────────────────────────────────────────
 * 24/7 AI provider + embedding pipeline monitor (scheduled every 15 minutes
 * via vercel.json crons — Vercel Cron and the self-hosted local-cron both
 * drive this route with `Authorization: Bearer $CRON_SECRET`).
 *
 * Why this exists: the platform embedding backbone is a hard dependency for
 * every KB chat, upload and agent answer, but until now it was only checked
 * when an admin happened to open System Status — an invalid OpenAI key could
 * silently break retrieval for hours with nothing but container logs. This
 * route:
 *
 *   1. Runs the authenticated connectivity test for every enabled governed
 *      provider and records the result in platform_ai_provider_health (the
 *      provider drawer "Health" tab shows these rows).
 *   2. Performs a live embedding round-trip for OpenAI and Gemini with the
 *      configured keys — the exact call the retrieval path makes — so a dead
 *      credential is caught within minutes, not hours.
 *   3. Syncs every result into platform_health_incidents, which drives the
 *      super-admin banner (PlatformHealthAlertBanner) and email
 *      notifications, and auto-resolves incidents on recovery.
 *
 * Auth: cron secret only — never exposed to browsers.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EMBEDDING_CHECK_TIMEOUT_MS = 10_000;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

type EmbeddingRoundTrip = {
  ok: boolean;
  latencyMs: number;
  model: string;
  error?: string;
};

/**
 * Live embedding round-trip against a provider using the configured key and
 * the platform embedding default model when the provider owns it. Mirrors
 * checkAiEmbedding from the system status panel but is driven from the
 * registry default so the tested model is the one retrieval actually uses.
 */
async function checkEmbeddingRoundTrip(
  provider: "openai" | "gemini",
  registryModel: string | null,
): Promise<EmbeddingRoundTrip> {
  const apiKey = (provider === "openai" ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY)?.trim();
  const fallbackModel = provider === "openai"
    ? (process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small")
    : (process.env.GEMINI_EMBEDDING_MODEL?.trim() || "text-embedding-004");
  const model = registryModel ?? fallbackModel;

  if (!apiKey) {
    return { ok: false, latencyMs: 0, model, error: "API key not configured" };
  }

  const start = Date.now();
  try {
    let res: Response;
    if (provider === "openai") {
      const base = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
      res = await fetch(`${base}/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ input: ["clara embedding health check"], model, dimensions: 16 }),
        signal: AbortSignal.timeout(EMBEDDING_CHECK_TIMEOUT_MS),
      });
    } else {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: { parts: [{ text: "clara embedding health check" }] },
            outputDimensionality: 16,
          }),
          signal: AbortSignal.timeout(EMBEDDING_CHECK_TIMEOUT_MS),
        },
      );
    }
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      return { ok: false, latencyMs, model, error: `HTTP ${res.status}: ${body}` };
    }
    return { ok: true, latencyMs, model };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, model, error: (err as Error).message };
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureMigrated();
    const registry = await getPlatformAIRegistry();
    const embeddingDefault = registry.embeddingDefault ?? null;
    const chatDefaultProvider =
      registry.defaults.find((item) => item.capability === "chat")?.providerId?.toLowerCase() ?? null;

    const checks: PlatformHealthCheck[] = [];

    // ── 1. Provider connectivity (authenticated round trip per provider) ──
    const providerResults: Array<{ providerId: string; status: string; latencyMs: number | null; error: string | null }> = [];
    for (const provider of registry.providers) {
      if (!provider.enabled || !provider.configured) continue;
      const outcome = await testProviderConnection(provider.providerId);
      await recordProviderHealth(provider.providerId, outcome, "ai-health-cron");
      providerResults.push({
        providerId: provider.providerId,
        status: outcome.status,
        latencyMs: outcome.latencyMs,
        error: outcome.errorMessage,
      });
      const isChatDefault = chatDefaultProvider === provider.providerId;
      const isEmbeddingDefault = embeddingDefault?.providerId === provider.providerId;
      checks.push({
        key: `ai-provider:${provider.providerId}`,
        serviceName: `${provider.displayName} provider`,
        healthy: outcome.status === "healthy",
        severity: isChatDefault || isEmbeddingDefault ? "critical" : "warning",
        message:
          outcome.status === "healthy"
            ? "Authenticated connectivity check passed."
            : `${outcome.errorMessage ?? "Connectivity check failed."}${isEmbeddingDefault ? " This provider also carries the platform embedding backbone — every KB chat/upload is affected until it is fixed." : ""}`,
      });
    }

    // ── 2. Embedding round-trips (the call retrieval actually makes) ───────
    const embeddingResults: Array<{ provider: string; ok: boolean; model: string; latencyMs: number; error?: string }> = [];
    for (const provider of ["openai", "gemini"] as const) {
      const hasKey = (provider === "openai" ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY)?.trim();
      if (!hasKey) continue;
      const registryModel = embeddingDefault?.providerId === provider ? embeddingDefault.modelId : null;
      const result = await checkEmbeddingRoundTrip(provider, registryModel);
      embeddingResults.push({ provider, ...result });
      const isEmbeddingDefault = embeddingDefault?.providerId === provider;
      checks.push({
        key: `ai-embedding:${provider}`,
        serviceName: `${provider === "openai" ? "OpenAI" : "Gemini"} embedding`,
        healthy: result.ok,
        severity: isEmbeddingDefault ? "critical" : "warning",
        message: result.ok
          ? `Embedding round-trip OK (${result.model}, ${result.latencyMs} ms).`
          : `Embedding round-trip FAILED on ${result.model}: ${result.error ?? "unknown error"}.` +
            `${isEmbeddingDefault ? " This is the ACTIVE platform embedding backbone — KB chat, uploads and agents are failing right now. Fix the credential or switch the embedding default (Settings → AI Platform)." : " Standby embedding provider — fix the credential before switching the platform embedding default to it."}`,
      });
    }

    // ── 3. Embedding configuration sanity ──────────────────────────────────
    if (!embeddingDefault) {
      checks.push({
        key: "ai-embedding-config",
        serviceName: "Embedding configuration",
        healthy: false,
        severity: "critical",
        message:
          "No platform embedding default is configured. Document ingestion and KB retrieval depend on it — set one in Settings → AI Platform (Embeddings).",
      });
    }

    // ── 4. Persist incidents (banner + email on new failures, auto-resolve) ─
    await syncPlatformHealthIncidents(checks);

    const failing = checks.filter((check) => !check.healthy);
    return NextResponse.json({
      ok: failing.length === 0,
      checkedAt: new Date().toISOString(),
      summary: {
        providers: providerResults.length,
        embeddings: embeddingResults.length,
        failing: failing.length,
      },
      providers: providerResults,
      embeddings: embeddingResults,
      embeddingDefault: embeddingDefault
        ? `${embeddingDefault.providerId}/${embeddingDefault.modelId}`
        : null,
    });
  } catch (error) {
    console.error("[cron/ai-health]", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
