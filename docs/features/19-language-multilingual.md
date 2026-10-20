# 19 — Language & Multilingual AI

> Clara AI Platform feature documentation · Domain: `language-core` + `rag` cross-lingual + translate routes · Base: `feature/ai-core-from-doable-source @ 1adb80bf`

## 1. Definition & Purpose

Clara is multilingual by design: Sarvam-backed translate / transliterate / language-identification services, a cross-lingual RAG pipeline (query translation → retrieval → answer localisation), per-agent language allowlists, and multilingual embeddings. Its purpose is that a tenant whose knowledge is English can serve users in Tamil, Hindi, or Arabic (and vice versa) without duplicating KBs — one index, many languages, with per-turn translation metered and bounded.

## 2. Business Logic

- **Language service** — `src/modules/language-core/types.ts`: `LanguageService:69` interface (`TranslateParams:32`, `TransliterateParams:48`, results `:43/:56/:60`), `LanguageProvider:22` = `"sarvam"`, `LANGUAGE_PROVIDERS:24`, guard `isLanguageProvider:26`. Provider: `providers/sarvam.ts:70` `SarvamLanguageProvider` (`SarvamLanguageError:34`); factory `factory.ts:11` `LanguageProviderFactory`.
- **Model catalog & limits** — `model-catalog.ts`: `SARVAM_TRANSLATE_MODELS:24`, `TRANSLATION_QUERY_MAX_CHARS:32` (2,000), `TRANSLATION_ANSWER_MAX_CHARS:34` (4,000), `TRANSLITERATION_MAX_CHARS:36` (2,000), `TRANSLATE_LANGUAGES:83` with code mapping `:90/:99`, enablement/keys/base/timeout `:40-63`, default model `:63`, validation `:67/:71`, service switch `isLanguageServiceEnabled:76`.
- **HTTP surface** — `language-core/api/translate.ts`: `postTranslate:93`, `postTransliterate:167`, `postIdentify:228` behind `/api/language/{translate,transliterate,identify}`; agent-scoped `assistant/api/translate.ts:82/98/118` (`postTranslate`, `postEmbedTranslate`, `postAgentTranslate`) behind `/api/agents/[agentId]/translate`, `/api/embed/translate`, `/api/translate`.
- **Cross-lingual RAG** — `rag/cross-lingual.ts`: `inferKnowledgeLanguage:49`, `needsRetrievalTranslation:80`, `translateQueryForRetrieval:187`, `translateText:270`, `localizeText:320`, cache clearing `:257`; `baseLanguage:39`. Pipeline orchestration `language-core/pipeline.ts`: `CrossLingualQueryResult:43`, `translateQueryForRag:66`, `SentenceTranslator:190` (V4 sentence-level answer translation with flush — chat.ts's `answerTranslator`).
- **Answer translation modes** — `config-types.ts:8` `TranslationMode = "off" | "query" | "query+answer"` (guard `:10`) — per-agent setting: translate the question only, or also stream-translate the answer sentence-by-sentence.
- **Metering** — `language-core/pricing.ts`: `translateUsdPer1kChars:22`, `identifyUsdPer1kChars:30`, cost micros `:36/:40`, usage events `logTranslationUsage:95`, `logTransliterationUsage:121`, `logIdentificationUsage:143` (`LanguageUsageEventBase:86`).
- **Multilingual embeddings** — `059_multilingual_embeddings.sql` + platform test route `/api/platform/multilingual-embeddings/test`; agent language allowlists via `resolveAgentRuntimeSelection` (Feature 12).
- **Realtime language mirroring** — realtime sessions mirror the caller's detected language within the tenant allowlist (Tamil RAG latency work lineage).

## 3. Business Rules

- Translation inputs are hard-capped (2k/4k chars) — oversized payloads are rejected, not truncated silently.
- Only catalog-listed translate models are selectable; unknown model ids fail validation.
- Language allowlists (per agent) bound both text and realtime language choices — the assistant never responds in a language the tenant hasn't enabled.
- Every translation/transliteration/identification call is metered into the usage spine with model + character counts.
- Cross-lingual retrieval caches translations per query; answer translation flushes pending sentences BEFORE stream close (V4 rule) so no sentence is lost.

## 4. Data Model

- `059_multilingual_embeddings.sql`; agent languages in `044_agent_ai_capability_slots.sql`-era settings (Feature 12); usage events (Feature 20).

## 5. API Surface

| Route | Handler anchor |
|---|---|
| `src/app/api/language/{translate,transliterate,identify}/route.ts` | translate.ts:93/167/228 |
| `src/app/api/agents/[agentId]/translate/route.ts` | postAgentTranslate:118 |
| `src/app/api/embed/translate/route.ts`, `/api/translate` | postEmbedTranslate:98 / postTranslate:82 |
| `src/app/api/platform/multilingual-embeddings/test/route.ts` | platform probe |

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/modules/language-core/model-catalog.ts` | model list, limits, language codes `:24-99` |
| `src/modules/language-core/providers/sarvam.ts` | `SarvamLanguageProvider:70` |
| `src/modules/language-core/pipeline.ts` | `translateQueryForRag:66`, `SentenceTranslator:190` |
| `src/modules/rag/cross-lingual.ts` | pipeline functions `:39-320` |
| `src/modules/language-core/pricing.ts` | cost + usage logging `:22-143` |
| `src/modules/language-core/config-types.ts` | `TranslationMode:8` |

## 7. UI Reference

- Agent language configuration: `src/app/(admin)/orgs/[id]/agents/[agentId]/config/page.tsx`.
- Translation UX is transparent to chatters (streamed translated answers); widget `src/app/embed/widget/page.tsx`.
- Platform console: `src/app/(admin)/settings/ai/page.tsx` (multilingual test probe).

## 8. Environment Variables

- `SARVAM_API_KEY`, `SARVAM_LANGUAGE_*` base/timeout/enablement (`model-catalog.ts:40-63`).

## 9. Tests

- `language-core` suites, cross-lingual cache tests, SentenceTranslator flush tests (chat.ts V4), `agent-ai-types.test.ts` language resolution.

## 10. Cross-links

- Chat integration — **08** (query translation + answer translator); realtime language mirroring — **16**; Sarvam voice — **15**; usage metering — **20**.
