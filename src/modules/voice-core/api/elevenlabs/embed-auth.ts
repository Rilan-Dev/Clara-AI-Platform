/**
 * src/modules/voice-core/api/elevenlabs/embed-auth.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Optional embed-key validation for the Mode A pipeline routes
 * (/api/voice/elevenlabs/{session,tts,transcribe}).
 *
 * The Mode A pipeline historically booted with a platform JWT (the in-app
 * floating assistant + workspace voice modal). Embed surfaces (the public
 * /embed/voice screen and the /embed/widget mic button) authenticate with a
 * clr_ API key instead — same credential every other /api/embed/* route uses.
 *
 * Deliberately LIGHTER than validateEmbedRequest():
 *   • no per-call hourly-rate increment — a single voice session fires many
 *     per-sentence TTS calls and would drain the key's hourly API budget;
 *     the dedicated ELEVENLABS_STT_RATE / TTS rate buckets + planGuard
 *     already throttle these routes per org
 *   • no daily-quota admission — the embedding page's own chat/session calls
 *     carry the quota; the pipeline's /api/embed/chat turn is counted there
 *     like any other embed chat request
 *   • key → (kbId, orgId, allowedOrigins) resolution + origin check only,
 *     TTL-cached (5 s) because these routes fire per utterance/sentence
 *
 * Anything that is NOT a clr_ bearer token (platform JWT, no auth) keeps the
 * routes' existing behaviour — resolution + rate limits + planGuard.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/modules/embed/core/api-keys-db";
import { isOriginAllowedForEmbed } from "@/modules/embed/core/validate-embed";
import type { ValidatedKey } from "@/modules/embed/core/api-keys-db";

const CACHE_TTL_MS = 5_000;
const keyCache = new Map<string, { expiresAt: number; value: ValidatedKey | null }>();

/**
 * Same canonical origin policy as every other /api/embed/* route
 * (isOriginAllowedForEmbed): empty list or "*" → unrestricted, localhost and
 * same-origin always allowed, otherwise exact / "*.sub.domain" match with an
 * http ⇄ https alternate. Previously this guard had its own stricter policy
 * (empty list = nothing allowed), which made Mode A routes reject origins
 * that /api/embed/chat happily accepted for the same key.
 */
function isOriginAllowed(origin: string | null, allowedOrigins: string[], selfOrigin: string): boolean {
  return isOriginAllowedForEmbed(origin, allowedOrigins, selfOrigin);
}

/**
 * Resolves an embed API key from the request's Authorization header.
 * Returns null when the request carries a platform JWT or no credentials —
 * callers keep their existing behaviour in that case.
 */
export async function resolveEmbedVoiceKey(request: NextRequest): Promise<ValidatedKey | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer clr_")) return null;
  const rawKey = authHeader.slice(7).trim();
  if (!rawKey) return null;

  const hit = keyCache.get(rawKey);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const value = await validateApiKey(rawKey);
  keyCache.set(rawKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  if (keyCache.size > 256) {
    const now = Date.now();
    for (const [k, entry] of keyCache) {
      if (entry.expiresAt <= now) keyCache.delete(k);
    }
  }
  return value;
}

/**
 * Validates an embed-authenticated Mode A request against a KB id.
 * Returns a 403 response when the key is invalid, revoked, scoped to a
 * different KB, or the request origin is not allowed for the key —
 * otherwise null (caller proceeds).
 */
export async function embedVoiceGuard(
  request: NextRequest,
  kbId: string,
): Promise<NextResponse | null> {
  const key = await resolveEmbedVoiceKey(request);
  if (!key) {
    return NextResponse.json(
      { error: "Invalid or revoked embed API key." },
      { status: 403 },
    );
  }
  if (key.kbId !== kbId) {
    return NextResponse.json(
      { error: "This embed API key is not valid for the requested knowledge base." },
      { status: 403 },
    );
  }
  const origin = request.headers.get("origin");
  if (!isOriginAllowed(origin, key.allowedOrigins, request.nextUrl.origin)) {
    return NextResponse.json(
      { error: `Origin "${origin}" is not in the allowed origins for this API key.` },
      { status: 403 },
    );
  }
  return null;
}
