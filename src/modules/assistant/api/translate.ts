/**
 * src/modules/assistant/api/translate.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Message translation for the agent conversation surfaces: the visitor picks
 * a language on any assistant message and gets it translated.
 *
 *   POST /api/translate        signed-in workspace / draft preview
 *   POST /api/embed/translate  published agent page / embed (public token)
 *
 * Body: { kbId?, text, targetLanguage, scope?: "draft" }
 *
 * Tenant rules, nothing hardcoded:
 *   • the target must be one of the assistant's allowed languages (plus its
 *     default) — the same boundary the assistant speaks within;
 *   • translation runs on the tenant's own chat model (AI Assistant
 *     settings), so any provider works;
 *   • rate-limited per organisation.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireKbPermission } from "@/modules/auth/core/rbac";
import { validateEmbedRequest, buildCorsHeaders } from "@/modules/embed/core/validate-embed";
import { getAssistantConfigByKb } from "@/modules/knowledge-bases/core/db";
import { resolveAIConfig, toProviderConfig } from "@/modules/ai-core/resolve";
import { hit, rateLimitResponse } from "@/lib/rate-limit";
import { translateText } from "@/modules/rag/cross-lingual";
import { baseLanguageCode, normalizeLanguagePolicy } from "@/modules/assistant/core/language-policy";

const MAX_TEXT_CHARS = 6000;
const RATE = { limit: 60, windowMs: 60_000 };

type Body = { kbId?: string; text?: string; targetLanguage?: string; scope?: string };

async function translateFor(
  kbId: string,
  orgId: string | null,
  body: Body,
  headers: Record<string, string>,
): Promise<NextResponse> {
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const target = baseLanguageCode(body.targetLanguage);
  if (!text) return NextResponse.json({ error: "text is required" }, { status: 400, headers });
  if (text.length > MAX_TEXT_CHARS) {
    return NextResponse.json({ error: `text is limited to ${MAX_TEXT_CHARS} characters` }, { status: 413, headers });
  }
  if (!target) return NextResponse.json({ error: "targetLanguage is required" }, { status: 400, headers });

  const config = await getAssistantConfigByKb(kbId);
  const policy = normalizeLanguagePolicy({
    defaultLanguage: config?.defaultLanguage,
    allowedLanguages: config?.allowedLanguages,
  });
  if (!policy.allowedLanguages.includes(target)) {
    return NextResponse.json(
      { error: "This language is not enabled for this assistant.", allowedLanguages: policy.allowedLanguages },
      { status: 400, headers },
    );
  }

  const gate = hit(`translate:${orgId ?? `kb:${kbId}`}`, RATE.limit, RATE.windowMs);
  if (!gate.allowed) {
    const rl = rateLimitResponse(gate.retryAfterSec, "Too many translations. Please try again shortly.");
    return NextResponse.json(rl.body, { status: rl.status, headers: { ...headers, ...rl.headers } });
  }

  const resolved = await resolveAIConfig({
    kbId,
    surface: "chat",
    ...(body.scope === "draft" ? { preferDraft: true } : {}),
  });
  const translated = await translateText(text, target, { providerConfig: toProviderConfig(resolved) });
  if (!translated) {
    return NextResponse.json({ error: "The translation could not be completed. Please try again." }, { status: 502, headers });
  }
  return NextResponse.json({ translatedText: translated, language: target }, { headers });
}

/** Signed-in surfaces (workspace, draft preview). */
export async function postTranslate(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    const kbId = typeof body.kbId === "string" ? body.kbId.trim() : "";
    if (!kbId) return NextResponse.json({ error: "kbId is required" }, { status: 400 });
    const auth = await requireAuth(request);
    const access = await requireKbPermission(auth, kbId, "kb:read");
    return await translateFor(kbId, access.orgId, body, {});
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("[translate] post:", error);
    return NextResponse.json({ error: "The translation could not be completed." }, { status: 500 });
  }
}

/** Published agent page / embed (public session token or embed key). */
export async function postEmbedTranslate(request: NextRequest): Promise<NextResponse> {
  const validation = await validateEmbedRequest(request);
  if (!validation.ok) return validation.response;
  const { ctx } = validation;
  const headers = buildCorsHeaders(request.headers.get("origin"), ctx.allowedOrigins, request.nextUrl.origin);
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    // The embed credential is KB-scoped: never trust a kbId from the body.
    return await translateFor(ctx.kbId, ctx.orgId ?? null, { ...body, scope: undefined }, headers);
  } catch (error) {
    console.error("[translate] embed:", error);
    return NextResponse.json({ error: "The translation could not be completed." }, { status: 500, headers });
  }
}
