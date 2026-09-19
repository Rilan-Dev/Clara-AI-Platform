/**
 * src/modules/language-core/api/translate.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Language-service routes (V4):
 *
 *   POST /api/language/translate      — text translation (query or answer)
 *   POST /api/language/transliterate  — romanized ↔ native script conversion
 *   POST /api/language/identify       — language identification
 *
 * Guard ladder (all three, mirroring the voice-core discipline):
 *   auth (JWT session) → SARVAM_TRANSLATE_RATE (30/min/org) →
 *   planGuard("translation") → kill switch (SARVAM_TRANSLATION_ENABLED) →
 *   caps → vendor call → TRANSLATION metering.
 *
 * Data boundary: only the submitted text crosses the Sarvam boundary — the
 * org has explicitly opted into cross-lingual RAG via translation_mode.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query as dbQuery } from "@/lib/db";
import { planGuard } from "@/lib/plan-guard";
import { hit, rateLimitResponse, SARVAM_TRANSLATE_RATE } from "@/lib/rate-limit";
import { isValidUuid } from "@/modules/voice-core/model-catalog";
import {
  isLanguageServiceEnabled,
  isSupportedTranslateModel,
  getPlatformDefaultTranslateModel,
  TRANSLATION_QUERY_MAX_CHARS,
  TRANSLITERATION_MAX_CHARS,
  toTranslateLanguageCode,
} from "../model-catalog";
import { LanguageProviderFactory } from "../factory";
import { SarvamLanguageError } from "../providers/sarvam";
import { logTranslationUsage, logTransliterationUsage, logIdentificationUsage } from "../pricing";

function clientOrgKey(request: NextRequest): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip") ?? "unknown";
  return `ip:${ip}`;
}

/**
 * Org scoping for the rate bucket + plan budget: derived from the optional
 * kbId (the voice-route discipline) — the shared User type carries no orgId.
 * Unauthenticated/anonymous callers fall back to IP-keyed buckets.
 */
async function resolveOrgFromKb(kbId: unknown): Promise<string | null> {
  if (typeof kbId !== "string" || !isValidUuid(kbId)) return null;
  try {
    const rows = await dbQuery<{ org_id: string }>(
      `SELECT a.org_id FROM agents a JOIN knowledge_bases kb ON kb.agent_id = a.id WHERE kb.id = $1`,
      [kbId],
    );
    return rows[0]?.org_id ?? null;
  } catch {
    return null;
  }
}

async function guardAndMeter(
  request: NextRequest,
  characters: number,
  orgId: string | null,
): Promise<NextResponse | null> {
  // Rate bucket (org-keyed when authenticated, IP-keyed otherwise).
  const gate = hit(
    `sv-translate:${orgId ? `org:${orgId}` : clientOrgKey(request)}`,
    SARVAM_TRANSLATE_RATE.limit,
    SARVAM_TRANSLATE_RATE.windowMs,
  );
  if (!gate.allowed) {
    const rl = rateLimitResponse(gate.retryAfterSec, "Language-service rate limit reached. Please slow down.");
    return NextResponse.json(rl.body, { status: rl.status, headers: rl.headers });
  }

  // Rolling-24 h translation budget (dormant until operators set plan values).
  if (orgId) {
    const guard = await planGuard(orgId, "translation");
    if (!guard.allowed) {
      const blocked = guard as { reason: string };
      return NextResponse.json(
        { error: "plan_limit_exceeded", code: "translation_limit_reached", message: blocked.reason },
        { status: 402 },
      );
    }
  }
  return null;
}

// ─── POST /api/language/translate ─────────────────────────────────────────────

export async function postTranslate(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const body = await request.json().catch(() => null) as {
      input?: string;
      sourceLanguageCode?: string;
      targetLanguageCode?: string;
      model?: string;
      kbId?: string;
    } | null;
    const orgId = await resolveOrgFromKb(body?.kbId);
    if (!body || typeof body.input !== "string" || !body.input.trim()) {
      return NextResponse.json({ error: "input is required." }, { status: 400 });
    }

    const input = body.input.trim().slice(0, TRANSLATION_QUERY_MAX_CHARS);
    if (input.length > TRANSLATION_QUERY_MAX_CHARS) {
      return NextResponse.json(
        { error: `Input too long. Maximum is ${TRANSLATION_QUERY_MAX_CHARS} characters.` },
        { status: 413 },
      );
    }

    const denied = await guardAndMeter(request, input.length, orgId);
    if (denied) return denied;

    if (!isLanguageServiceEnabled()) {
      return NextResponse.json(
        { error: "Language services are not available on this platform (SARVAM_TRANSLATION_ENABLED is off or the API key is not configured)." },
        { status: 503 },
      );
    }

    const model = typeof body.model === "string" && isSupportedTranslateModel(body.model)
      ? body.model
      : getPlatformDefaultTranslateModel();

    const service = LanguageProviderFactory.getLanguageService();
    const startedAt = Date.now();
    const result = await service.translate({
      input,
      sourceLanguageCode: toTranslateLanguageCode(body.sourceLanguageCode),
      targetLanguageCode: toTranslateLanguageCode(body.targetLanguageCode),
      model,
    });
    const latencyMs = Date.now() - startedAt;

    await logTranslationUsage({
      orgId,
      kbId: typeof body.kbId === "string" ? body.kbId : null,
      model,
      latencyMs,
      characters: input.length,
      sourceLanguageCode: toTranslateLanguageCode(body.sourceLanguageCode),
      targetLanguageCode: toTranslateLanguageCode(body.targetLanguageCode),
    });

    return NextResponse.json({
      translatedText: result.translatedText,
      model: result.model,
      characters: input.length,
    });
  } catch (error) {
    console.error("[language-translate] post:", error);
    if (error instanceof SarvamLanguageError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// ─── POST /api/language/transliterate ─────────────────────────────────────────

export async function postTransliterate(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const body = await request.json().catch(() => null) as {
      input?: string;
      languageCode?: string;
      targetScript?: "romanized" | "native";
      kbId?: string;
    } | null;
    const orgId = await resolveOrgFromKb(body?.kbId);
    if (!body || typeof body.input !== "string" || !body.input.trim()) {
      return NextResponse.json({ error: "input is required." }, { status: 400 });
    }
    if (body.input.length > TRANSLITERATION_MAX_CHARS) {
      return NextResponse.json(
        { error: `Input too long. Maximum is ${TRANSLITERATION_MAX_CHARS} characters.` },
        { status: 413 },
      );
    }

    const denied = await guardAndMeter(request, body.input.length, orgId);
    if (denied) return denied;

    if (!isLanguageServiceEnabled()) {
      return NextResponse.json(
        { error: "Language services are not available on this platform (SARVAM_TRANSLATION_ENABLED is off or the API key is not configured)." },
        { status: 503 },
      );
    }

    const service = LanguageProviderFactory.getLanguageService();
    const startedAt = Date.now();
    const result = await service.transliterate({
      input: body.input,
      languageCode: toTranslateLanguageCode(body.languageCode),
      targetScript: body.targetScript === "romanized" ? "romanized" : "native",
    });
    const latencyMs = Date.now() - startedAt;

    await logTransliterationUsage({
      orgId,
      kbId: typeof body.kbId === "string" ? body.kbId : null,
      model: "transliterate",
      latencyMs,
      characters: body.input.length,
      languageCode: toTranslateLanguageCode(body.languageCode),
    });

    return NextResponse.json({ transliteratedText: result.transliteratedText });
  } catch (error) {
    console.error("[language-transliterate] post:", error);
    if (error instanceof SarvamLanguageError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// ─── POST /api/language/identify ──────────────────────────────────────────────

export async function postIdentify(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const body = await request.json().catch(() => null) as {
      input?: string;
      kbId?: string;
    } | null;
    const orgId = await resolveOrgFromKb(body?.kbId);
    if (!body || typeof body.input !== "string" || !body.input.trim()) {
      return NextResponse.json({ error: "input is required." }, { status: 400 });
    }
    if (body.input.length > TRANSLITERATION_MAX_CHARS) {
      return NextResponse.json(
        { error: `Input too long. Maximum is ${TRANSLITERATION_MAX_CHARS} characters.` },
        { status: 413 },
      );
    }

    const denied = await guardAndMeter(request, body.input.length, orgId);
    if (denied) return denied;

    if (!isLanguageServiceEnabled()) {
      return NextResponse.json(
        { error: "Language services are not available on this platform (SARVAM_TRANSLATION_ENABLED is off or the API key is not configured)." },
        { status: 503 },
      );
    }

    const service = LanguageProviderFactory.getLanguageService();
    const startedAt = Date.now();
    const result = await service.identifyLanguage(body.input);
    const latencyMs = Date.now() - startedAt;

    await logIdentificationUsage({
      orgId,
      kbId: typeof body.kbId === "string" ? body.kbId : null,
      model: "identify-language",
      latencyMs,
      characters: body.input.length,
    });

    return NextResponse.json({
      languageCode: result.languageCode,
      confidence: result.confidence,
    });
  } catch (error) {
    console.error("[language-identify] post:", error);
    if (error instanceof SarvamLanguageError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
