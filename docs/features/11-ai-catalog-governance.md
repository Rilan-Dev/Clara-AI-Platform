# 11 — AI Catalog & Governance

> Clara AI Platform feature documentation · Domain: `ai-governance` · Base: `feature/ai-core-from-doable-source @ 1adb80bf`

## 1. Definition & Purpose

AI governance decides which models the platform is ALLOWED to use: the live catalog syncs vendor-advertised model lists (Gemini/OpenAI/ElevenLabs/Sarvam), validates response shapes fail-closed, and feeds entitlement checks so organisations can only select models their plan permits. This is the layer that caught the production "gemini-embedding-2-preview not in vendor-live catalogue" incident and the ElevenLabs malformed-voice-page reconciliation — its purpose is that no agent, KB, or voice session ever runs a model the vendor no longer offers or the tenant isn't entitled to.

## 2. Business Logic

- **Live catalog sync** — `src/modules/ai-governance/core/live-catalog.ts` fetches vendor model/voice lists on the platform side, validates page shapes (e.g., ElevenLabs `/v2/voices` pagination fields), and reconciles the platform model catalog. Malformed pages refuse partial reconciliation ("malformed page; refusing partial reconciliation" — production log line) and preserve last-known rows.
- **Catalog exposure** — `/api/ai/openai/catalog` (OpenAI models, Redis-cached via `assistant/api/openai-catalog-cache.ts:132` `getOpenAICatalogCached`, invalidation `:161`), `/api/organisations/[orgId]/ai-catalog` (org-visible catalog), provider models route `/api/platform/ai/providers/[providerId]/models`.
- **Entitlements** — plan→provider entitlement rows (`055_plan_ai_provider_entitlements.sql`) gate which providers/models a plan may use; checked during AI settings saves and runtime resolution (Feature 12/17).
- **Fail-closed resolution** — when the platform embedding default is absent from the vendor-live catalog, runtime records a warning-severity incident and resolves per governance policy instead of blindly calling a dead model (production-observed during the embedding fix verification).
- **Health sweep** — `/api/cron/ai-health` (route line 114) periodically probes provider availability feeding Feature 21 status.

## 3. Business Rules

- Fail-closed catalog: an invalid vendor page NEVER wipes known-good catalog rows; reconciliation is all-or-nothing per page.
- Only vendor-live advertised models are selectable; unadvertised preview models surface an informational incident (the configured-default case seen in production).
- Plan entitlements are enforced at settings-save time AND runtime resolution time (no bypass via API).
- Catalog responses are cached (Redis) with explicit invalidation on provider credential change.
- Voice catalogs follow the same rule: partial discovery preserves existing ElevenLabs voice rows (commit `dc3e3a1c`, `85566ede`).

## 4. Data Model

- Platform AI provider/model tables — `043_separate_capability_model_catalog.sql`; plan entitlements — `055_plan_ai_provider_entitlements.sql`; catalog audit trail — governance docs; Sarvam realtime catalog — `041_sarvam_realtime_model_catalog.sql`.

## 5. API Surface

| Route | Purpose |
|---|---|
| `src/app/api/ai/openai/catalog/route.ts` | OpenAI model catalog (cached) |
| `src/app/api/organisations/[orgId]/ai-catalog/route.ts` | org-scoped catalog |
| `src/app/api/platform/ai/providers/[providerId]/models/route.ts` | provider models for admin |
| `src/app/api/cron/ai-health/route.ts:114` | availability sweep |
| `src/app/api/platform/ai/embedding-default(/test)/route.ts` | platform embedding default + probe |

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/modules/ai-governance/core/live-catalog.ts` | live catalog sync/reconcile (voice page validation, partial-discovery preservation) |
| `src/modules/ai-governance/core/live-catalog.test.ts` | catalog regression suite (repaired by the catalog session — 101-line expansion at tip) |
| `src/modules/assistant/api/openai-catalog-cache.ts` | `getOpenAICatalogCached:132`, `invalidateOpenAICatalogCache:161`, `__resetOpenAICatalogRedisForTests:62` |

## 7. UI Reference

- `src/app/(admin)/ai-platform/page.tsx` — provider/model administration console.
- `src/app/(admin)/settings/ai/page.tsx` — platform AI defaults incl. embedding default + catalog status.
- Org catalog pickers in `src/app/(admin)/orgs/[id]/agents/[agentId]/config/page.tsx` (model dropdowns filtered by entitlement).

## 8. Environment Variables

- Provider credentials (Feature 10), catalog cache Redis vars, `PLATFORM_EMBEDDING_*` defaults.

## 9. Tests

- `src/modules/ai-governance/core/live-catalog.test.ts` (6+ tests incl. ElevenLabs partial-discovery preservation); catalog cache tests.

## 10. Cross-links

- Model execution — **10 Provider Core**; selection surfaces — **12 AI Settings**; plan gating — **17 Payments** (entitlements); incident recording — **21 Platform Health**.
