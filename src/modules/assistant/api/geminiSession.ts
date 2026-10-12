import { NextRequest, NextResponse } from "next/server";
import { resolveLanguagePreferences } from "@/modules/assistant/core/config";
import { ensureMigrated } from "@/lib/db/migrate";
import { query as dbQuery } from "@/lib/db";
import { planGuard } from "@/lib/plan-guard";
import { hit, rateLimitResponse, REALTIME_SESSION_RATE } from "@/lib/rate-limit";
import { requireAuth } from "@/modules/auth/core/rbac";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { buildSystemPrompt } from "@/modules/knowledge-bases/core/config-builder";
import { AIConfigResolutionError, resolveAIConfig } from "@/modules/ai-core/resolve";
import { mintGeminiRealtimeToken } from "@/modules/voice-core/api/gemini/realtime-auth";
import { listProviderModels } from "@/modules/ai-governance/core/registry-db";

// ─── Gemini Live session configuration ────────────────────────────────────────
//
// ALL values are SERVER-SIDE ONLY — including the long-lived GEMINI_API_KEY,
// which NEVER appears in the response. The browser receives:
//
//   • model / voice / instructions / language / sample rates (capability info)
//   • realtime: { endpoint, token } — a same-origin RELAY descriptor whose
//     token is a short-lived HMAC capability token (AUTH_SECRET-derived,
//     kb+org scoped, 60-minute TTL)
//
// The browser opens wss://<self>/api/voice/gemini/realtime?token=<hmac>;
// scripts/gemini-relay.mjs verifies the token in-process, then opens the
// upstream wss://generativelanguage.googleapis.com/…?key=<GEMINI_API_KEY>
// itself and pipes the BidiGenerateContent protocol verbatim. The vendor key
// is never in a response body, never in a URL the browser sees, never in a
// frame (gap-closure Phase D — P0 security).
//
// Guard discipline mirrors the OpenAI realtime session route exactly:
//   1. authentication (platform session) — anonymous callers get 401
//   2. REALTIME_SESSION_RATE (10 / hour / org|ip) — the SAME bucket as every
//      other provider, so switching providers does not multiply budgets
//   3. planGuard("voice") — 402 voice_not_enabled on free plans
//   4. resolveAIConfig — provider must be gemini for this KB
//   5. only then is the relay token minted

const DEFAULT_VOICE = "Aoede";

// Audio sample rates — fixed by Gemini Live API requirements.
const LIVE_INPUT_SAMPLE_RATE = 16_000;   // Hz
const LIVE_OUTPUT_SAMPLE_RATE = 24_000;  // Hz

export async function postGeminiSession(request: NextRequest): Promise<NextResponse> {
  try {
    // ── 1. Authentication: a valid platform session is required. The relay
    // capability token is never minted for anonymous callers.
    await requireAuth(request);

    // Parse optional language preferences from the request body.
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const kbId = typeof body?.kbId === "string" ? body.kbId.trim() : null;
    const languagePreferences = resolveLanguagePreferences({
      assistant:
        typeof body?.language === "string" ? body.language : undefined,
      customer: Array.isArray(body?.languages) ? body.languages : undefined,
    });

    let rawModel = process.env.GEMINI_LIVE_MODEL?.trim() || process.env.GEMINI_REALTIME_MODEL?.trim() || "";
    let voice = process.env.GEMINI_LIVE_VOICE ?? DEFAULT_VOICE;
    let instructions: string | null = null;
    let orgId: string | null = null;

    if (kbId) {
      await ensureMigrated();
      const kb = await getKnowledgeBaseById(kbId);
      if (!kb) {
        return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
      }

      const orgRows = await dbQuery<{ org_id: string }>(
        `SELECT a.org_id FROM agents a JOIN knowledge_bases kb2 ON kb2.agent_id = a.id WHERE kb2.id = $1`,
        [kbId]
      );
      orgId = orgRows[0]?.org_id ?? null;

      // ── 2. Rate limit — same bucket as every other realtime provider.
      {
        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
          ?? request.headers.get("x-real-ip") ?? "unknown";
        const gate = hit(
          `realtime:${orgId ? `org:${orgId}` : `ip:${ip}`}`,
          REALTIME_SESSION_RATE.limit,
          REALTIME_SESSION_RATE.windowMs,
        );
        if (!gate.allowed) {
          const rl = rateLimitResponse(
            gate.retryAfterSec,
            "Voice session limit reached for this organisation. Please try again later.",
          );
          return NextResponse.json(rl.body, { status: rl.status, headers: rl.headers });
        }
      }

      // ── 3. Plan limit: voice must be enabled on the org's plan — BEFORE
      // any vendor credential is touched.
      if (orgId) {
        const voiceGuard = await planGuard(orgId, "voice");
        if (!voiceGuard.allowed) {
          const blocked = voiceGuard as { reason: string };
          return NextResponse.json(
            { error: "plan_limit_exceeded", code: "voice_not_enabled", message: blocked.reason },
            { status: 402 }
          );
        }
      }

          // scope:"draft" — the authenticated agent preview resolves against
    // the CURRENT Main-branch draft instead of the immutable published
    // version (KB overrides apply; the LIVE collection is searched).
      const resolved = await resolveAIConfig({ kbId, surface: "realtime", ...(body?.scope === "draft" ? { preferDraft: true } : {}) });
      if (resolved.provider !== "gemini") {
        return NextResponse.json(
          {
            error: "Resolved voice provider is not Gemini for this knowledge base.",
            provider: resolved.provider,
          },
          { status: 409 },
        );
      }

      if (!resolved.assistantConfig) {
        return NextResponse.json(
          { error: "Assistant configuration not found for this knowledge base" },
          { status: 500 },
        );
      }

      rawModel = resolved.realtimeModel ?? rawModel;
      voice = resolved.voiceId ?? voice;
      instructions = buildSystemPrompt(resolved.assistantConfig, { kbName: kb.name });
    } else {
      // No KB context: still rate-limit by caller IP before anything else.
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        ?? request.headers.get("x-real-ip") ?? "unknown";
      const gate = hit(`realtime:ip:${ip}`, REALTIME_SESSION_RATE.limit, REALTIME_SESSION_RATE.windowMs);
      if (!gate.allowed) {
        const rl = rateLimitResponse(
          gate.retryAfterSec,
          "Voice session limit reached. Please try again later.",
        );
        return NextResponse.json(rl.body, { status: rl.status, headers: rl.headers });
      }
    }

    // The authenticated live provider catalogue is authoritative. A stale env,
    // agent, or org model must not be sent to Gemini just because it was once
    // present in a compile-time list.
    const liveRealtimeModels = (await listProviderModels("gemini", "realtime_voice"))
      .filter((item) => item.enabled && item.kind === "realtime");
    if (liveRealtimeModels.length === 0) {
      return NextResponse.json(
        { error: "No Gemini realtime models are currently advertised for this API key. Refresh provider discovery and verify the Gemini credential." },
        { status: 503 },
      );
    }
    const liveIds = new Set(liveRealtimeModels.map((item) => item.modelId.replace(/^models\//, "")));
    const normalizedRequested = rawModel.replace(/^models\//, "");
    if (!normalizedRequested || !liveIds.has(normalizedRequested)) {
      const ranked = [...liveRealtimeModels].sort((a, b) => {
        const aRelease = typeof a.metadata.releaseDate === "string" ? a.metadata.releaseDate : "";
        const bRelease = typeof b.metadata.releaseDate === "string" ? b.metadata.releaseDate : "";
        if (aRelease !== bRelease) return bRelease.localeCompare(aRelease);
        return a.modelId.localeCompare(b.modelId);
      });
      rawModel = ranked.find((item) => item.isDefault)?.modelId ?? ranked[0]!.modelId;
    } else {
      rawModel = normalizedRequested;
    }

    // Model name — normalise to include "models/" prefix if absent.
    const model = rawModel.startsWith("models/") ? rawModel : `models/${rawModel}`;

    // ── 4. Vendor credential presence — checked only AFTER auth/rate/plan so
    // authorisation failures never reach the vendor credential path.
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "GEMINI_API_KEY is not set on the server. " +
            "Add it to your .env file and restart the dev server.",
        },
        { status: 500 }
      );
    }

    // ── 5. Mint the relay capability token. The vendor key itself is never
    // returned: the relay reads it from env server-side when the browser
    // connects with this token.
    const token = mintGeminiRealtimeToken({
      kbId: kbId ?? "none",
      orgId: orgId ?? "none",
    });

    return NextResponse.json({
      provider: "gemini",
      realtime: {
        endpoint: "/api/voice/gemini/realtime",
        token,
      },
      model,
      voice,
      kbId,
      instructions,
      language: languagePreferences,
      inputSampleRate: LIVE_INPUT_SAMPLE_RATE,
      outputSampleRate: LIVE_OUTPUT_SAMPLE_RATE,
    });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    if (error instanceof AIConfigResolutionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
