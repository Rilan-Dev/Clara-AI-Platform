/**
 * src/modules/voice-core/api/elevenlabs/voices.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Voice catalog endpoints.
 *
 *   GET  /api/voice/elevenlabs/voices            — org's synced catalog (DB)
 *   POST /api/voice/elevenlabs/voices/sync       — admin: sync workspace
 *                                                   voices into elevenlabs_voices
 *   POST /api/voice/elevenlabs/voices/preview    — TTS preview (capped, metered)
 *   POST /api/voice/elevenlabs/voices/clone      — instant cloning (V5,
 *                                                   flag-gated, consent required)
 *   POST /api/voice/elevenlabs/voices/design     — Voice Design (V5, flag-gated)
 *
 * Org catalog rows hold voice IDs + labels only — voice definitions and
 * audio stay at the vendor. The sync endpoint is the ONLY path that reads
 * the workspace list, and it requires an admin session.
 *
 * Cloning consent (plan §11.7): an explicit, timestamped attestation is
 * REQUIRED — UI checkbox + acting admin id + audited row. Unattested
 * clones are rejected before any vendor call.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query as dbQuery } from "@/lib/db";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import {
  TTS_PREVIEW_MAX_CHARS,
  isVoiceCloningEnabled,
  isVoiceDesignEnabled,
  isValidUuid,
} from "../../model-catalog";
import { VoiceProviderFactory } from "../../factory";
import { ElevenLabsError } from "../../providers/elevenlabs";
import { isConversationalVoiceService } from "../../types";
import { logTtsUsage } from "../../metering";

export interface ElevenLabsVoiceRow {
  id: string;
  voiceId: string;
  name: string;
  category: string | null;
  labels: Record<string, string>;
  description: string | null;
  cloned: boolean;
  createdAt: string;
}

// ─── GET: org catalog ────────────────────────────────────────────────────────

export async function getElevenLabsVoices(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    await requireAuth(request);

    const url = new URL(request.url);
    const orgId = url.searchParams.get("orgId")?.trim() || null;

    // Platform admins may query any org; org users are scoped by middleware
    // role checks upstream — this endpoint is admin-console only.
    if (!orgId) {
      return NextResponse.json({ voices: [], models: [] });
    }

    const rows = await dbQuery<{
      id: string; voice_id: string; name: string; category: string | null;
      labels: unknown; description: string | null; cloned: boolean; created_at: string;
    }>(
      `SELECT id, voice_id, name, category, labels, description, cloned, created_at
         FROM elevenlabs_voices
        WHERE org_id = $1
        ORDER BY name`,
      [orgId],
    );

    const voices: ElevenLabsVoiceRow[] = rows.map((row) => {
      const labels: Record<string, string> = {};
      if (row.labels && typeof row.labels === "object" && !Array.isArray(row.labels)) {
        for (const [key, value] of Object.entries(row.labels as Record<string, unknown>)) {
          if (typeof value === "string") labels[key] = value;
        }
      }
      return {
        id: String(row.id),
        voiceId: row.voice_id,
        name: row.name,
        category: row.category,
        labels,
        description: row.description,
        cloned: Boolean(row.cloned),
        createdAt: String(row.created_at),
      };
    });

    return NextResponse.json({
      voices,
      enabled: await isElevenLabsEnabled(),
    });
  } catch (error) {
    console.error("[elevenlabs-voices] get:", error);
    if (error instanceof NextResponse) return error;
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// ─── POST /sync: pull the workspace voice list into the org catalog ──────────

export async function postElevenLabsVoicesSync(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(request);
    await requireSuperAdmin(auth);

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const orgId = typeof body.orgId === "string" ? body.orgId.trim() : null;
    if (!orgId) {
      return NextResponse.json({ error: "orgId is required." }, { status: 400 });
    }

    if (!(await isElevenLabsEnabled())) {
      return NextResponse.json(
        { error: "ElevenLabs is disabled in Platform AI Settings or its API key is not configured." },
        { status: 503 },
      );
    }

    const workspaceVoices = await VoiceProviderFactory.getVoiceService().listVoices();
    if (workspaceVoices.length === 0) {
      return NextResponse.json({ synced: 0, voices: [] });
    }

    // Upsert each voice. Voice definitions stay at the vendor — only ids,
    // names, labels are catalogued here (data minimisation).
    for (const voice of workspaceVoices) {
      if (!voice.voiceId) continue;
      await dbQuery(
        `INSERT INTO elevenlabs_voices (org_id, voice_id, name, category, labels, description, added_by)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
         ON CONFLICT (org_id, voice_id)
         DO UPDATE SET name = EXCLUDED.name,
                       category = EXCLUDED.category,
                       labels = EXCLUDED.labels,
                       description = EXCLUDED.description,
                       updated_at = now()`,
        [
          orgId,
          voice.voiceId,
          voice.name,
          voice.category,
          JSON.stringify(voice.labels ?? {}),
          voice.description,
          auth.user.id,
        ],
      );
    }

    return NextResponse.json({ synced: workspaceVoices.length });
  } catch (error) {
    console.error("[elevenlabs-voices] sync:", error);
    if (error instanceof NextResponse) return error;
    if (error instanceof ElevenLabsError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// ─── POST /preview: TTS preview (capped, metered, flagged) ──────────────────

export async function postElevenLabsVoicePreview(request: NextRequest): Promise<NextResponse | Response> {
  try {
    await ensureMigrated();
    await requireAuth(request);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const voiceId = typeof body.voiceId === "string" ? body.voiceId.trim() : "";
    const text = typeof body.text === "string" ? body.text.trim().slice(0, TTS_PREVIEW_MAX_CHARS) : "";
    const orgId = typeof body.orgId === "string" ? body.orgId.trim() : null;
    const modelId = typeof body.modelId === "string" && body.modelId.trim() ? body.modelId.trim() : "eleven_flash_v2_5";

    if (!voiceId || !text) {
      return NextResponse.json({ error: "voiceId and text are required." }, { status: 400 });
    }

    if (!isElevenLabsEnabled()) {
      return NextResponse.json(
        { error: "ElevenLabs is not enabled on this platform (missing API key or kill switch off)." },
        { status: 503 },
      );
    }

    // Voice ids are opaque strings validated against the DB catalog first
    // (SSRF/no-injection discipline — plan §11.4).
    if (orgId) {
      const owned = await dbQuery<{ voice_id: string }>(
        `SELECT voice_id FROM elevenlabs_voices WHERE org_id = $1 AND voice_id = $2
         UNION
         SELECT voice_id FROM organisation_voices WHERE org_id = $1 AND voice_id = $2 AND provider = 'elevenlabs'`,
        [orgId, voiceId],
      );
      if (owned.length === 0) {
        return NextResponse.json({ error: "Voice is not in this organisation's catalog." }, { status: 404 });
      }
    }

    const service = VoiceProviderFactory.getVoiceService();
    const started = Date.now();
    const audio = await service.speak({
      text,
      voiceId,
      modelId,
      outputFormat: "mp3_44100_128",
    });

    // Preview metering: cheap, flagged — visible in dashboards as TTS usage.
    void logTtsUsage({
      orgId,
      kbId: null,
      agentId: null,
      model: modelId,
      characters: text.length,
      preview: true,
      latencyMs: Date.now() - started,
    });

    return new Response(audio.body, {
      status: 200,
      headers: {
        "Content-Type": audio.headers.get("content-type") ?? "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[elevenlabs-voices] preview:", error);
    if (error instanceof NextResponse) return error;
    if (error instanceof ElevenLabsError) {
      return NextResponse.json({ error: error.message }, { status: error.status >= 400 && error.status < 600 ? error.status : 502 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// ─── POST /clone: instant cloning (V5, consent-gated) ───────────────────────

export async function postElevenLabsVoiceClone(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(request);
    await requireSuperAdmin(auth);

    if (!isElevenLabsEnabled()) {
      return NextResponse.json(
        { error: "ElevenLabs is not enabled on this platform (missing API key or kill switch off)." },
        { status: 503 },
      );
    }
    if (!isVoiceCloningEnabled()) {
      return NextResponse.json(
        { error: "Voice cloning is disabled on this platform (ELEVENLABS_VOICE_CLONING_ENABLED is off)." },
        { status: 404 },
      );
    }

    const form = await request.formData();
    const orgId = String(form.get("orgId") ?? "").trim();
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim() || null;
    const consentConfirmed = form.get("consentConfirmed") === "true" || form.get("consentConfirmed") === "on";
    const consentName = String(form.get("consentName") ?? "").trim();
    const consentRelationship = String(form.get("consentRelationship") ?? "").trim();
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

    if (!orgId || !name) {
      return NextResponse.json({ error: "orgId and name are required." }, { status: 400 });
    }
    if (!isValidUuid(orgId)) {
      return NextResponse.json({ error: "orgId must be a UUID." }, { status: 400 });
    }

    // ── Consent gate (plan §14 V5 acceptance: unattested clones blocked) ────
    if (!consentConfirmed || !consentName || !consentRelationship) {
      return NextResponse.json(
        {
          error:
            "Voice cloning requires an explicit consent attestation: confirm consent, " +
            "the consenting person's name, and your relationship to them.",
          code: "consent_required",
        },
        { status: 400 },
      );
    }
    if (files.length === 0) {
      return NextResponse.json(
        { error: "At least one reference audio file is required." },
        { status: 400 },
      );
    }

    const service = VoiceProviderFactory.getVoiceService();
    if (!isConversationalVoiceService(service)) {
      return NextResponse.json({ error: "Voice provider does not support cloning." }, { status: 501 });
    }

    // Tier check — mirrors the status card's canUseInstantCloning flag.
    const subscription = await service.getSubscriptionInfo();
    if (!subscription.canUseInstantCloning) {
      return NextResponse.json(
        { error: `The ElevenLabs ${subscription.tier} plan does not permit instant cloning.` },
        { status: 403 },
      );
    }

    const result = await service.cloneVoice({
      name,
      description,
      files: files.map((file) => ({ blob: file, filename: file.name || "reference.webm" })),
      labels: { cloned: "true", useCase: "brandVoice" },
    });

    // Catalog row with the timestamped attestation (elevenlabs_voices.
    // consent_attested_at) — the audit trail for the legal exposure.
    await dbQuery(
      `INSERT INTO elevenlabs_voices
         (org_id, voice_id, name, category, labels, description, cloned, consent_attested_at, added_by, metadata)
       VALUES ($1, $2, $3, 'cloned', $4::jsonb, $5, TRUE, now(), $6, $7::jsonb)
       ON CONFLICT (org_id, voice_id)
       DO UPDATE SET name = EXCLUDED.name,
                     cloned = TRUE,
                     consent_attested_at = now(),
                     updated_at = now()`,
      [
        orgId,
        result.voiceId,
        name,
        JSON.stringify({ cloned: "true" }),
        description,
        auth.user.id,
        JSON.stringify({
          consentAttestedBy: auth.user.id,
          consentName,
          consentRelationship,
          requiresVerification: result.requiresVerification,
        }),
      ],
    );

    // The consent attestation is itself an audited admin action (§11.7).
    await dbQuery(
      `INSERT INTO subscription_audit_log (org_id, actor_user_id, actor_label, action, metadata)
       VALUES ($1, $2, 'admin', 'elevenlabs_voice_cloned', $3::jsonb)`,
      [orgId, auth.user.id, JSON.stringify({ voiceId: result.voiceId, name, consentName, consentRelationship })],
    );

    return NextResponse.json({ voiceId: result.voiceId, requiresVerification: result.requiresVerification }, { status: 201 });
  } catch (error) {
    console.error("[elevenlabs-voices] clone:", error);
    if (error instanceof NextResponse) return error;
    if (error instanceof ElevenLabsError) {
      return NextResponse.json({ error: error.message }, { status: error.status >= 400 && error.status < 600 ? error.status : 502 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// ─── POST /design: Voice Design (V5, flag-gated, TTS-metered) ───────────────

export async function postElevenLabsVoiceDesign(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(request);
    await requireSuperAdmin(auth);

    if (!isElevenLabsEnabled()) {
      return NextResponse.json(
        { error: "ElevenLabs is not enabled on this platform (missing API key or kill switch off)." },
        { status: 503 },
      );
    }
    if (!isVoiceDesignEnabled()) {
      return NextResponse.json(
        { error: "Voice Design is disabled on this platform (ELEVENLABS_VOICE_DESIGN_ENABLED is off)." },
        { status: 404 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const orgId = typeof body.orgId === "string" ? body.orgId.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const textPrompt = typeof body.textPrompt === "string" ? body.textPrompt.trim().slice(0, 1000) : "";

    if (!orgId || !name || !textPrompt) {
      return NextResponse.json({ error: "orgId, name and textPrompt are required." }, { status: 400 });
    }
    if (!isValidUuid(orgId)) {
      return NextResponse.json({ error: "orgId must be a UUID." }, { status: 400 });
    }

    const service = VoiceProviderFactory.getVoiceService();
    if (!isConversationalVoiceService(service)) {
      return NextResponse.json({ error: "Voice provider does not support Voice Design." }, { status: 501 });
    }

    const result = await service.designVoice({ name, textPrompt });

    await dbQuery(
      `INSERT INTO elevenlabs_voices
         (org_id, voice_id, name, category, labels, description, added_by, metadata)
       VALUES ($1, $2, $3, 'designed', $4::jsonb, $5, $6, $7::jsonb)
       ON CONFLICT (org_id, voice_id)
       DO UPDATE SET name = EXCLUDED.name,
                     description = EXCLUDED.description,
                     updated_at = now()`,
      [
        orgId,
        result.voiceId,
        name,
        JSON.stringify({ designed: "true" }),
        textPrompt,
        auth.user.id,
        JSON.stringify({ sampleMediaIds: result.sampleMediaIds }),
      ],
    );

    // Design generates samples — metered as TTS usage (plan §6).
    void logTtsUsage({
      orgId,
      kbId: null,
      agentId: null,
      model: "voice_design",
      characters: textPrompt.length,
    });

    return NextResponse.json(
      { voiceId: result.voiceId, sampleMediaIds: result.sampleMediaIds },
      { status: 201 },
    );
  } catch (error) {
    console.error("[elevenlabs-voices] design:", error);
    if (error instanceof NextResponse) return error;
    if (error instanceof ElevenLabsError) {
      return NextResponse.json({ error: error.message }, { status: error.status >= 400 && error.status < 600 ? error.status : 502 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
