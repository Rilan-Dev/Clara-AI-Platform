/**
 * src/modules/rag/cross-lingual.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Cross-lingual retrieval for the grounding path: a visitor may ask in any
 * language (Tamil, Hindi, Arabic, …) while the knowledge base documents are
 * written in another (usually English).
 *
 * Why it is needed: Qdrant ranks by cosine similarity of embeddings. A Tamil
 * question and the English FAQ that answers it embed far apart — well under
 * the 0.25 score threshold — so the search returns nothing and the turn is
 * reported `grounded: false`. OpenAI's embedding guide recommends searching
 * in the language of the indexed content; translating the query is the
 * reliable fix, and it keeps the threshold (weak matches must never become
 * grounding context).
 *
 * The grounding service searches with BOTH the original query and its
 * translation, in parallel, and keeps the best score per chunk — so a
 * same-language KB, or a KB that mixes languages, loses nothing.
 *
 * Translation order:
 *   1. Sarvam (identify → transliterate → translate) when the organisation
 *      enabled query translation in its AI settings — the org's choice wins.
 *   2. Otherwise one short completion on the tenant's embedding provider
 *      (OpenAI / Gemini — the same account that already embeds the query).
 * Every failure or timeout degrades to the untranslated search; results are
 * cached so a repeated question costs nothing.
 */

import type { ProviderConfig } from "@/modules/ai-core/types";
import { ProviderFactory } from "@/modules/ai-core/factory";
import { translateQueryForRag, type TranslationMode } from "@/modules/language-core/pipeline";

// ── Script → language candidates ─────────────────────────────────────────────
// Order matters: kana is checked before Han so Japanese is not read as Chinese.
const SCRIPT_LANGUAGES: Array<{ re: RegExp; languages: string[] }> = [
  { re: /[஀-௿]/, languages: ["ta"] },
  { re: /[ఀ-౿]/, languages: ["te"] },
  { re: /[ಀ-೿]/, languages: ["kn"] },
  { re: /[ഀ-ൿ]/, languages: ["ml"] },
  { re: /[ঀ-৿]/, languages: ["bn", "as"] },
  { re: /[઀-૿]/, languages: ["gu"] },
  { re: /[਀-੿]/, languages: ["pa"] },
  { re: /[଀-୿]/, languages: ["or"] },
  { re: /[ऀ-ॿ]/, languages: ["hi", "mr", "ne"] },
  { re: /[඀-෿]/, languages: ["si"] },
  { re: /[؀-ۿݐ-ݿ]/, languages: ["ar", "ur", "fa"] },
  { re: /[֐-׿]/, languages: ["he"] },
  { re: /[฀-๿]/, languages: ["th"] },
  { re: /[぀-ヿ]/, languages: ["ja"] },
  { re: /[가-힯ᄀ-ᇿ]/, languages: ["ko"] },
  { re: /[一-鿿]/, languages: ["zh", "ja"] },
  { re: /[Ѐ-ӿ]/, languages: ["ru", "uk", "bg", "sr"] },
  { re: /[Ͱ-Ͽ]/, languages: ["el"] },
];

const NON_LATIN_LANGUAGES = new Set(SCRIPT_LANGUAGES.flatMap((s) => s.languages));

/** "en-IN" → "en". */
export function baseLanguage(code: string | null | undefined): string {
  return (code ?? "").trim().toLowerCase().split(/[-_]/)[0] ?? "";
}

/**
 * Candidate languages for the non-Latin script used in `text`, or null when
 * the text is Latin-script only (English, Spanish, romanized Tamil …).
 */
export function scriptLanguages(text: string): string[] | null {
  for (const { re, languages } of SCRIPT_LANGUAGES) {
    if (re.test(text)) return languages;
  }
  return null;
}

/**
 * Best guess of the language the knowledge base documents are written in,
 * from their titles (the only per-document language signal stored). Latin
 * titles → the assistant's default language when that is Latin-script,
 * otherwise English.
 */
export function inferKnowledgeLanguage(
  documentTitles: string[],
  defaultLanguage: string | null | undefined,
): string {
  const counts = new Map<string, number>();
  let latin = 0;
  for (const title of documentTitles) {
    const candidates = scriptLanguages(title);
    if (candidates) counts.set(candidates[0], (counts.get(candidates[0]) ?? 0) + 1);
    else if (/[a-z]/i.test(title)) latin += 1;
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [language, count] of counts) {
    if (count > bestCount) { best = language; bestCount = count; }
  }
  if (best && bestCount > latin) return best;

  const fallback = baseLanguage(defaultLanguage);
  if (documentTitles.length === 0 && fallback) return fallback;
  return fallback && !NON_LATIN_LANGUAGES.has(fallback) ? fallback : "en";
}

/**
 * Does searching `query` against a `kbLanguage` knowledge base need a
 * translated query too?
 *   • non-Latin script not written in the KB language → yes
 *   • Latin script against a non-Latin KB → yes
 *   • Latin script flagged by the romanized heuristic (e.g. "enakku … venum")
 *     as a language other than the KB's → yes
 */
export function needsRetrievalTranslation(params: {
  query: string;
  kbLanguage: string;
  /** Language detected from the query by the response-language heuristic. */
  detectedLanguage?: string | null;
}): boolean {
  const kb = baseLanguage(params.kbLanguage) || "en";
  const candidates = scriptLanguages(params.query);
  if (candidates) return !candidates.includes(kb);
  if (NON_LATIN_LANGUAGES.has(kb)) return true;
  const detected = baseLanguage(params.detectedLanguage);
  return !!detected && detected !== kb && NON_LATIN_LANGUAGES.has(detected);
}

// ── Translation ──────────────────────────────────────────────────────────────

const TRANSLATION_CACHE_MAX = 500;
const TRANSLATION_CACHE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 2500;

const translationCache = new Map<string, { value: string; expiresAt: number }>();

export type RetrievalTranslation = {
  /** The query in the KB language, or null when no translation was made. */
  query: string | null;
  method: "cache" | "sarvam" | "llm" | "none";
  ms: number;
};

function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function translationEnabled(): boolean {
  const flag = process.env.RAG_QUERY_TRANSLATION?.trim().toLowerCase();
  return !(flag === "off" || flag === "false" || flag === "0");
}

function timeoutMs(): number {
  const value = Number(process.env.RAG_QUERY_TRANSLATION_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(null); },
    );
  });
}

function cleanTranslation(raw: string, original: string): string | null {
  const text = raw
    .replace(/^["'“”‘’`\s]+|["'“”‘’`\s]+$/g, "")
    .replace(/^(translation|translated question)\s*:\s*/i, "")
    .trim();
  if (!text || text.length > Math.max(400, original.length * 4)) return null;
  if (text.toLowerCase() === original.trim().toLowerCase()) return null;
  return text;
}

async function translateWithModel(
  query: string,
  kbLanguage: string,
  providerConfig: ProviderConfig | undefined,
): Promise<string | null> {
  if (providerConfig?.provider === "sarvam") return null;
  const config: ProviderConfig | undefined = providerConfig
    ? {
        ...providerConfig,
        chatModel: process.env.RAG_QUERY_TRANSLATION_MODEL?.trim() || providerConfig.chatModel,
      }
    : undefined;
  const provider = ProviderFactory.getProvider(config);
  const target = languageName(kbLanguage);
  let output = "";
  for await (const chunk of provider.chatStream(
    [
      {
        role: "system",
        content:
          `Translate the user's question into ${target} so it can be used to search a ${target} knowledge base. ` +
          `Keep product names, brand names, numbers and codes. English words written in another script ` +
          `(for example "ஹோம் இன்சூரன்ஸ்") must become the English words ("home insurance"). ` +
          `Reply with the translated question only — no quotes, notes or answer.`,
      },
      { role: "user", content: query },
    ],
    { temperature: 0, maxTokens: 160 },
  )) {
    output += chunk;
  }
  return cleanTranslation(output, query);
}

/**
 * Translate `query` into the KB language for retrieval. Never throws; returns
 * `{ query: null }` when translation is off, fails, or times out.
 */
export async function translateQueryForRetrieval(params: {
  query: string;
  kbLanguage: string;
  translationMode?: TranslationMode | null;
  orgId?: string | null;
  kbId?: string | null;
  agentId?: string | null;
  /** The tenant's embedding provider config — reused for the completion. */
  providerConfig?: ProviderConfig;
}): Promise<RetrievalTranslation> {
  const started = Date.now();
  const kbLanguage = baseLanguage(params.kbLanguage) || "en";
  const query = params.query.trim();
  if (!query || !translationEnabled()) return { query: null, method: "none", ms: 0 };

  const key = `${kbLanguage}|${query.normalize("NFKC").replace(/\s+/g, " ").toLowerCase()}`;
  const cached = translationCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { query: cached.value, method: "cache", ms: Date.now() - started };
  }

  const remember = (value: string) => {
    translationCache.set(key, { value, expiresAt: Date.now() + TRANSLATION_CACHE_TTL_MS });
    while (translationCache.size > TRANSLATION_CACHE_MAX) {
      const oldest = translationCache.keys().next().value;
      if (oldest === undefined) break;
      translationCache.delete(oldest);
    }
  };

  const budget = timeoutMs();

  // 1. The organisation's own translation service choice (Sarvam).
  if (params.translationMode && params.translationMode !== "off") {
    const sarvam = await withTimeout(
      translateQueryForRag({
        query,
        translationMode: params.translationMode,
        targetLanguage: kbLanguage,
        orgId: params.orgId ?? null,
        kbId: params.kbId ?? null,
        agentId: params.agentId ?? null,
      }),
      budget,
    );
    const translated = sarvam?.translated ? cleanTranslation(sarvam.effectiveQuery, query) : null;
    if (translated) {
      remember(translated);
      return { query: translated, method: "sarvam", ms: Date.now() - started };
    }
  }

  // 2. One short completion on the tenant's embedding provider.
  try {
    const remaining = Math.max(500, budget - (Date.now() - started));
    const translated = await withTimeout(
      translateWithModel(query, kbLanguage, params.providerConfig),
      remaining,
    );
    if (translated) {
      remember(translated);
      return { query: translated, method: "llm", ms: Date.now() - started };
    }
  } catch (err) {
    console.warn("[cross-lingual] query translation failed:", (err as Error).message);
  }
  return { query: null, method: "none", ms: Date.now() - started };
}

/** Test hook. */
export function clearRetrievalTranslationCache(): void {
  translationCache.clear();
}
