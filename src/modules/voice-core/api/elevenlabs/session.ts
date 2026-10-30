import { isElevenLabsRealtimeEnabled } from "@/modules/voice-core/server-provider-availability";
import { localizeText } from "@/modules/rag/cross-lingual";
/**
 * src/modules/voice-core/api/elevenlabs/session.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/voice/elevenlabs/session — Mode A pipeline bootstrap.
 *
 * Guard discipline mirrors src/modules/assistant/api/realtime.ts exactly:
 *   1. resolve org from kbId
 *   2. REALTIME_SESSION_RATE (10 / hour / org) — same bucket as the other
 *      providers, so switching providers does not multiply session budgets
 *   3. planGuard("voice") — 402 voice_not_enabled on free plans
 *   4. resolveVoiceConfig — surface flags + org allow-lists + kill switch
 *
 * Two callers:
 *   • platform sessions (floating assistant / workspace voice modal) — JWT
 *   • embed sessions (/embed/voice screen, /embed/widget mic) — clr_ API key;
 *     validated via embedVoiceGuard, and the returned chat descriptor points
 *     at /api/embed/chat so the whole pipeline runs on the embed credential.
 *
 * Returns capability descriptors ONLY — never keys. In Mode A the browser
 * talks exclusively to platform endpoints; CSP is unchanged.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query as dbQuery } from "@/lib/db";
import { planGuard } from "@/lib/plan-guard";
import { hit, rateLimitResponse, REALTIME_SESSION_RATE } from "@/lib/rate-limit";
import {
  STT_MAX_AUDIO_SECONDS,
  TTS_OUTPUT_FORMAT,
  getElevenLabsRealtimeSttModel,
  isValidUuid,
} from "../../model-catalog";
import { VoiceConfigResolutionError, resolveVoiceConfigCached } from "../../resolve";
import { AIConfigResolutionError } from "@/modules/ai-core/resolve";
import { mintElevenLabsRealtimeToken } from "./realtime-auth";
import { embedVoiceGuard } from "./embed-auth";
import { classifyVoicePipelineSession } from "../pipeline-chat-audience";
import { requireAuth, requireKbPermission } from "@/modules/auth/core/rbac";
import type { ElevenLabsSessionPayload } from "../../config-types";

export async function postElevenLabsSession(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const kbId = typeof body?.kbId === "string" ? body.kbId.trim() : null;
    const ragMode = typeof body?.ragMode === "string" ? body.ragMode : "hybrid";
    // One bootstrap endpoint serves two independent ElevenLabs surfaces:
    // Voice Chat (turn-based pipeline) and Realtime Voice (Clara Scribe/TTS).
    // Default to realtime for the existing Clara realtime hook; the legacy
    // voice-chat hook sends surface:"voice_chat" explicitly.
    const surface = body?.surface === "voice_chat" ? "voice_chat" : "realtime";

    if (!kbId || !isValidUuid(kbId)) {
      return NextResponse.json(
        { error: "A valid kbId is required for ElevenLabs voice sessions." },
        { status: 400 },
      );
    }

    await ensureMigrated();

    // Embed-authenticated sessions (clr_ API key): the key must be valid and
    // scoped to this KB before anything else runs. Platform JWT / anonymous
    // requests keep the historical path.
    const embedDenied = await embedVoiceGuard(request, kbId);
    if (embedDenied) return embedDenied;

    // Platform voice sessions must be tenant-authenticated. Public embed
    // sessions are the only exception and must carry a scoped clr_ API key.
    // Without this boundary, knowing a KB UUID would be enough to mint a
    // realtime capability token and consume ElevenLabs STT/TTS against that
    // organisation's plan.
    const audience = classifyVoicePipelineSession(request.headers.get("authorization"));
    const isEmbedSession = audience.isExternalSession;
    let authorizedOrgId: string | null = null;
    if (!isEmbedSession) {
      const auth = await requireAuth(request);
      const access = await requireKbPermission(auth, kbId, "kb:read");
      authorizedOrgId = access.orgId;
    }

    // Public embed sessions are already KB-scoped by embedVoiceGuard. For
    // authenticated platform sessions, requireKbPermission above also gives
    // us the authoritative tenant id, avoiding a second KB→agent lookup.
    const orgRows = authorizedOrgId
      ? [{ org_id: authorizedOrgId }]
      : await dbQuery<{ org_id: string }>(
          `SELECT a.org_id FROM agents a JOIN knowledge_bases kb ON kb.agent_id = a.id WHERE kb.id = $1`,
          [kbId],
        );
    const orgId = orgRows[0]?.org_id ?? null;

    // ── Same bucket as the other realtime providers ──
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

    if (orgId) {
      const voiceGuard = await planGuard(orgId, "voice");
      if (!voiceGuard.allowed) {
        const blocked = voiceGuard as { reason: string };
        return NextResponse.json(
          { error: "plan_limit_exceeded", code: "voice_not_enabled", message: blocked.reason },
          { status: 402 },
        );
      }
    }

    // Realtime-axis resolution: every consumer of this pipeline (the voice
    // modal via /api/voice/provider → useElevenLabsVoice, embed surfaces via
    // /api/embed/session) routes on the REALTIME purpose axis, so the session
    // must resolve on the same axis. Resolving on "voice_chat" starved the
    // ElevenLabs arm for orgs that pin realtime=elevenlabs while voice-chat
    // runs another provider (the guard accepted both axes, but the resolver
    // only populated the arm for the surface's own axis → 409).
        // scope:"draft" — the authenticated agent preview resolves against
    // the CURRENT Main-branch draft instead of the immutable published
    // version (KB overrides apply; the LIVE collection is searched).
    const resolved = await resolveVoiceConfigCached({ kbId, surface, ...(body.scope === "draft" ? { preferDraft: true } : {}) });
    const realtimeEnabled = surface === "realtime" && await isElevenLabsRealtimeEnabled();
    // The pipeline serves EITHER voice purpose: the voice-chat axis (Mode A
    // as the chat-window voice-chat experience) or the realtime axis (Mode A
    // as the fallback when a realtime=elevenlabs config has no Mode-B
    // binding, and the embed surfaces where Mode B is refused by design).
    const pipelineSelected =
      surface === "voice_chat"
        ? resolved.voiceProvider === "elevenlabs"
        : resolved.realtimeProvider === "elevenlabs";
    if (!pipelineSelected || !resolved.elevenlabs) {
      // Config raced (provider switched mid-flight) — tell the client to
      // re-resolve rather than silently using the wrong provider.
      return NextResponse.json(
        {
          error: "Voice provider resolved to a non-ElevenLabs provider for this knowledge base.",
          provider: resolved.realtimeProvider,
        },
        { status: 409 },
      );
    }

    const payload: ElevenLabsSessionPayload = {
      mode: realtimeEnabled && orgId ? "clara-stream" : "pipeline",
      stt: {
        endpoint: "/api/voice/elevenlabs/transcribe",
        model: resolved.elevenlabs.sttModel,
        language: resolved.elevenlabs.language,
        sampleRate: 16_000,
        maxAudioSeconds: STT_MAX_AUDIO_SECONDS,
        // Mode C (Clara realtime, plan Task 6.2): the Scribe realtime relay
        // descriptor — same HMAC token discipline as the Sarvam V5 relay.
        // Embed sessions get it too: the token is capability-scoped (kb+org),
        // never a vendor credential.
        ...((realtimeEnabled) && orgId
          ? {
              realtime: {
                endpoint: "/api/voice-realtime?channel=elevenlabs-stt",
                token: mintElevenLabsRealtimeToken({ kbId, orgId }),
                ttsEndpoint: "/api/voice-realtime?channel=elevenlabs-tts",
                sampleRate: 16_000,
                encoding: "linear16",
                model: getElevenLabsRealtimeSttModel(),
              },
            }
          : {}),
      },
      tts: {
        endpoint: "/api/voice/elevenlabs/tts",
        model: resolved.elevenlabs.ttsModel,
        voiceId: resolved.elevenlabs.voiceId,
        outputFormat: TTS_OUTPUT_FORMAT,
        voiceSettings: resolved.elevenlabs.voiceSettings,
      },
      chat: {
        // Published visitors use signed public chat, widget users use embed chat;
        // Preview and native workspace clients require tenant-authenticated chat.
        endpoint: audience.chatEndpoint,
        kbId,
        ragMode,
      },
      provider: "elevenlabs",
      kbId,
      ragMode,
    };

    // The conversation starts in the assistant's DEFAULT language: these
    // voices speak the welcome verbatim, so localise it when the admin wrote
    // it in another language (cached; falls back to the original text).
    const welcome = resolved.brain.assistantConfig?.welcomeMessage?.trim();
    if (welcome) {
      const startLanguage =
        resolved.brain.assistantConfig?.alwaysRespondIn?.trim() || resolved.brain.defaultLanguage || "en";
      payload.greeting = await localizeText(welcome, startLanguage);
    }
    return NextResponse.json(payload);
  } catch (error) {
    // RBAC helpers intentionally throw NextResponse to preserve the exact
    // authentication/authorization status. Do not turn a 401/403/404 into
    // an unrelated 500 at the session boundary.
    if (error instanceof NextResponse) return error;
    console.error("[elevenlabs-session] post:", error);
    if (error instanceof VoiceConfigResolutionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof AIConfigResolutionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
