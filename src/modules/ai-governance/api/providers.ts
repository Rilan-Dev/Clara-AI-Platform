/**
 * src/modules/ai-governance/api/providers.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform provider workspace API handlers (super-admin only).
 *
 * Ownership rules enforced here:
 *   - provider enable/disable, credentials, models, defaults, usage: PLATFORM
 *     ADMIN ONLY (requireSuperAdmin);
 *   - credentials are write-only through this API — responses contain ONLY
 *     masked hints, never secret values;
 *   - connection tests execute server-side only.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { describeNetworkError } from "@/lib/egress";
import {
  getPlatformAIRegistry,
  getProviderWorkspace,
  isGovernanceProviderId,
  isAICapability,
  listProviderHealthHistory,
  listProviderModels,
  setCapabilityDefault,
  setEmbeddingDefault,
  setModelDefault,
  setModelEnabled,
  setProviderEnabled,
  setProviderGovernance,
  updateProviderCredential,
} from "../core/registry-db";
import { testAndRecordProviderHealth } from "../core/health";
import { getProviderUsageReports } from "../core/usage-db";
import { resolveAvailableAIOptions } from "../core/resolver";
import { ProviderFactory } from "@/modules/ai-core/factory";
import { getProviderApiKey } from "@/modules/ai-core/resolve";
import { isPlaceholderProviderBaseUrl } from "@/modules/voice-core/model-catalog";
import { enqueueReindexToPlatformDefault } from "@/modules/knowledge-bases/core/reindex";
import { ensureMigrated } from "@/lib/db/migrate";
import { setPlatformEnvSetting } from "@/modules/phone/core/db";
import type { AICapability, AIModelKind } from "../core/types";

function errorResponse(message: string, status: number, code?: string): NextResponse {
  return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status });
}

function parseCapability(value: string | null): AICapability | null {
  if (!value) return null;
  return isAICapability(value) ? value : null;
}

function parseModelKind(value: unknown): AIModelKind | null {
  const kinds: AIModelKind[] = ["chat", "embedding", "realtime", "transcription", "tts", "stt", "voice", "sts"];
  return typeof value === "string" && kinds.includes(value as AIModelKind) ? (value as AIModelKind) : null;
}

// ─── GET /api/platform/ai/providers?capability= ───────────────────────────────

export async function listProvidersHandler(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const capability = parseCapability(req.nextUrl.searchParams.get("capability"));
    const registry = await getPlatformAIRegistry();
    const providers = capability
      ? registry.providers.map((p) => ({
          ...p,
          capabilities: p.capabilities.filter((c) => c.capability === capability),
          modelCounts: capability in p.modelCounts ? { [capability]: p.modelCounts[capability] } : {},
        }))
      : registry.providers;
    return NextResponse.json({ providers, defaults: registry.defaults });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/platform/ai/providers]", err);
    return errorResponse("Failed to load provider registry", 500);
  }
}

// ─── GET /api/platform/ai/providers/:providerId ───────────────────────────────

export async function getProviderHandler(req: NextRequest, providerId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    if (!isGovernanceProviderId(providerId)) {
      return errorResponse("Unknown provider", 404, "PROVIDER_UNKNOWN");
    }
    const includeUsage = req.nextUrl.searchParams.get("usage") === "1";
    const workspace = await getProviderWorkspace(providerId);
    if (!workspace) return errorResponse("Provider not found", 404, "PROVIDER_NOT_FOUND");

    const [healthHistory, usageReports] = await Promise.all([
      listProviderHealthHistory(providerId, 20),
      includeUsage ? getProviderUsageReports() : Promise.resolve(null),
    ]);
    return NextResponse.json({
      provider: workspace.provider,
      models: workspace.models,
      healthHistory,
      usage: usageReports?.find((u) => u.providerId === providerId) ?? null,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/platform/ai/providers/:id]", err);
    return errorResponse("Failed to load provider workspace", 500);
  }
}

// ─── PATCH /api/platform/ai/providers/:providerId ─────────────────────────────

export async function patchProviderHandler(req: NextRequest, providerId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    if (!isGovernanceProviderId(providerId)) {
      return errorResponse("Unknown provider", 404, "PROVIDER_UNKNOWN");
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (typeof body.enabled === "boolean") {
      await setProviderEnabled(providerId, body.enabled, auth.user.id);
    }
    if (providerId === "elevenlabs" && typeof body.realtimeEnabled === "boolean") {
      await setPlatformEnvSetting(
        "ELEVENLABS_REALTIME_ENABLED",
        body.realtimeEnabled ? "true" : "false",
        auth.user.id,
      );
    }
    if (body.monthlyBudgetUsd !== undefined || body.warningThresholdPct !== undefined) {
      const monthlyBudgetUsd =
        body.monthlyBudgetUsd === null
          ? null
          : typeof body.monthlyBudgetUsd === "number" && body.monthlyBudgetUsd >= 0
            ? body.monthlyBudgetUsd
            : undefined;
      const warningThresholdPct =
        typeof body.warningThresholdPct === "number" && body.warningThresholdPct >= 1 && body.warningThresholdPct <= 100
          ? body.warningThresholdPct
          : undefined;
      if (monthlyBudgetUsd === undefined && body.monthlyBudgetUsd !== undefined) {
        return errorResponse("monthlyBudgetUsd must be a non-negative number or null", 400);
      }
      if (warningThresholdPct === undefined && body.warningThresholdPct !== undefined) {
        return errorResponse("warningThresholdPct must be between 1 and 100", 400);
      }
      await setProviderGovernance(providerId, { monthlyBudgetUsd, warningThresholdPct });
    }
    if (body.archived !== undefined) {
      return errorResponse("Providers cannot be deleted — disable them instead", 400);
    }

    const workspace = await getProviderWorkspace(providerId);
    return NextResponse.json({ provider: workspace?.provider ?? null });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[PATCH /api/platform/ai/providers/:id]", err);
    return errorResponse("Failed to update provider", 500);
  }
}

// ─── PUT /api/platform/ai/providers/:providerId/credentials ───────────────────

export async function putProviderCredentialsHandler(req: NextRequest, providerId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    if (!isGovernanceProviderId(providerId)) {
      return errorResponse("Unknown provider", 404, "PROVIDER_UNKNOWN");
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const apiKey = typeof body.apiKey === "string" ? body.apiKey : undefined;
    const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl : undefined;
    if (apiKey === undefined && baseUrl === undefined) {
      return errorResponse("Provide apiKey and/or baseUrl", 400);
    }
    // The Base URL field's old placeholder example (api.vendor.ai) is NOT a
    // real endpoint — the domain does not resolve. It leaked into live
    // deployments twice (env var + saved settings row) because it looked
    // plausible, silently breaking every Sarvam/ElevenLabs call with connect
    // timeouts. Reject it at the save boundary with the actionable fix
    // instead of persisting a dead endpoint.
    if (baseUrl !== undefined && isPlaceholderProviderBaseUrl(baseUrl)) {
      return errorResponse(
        "That Base URL is the field's placeholder example (api.vendor.ai), not a real endpoint — the domain does not resolve. " +
          "Leave the field empty to use the provider's official endpoint, or enter a proxy URL you know is reachable.",
        400,
        "BASE_URL_PLACEHOLDER",
      );
    }
    const credential = await updateProviderCredential(
      providerId,
      { apiKey: apiKey ?? null, baseUrl: baseUrl ?? null },
      auth.user.id,
    );
    if (!credential) return errorResponse("Provider credential slot not found", 404);
    // NEVER echo the secret — only the masked state.
    return NextResponse.json({ credential });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[PUT /api/platform/ai/providers/:id/credentials]", err);
    return errorResponse("Failed to update provider credentials", 500);
  }
}

// ─── POST /api/platform/ai/providers/:providerId/test ─────────────────────────

export async function testProviderHandler(req: NextRequest, providerId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    if (!isGovernanceProviderId(providerId)) {
      return errorResponse("Unknown provider", 404, "PROVIDER_UNKNOWN");
    }
    const health = await testAndRecordProviderHealth(providerId, auth.user.id);
    return NextResponse.json({ health });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/platform/ai/providers/:id/test]", err);
    return errorResponse("Connection test failed", 500);
  }
}

// ─── GET/PATCH /api/platform/ai/providers/:providerId/models ──────────────────

export async function listProviderModelsHandler(req: NextRequest, providerId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    if (!isGovernanceProviderId(providerId)) {
      return errorResponse("Unknown provider", 404, "PROVIDER_UNKNOWN");
    }
    const capability = parseCapability(req.nextUrl.searchParams.get("capability"));
    const models = await listProviderModels(providerId, capability ?? undefined);
    return NextResponse.json({ models });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/platform/ai/providers/:id/models]", err);
    return errorResponse("Failed to load provider models", 500);
  }
}

export async function patchProviderModelHandler(req: NextRequest, providerId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    if (!isGovernanceProviderId(providerId)) {
      return errorResponse("Unknown provider", 404, "PROVIDER_UNKNOWN");
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const capability = parseCapability(typeof body.capability === "string" ? body.capability : null);
    const kind = parseModelKind(body.kind);
    const modelId = typeof body.modelId === "string" ? body.modelId.trim() : "";
    if (!capability) return errorResponse("capability must be chat | voice_chat | realtime_voice", 400);
    if (!kind) return errorResponse("kind is invalid", 400);
    if (!modelId) return errorResponse("modelId is required", 400);

    if (typeof body.enabled === "boolean") {
      const updated = await setModelEnabled(providerId, capability, kind, modelId, body.enabled);
      if (!updated) return errorResponse("Model not found", 404, "MODEL_NOT_FOUND");
    }
    if (body.isDefault === true) {
      const set = await setModelDefault(providerId, capability, kind, modelId);
      if (!set) return errorResponse("Model not found", 404, "MODEL_NOT_FOUND");
    }
    const models = await listProviderModels(providerId, capability);
    return NextResponse.json({ models });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[PATCH /api/platform/ai/providers/:id/models]", err);
    return errorResponse("Failed to update provider model", 500);
  }
}

// ─── GET/PUT /api/platform/ai/defaults ────────────────────────────────────────

export async function getDefaultsHandler(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const registry = await getPlatformAIRegistry();
    return NextResponse.json({ defaults: registry.defaults, embeddingDefault: registry.embeddingDefault });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/platform/ai/defaults]", err);
    return errorResponse("Failed to load platform AI defaults", 500);
  }
}

export async function putDefaultsHandler(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const capability = parseCapability(typeof body.capability === "string" ? body.capability : null);
    if (!capability) return errorResponse("capability must be chat | voice_chat | realtime_voice", 400);
    const providerId = body.providerId === null ? null : typeof body.providerId === "string" ? body.providerId : undefined;
    if (providerId === undefined) return errorResponse("providerId must be a provider id or null (inherit)", 400);
    if (providerId != null && !isGovernanceProviderId(providerId)) {
      return errorResponse("Unknown provider", 400, "PROVIDER_UNKNOWN");
    }
    const modelId = body.modelId === null ? null : typeof body.modelId === "string" ? body.modelId.trim() || null : undefined;
    if (modelId === undefined) return errorResponse("modelId must be a string or null", 400);

    await setCapabilityDefault(capability, providerId, modelId, auth.user.id);
    const registry = await getPlatformAIRegistry();
    return NextResponse.json({ defaults: registry.defaults, embeddingDefault: registry.embeddingDefault });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[PUT /api/platform/ai/defaults]", err);
    return errorResponse("Failed to update platform AI defaults", 500);
  }
}

export async function testEmbeddingDefaultHandler(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    await ensureMigrated();

    const registry = await getPlatformAIRegistry();
    const selected = registry.embeddingDefault;
    if (!selected) return errorResponse("No embedding model is configured.", 400);

    const provider = registry.providers.find((item) => item.providerId === selected.providerId);
    if (!provider?.enabled) return errorResponse(`Embedding provider ${selected.providerId} is disabled.`, 400);
    if (!provider.configured) return errorResponse(`Embedding provider ${selected.providerId} has no configured credentials.`, 400);

    const started = Date.now();
    const embeddingProvider = ProviderFactory.getProvider({
      provider: selected.providerId,
      apiKey: getProviderApiKey(selected.providerId),
      embeddingModel: selected.modelId,
    });
    const vector = await embeddingProvider.embedText("Clara AI embedding configuration test");
    if (!Array.isArray(vector) || vector.length === 0) {
      return errorResponse("Embedding provider returned an empty vector.", 502);
    }

    return NextResponse.json({
      providerId: selected.providerId,
      modelId: selected.modelId,
      dimension: vector.length,
      latencyMs: Date.now() - started,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/platform/ai/embedding-default/test]", err);
    // Provider SDKs wrap transport failures as a bare "TypeError: fetch
    // failed" — useless in the admin UI. Unwrap the cause chain and say WHAT
    // was unreachable and how to fix it (observed: ConnectTimeoutError to
    // generativelanguage.googleapis.com rendered as a one-line TypeError).
    const network = describeNetworkError(err);
    if (network) {
      return errorResponse(
        `Embedding test failed: the server could not reach the embedding endpoint` +
          `${network.host ? ` (${network.host})` : ""} — ${network.detail}. ` +
          `Check outbound network access (firewall/DNS) from this server, set HTTPS_PROXY if an egress ` +
          `proxy is required, or switch the embedding default to a reachable provider.`,
        502,
      );
    }
    return errorResponse((err as Error).message || "Embedding test failed", 502);
  }
}

export async function putEmbeddingDefaultHandler(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const providerId = body.providerId === "openai" || body.providerId === "gemini" || body.providerId === "qwen" ? body.providerId : null;
    const modelId = typeof body.modelId === "string" ? body.modelId.trim() : "";
    if (!providerId) return errorResponse("Embedding provider must be openai, gemini or qwen", 400);
    if (!modelId) return errorResponse("modelId is required", 400);

    await setEmbeddingDefault(providerId, modelId, auth.user.id);

    // Existing Qdrant collections keep searching with the model that BUILT
    // them, so a default switch alone leaves every already-indexed KB on the
    // OLD provider (e.g. a dead OpenAI key → 401 on every chat). Migrate the
    // fleet: enqueue a re-index job per live standard collection that is
    // pinned to a different embedding. Background workers advance the jobs;
    // the swap is atomic per KB. Never fatal — the default itself is saved.
    let migration: Awaited<ReturnType<typeof enqueueReindexToPlatformDefault>> | null = null;
    try {
      migration = await enqueueReindexToPlatformDefault({ userId: auth.user.id });
    } catch (migrationError) {
      console.error("[PUT /api/platform/ai/embedding-default] re-index orchestration failed", migrationError);
    }

    const registry = await getPlatformAIRegistry();
    return NextResponse.json({
      embeddingDefault: registry.embeddingDefault,
      ...(migration
        ? {
            reindexMigration: {
              scanned: migration.scanned,
              enqueued: migration.enqueued,
              skipped: migration.skipped,
              errors: migration.errors,
            },
          }
        : {}),
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[PUT /api/platform/ai/embedding-default]", err);
    return errorResponse((err as Error).message || "Failed to update embedding default", 400);
  }
}

// ─── GET /api/platform/ai/usage ───────────────────────────────────────────────

export async function getUsageHandler(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const reports = await getProviderUsageReports();
    return NextResponse.json({ reports });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/platform/ai/usage]", err);
    return errorResponse("Failed to load provider usage", 500);
  }
}

// ─── GET /api/agents/:agentId/ai-options?capability= (org-facing resolver) ────

export async function agentAIOptionsHandler(req: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    const { requireAgentPermission } = await import("@/modules/auth/core/rbac");
    // The permission query already resolves the agent's org in the same round
    // trip — no separate getAgentById fetch needed.
    const { orgId } = await requireAgentPermission(auth, agentId, "project:read");

    const capability = parseCapability(req.nextUrl.searchParams.get("capability"));
    if (!capability) return errorResponse("capability must be chat | voice_chat | realtime_voice", 400);

    const result = await resolveAvailableAIOptions({
      organizationId: orgId,
      agentId,
      capability,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/agents/:id/ai-options]", err);
    return errorResponse("Failed to resolve available AI options", 500);
  }
}
