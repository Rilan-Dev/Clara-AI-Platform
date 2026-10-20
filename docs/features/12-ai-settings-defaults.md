# 12 — AI Settings & Model Defaults

> Clara AI Platform feature documentation · Domain: `organisations` (AI settings) + platform defaults · Base: `feature/ai-core-from-doable-source @ 031279b4`

## 1. Definition & Purpose

AI settings are the resolution chain that decides, for any given request, WHICH provider + model actually runs: platform defaults (super-admin controlled) → organisation AI settings → agent AI settings → (chat-time) per-request overrides, with KB-level embedding overrides for index alignment. This feature covers those settings surfaces, their versioned platform defaults (assistant defaults with draft/publish/diff), and the runtime resolution helpers. Its purpose is predictable, governable model routing — one place to see why a chat used `gemini-2.0-flash` rather than something else, and one place to change it safely.

## 2. Business Logic

- **Org AI settings** — `GET/PATCH /api/orgs/[orgId]/ai-settings` → `getOrgAISettingsHandler` / `patchOrgAISettingsHandler` (`src/modules/organisations/api/ai-settings.ts:214`, `:244`) over `getOrgAISettings` / `upsertOrgAISettings` (`core/ai-settings-db.ts:151`, `:161`). Persisted per migration `013_org_ai_settings.sql` (+ catalog `008_org_ai_catalog.sql`).
- **Agent AI settings** — `GET/PATCH /api/agents/[agentId]/ai-settings` → `agent-ai-settings.ts:10` / `:30` over `core/agent-ai-settings-db.ts:12` (`getAgentAISettings`) / `:38` (`upsertAgentAISettings`). The `AgentAISettings` shape (`core/agent-ai-types.ts:6`) pins provider, chat/embedding/realtime/transcription models, voice provider slots, languages and voices; `resolveAgentRuntimeSelection:28` computes allowed languages/default language/voice for runtime.
- **Runtime resolution chain** — chat resolves: request override → agent settings → org settings → platform defaults (Feature 08's config resolution; defaults from Feature 22's assistant-defaults published version).
- **Platform assistant defaults** — versioned with draft/publish/diff: `/api/platform/assistant-defaults` (+ `/draft`, `/diff`, `/versions`, `/versions/[versionNumber]`); agents are notified when defaults change and adopt them consciously via Feature 04's default-update flow (migrations `015_platform_assistant_defaults.sql`, `042_default_assistant_behaviour_branding.sql`, FAQ items `056_assistant_faq_items.sql`).
- **Embedding defaults & re-index** — `/api/platform/ai/embedding-default` (+ `/test`) set the platform embedding model; KBs built on a different embedding are realigned via chat-triggered re-index (`/api/kbs/[kbId]/embedding-index`, worker `/api/worker/reindex`; migrations `053_platform_embedding_defaults.sql`, `075_embedding_default_bootstrap.sql`, multilingual `059_multilingual_embeddings.sql`).
- **AI options surface** — `/api/agents/[agentId]/ai-options` returns the SELECTABLE options (entitlement-filtered) for the agent config UI.

## 3. Business Rules

- Settings cascade strictly: request > agent > org > platform default — every layer nullable, resolution always terminates at platform defaults.
- Only entitlement-permitted providers/models appear in selectable options (Feature 11 gating).
- Platform defaults changes version through draft→publish with diff review; agents adopt consciously (no silent overwrite of agent-level pins).
- Embedding default changes trigger index realignment; a KB never serves mixed-embedding results (dimension guard).
- All settings mutations are validated against the vendor-live catalog (fail-closed, Feature 11).

## 4. Data Model

- `013_org_ai_settings.sql`, `008_org_ai_catalog.sql`, `014_kb_ai_overrides.sql`, `015_platform_assistant_defaults.sql`, `042/053/056/059/075` (defaults, FAQ, multilingual, bootstrap), `044_agent_ai_capability_slots.sql`.

## 5. API Surface

| Route | Handler anchor |
|---|---|
| `/api/orgs/[orgId]/ai-settings` | ai-settings.ts:214/244 |
| `/api/agents/[agentId]/ai-settings`, `/ai-options` | agent-ai-settings.ts:10/30 |
| `/api/platform/assistant-defaults/**` | platform defaults versioning routes |
| `/api/platform/ai/defaults`, `/embedding-default(/test)` | platform AI defaults + embedding |
| `/api/kbs/[kbId]/ai-overrides`, `/embedding-index` | KB-level overrides/alignment |

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/modules/organisations/core/ai-settings-db.ts` | `getOrgAISettings:151`, `upsertOrgAISettings:161` |
| `src/modules/organisations/core/agent-ai-settings-db.ts` | `getAgentAISettings:12`, `upsertAgentAISettings:38` |
| `src/modules/organisations/core/agent-ai-types.ts` | `AgentAISettings:6`, `AgentRuntimeSelectionInput:8`, `resolveAgentRuntimeSelection:28`, `AgentLanguage:4`, `AgentVoice:5` |
| `src/modules/organisations/core/catalog-db.ts` | org catalog reads |

## 7. UI Reference

- `src/app/(admin)/orgs/[id]/settings/page.tsx` — org settings incl. AI.
- `src/app/(admin)/orgs/[id]/agents/[agentId]/config/page.tsx` + `src/features/admin/screens/agent-workspace/assistant-ai-screen.tsx` — agent AI config.
- `src/app/(admin)/settings/ai/page.tsx` — platform AI defaults console.

## 8. Environment Variables

- `PLATFORM_EMBEDDING_*` / default model env (bootstrap before DB defaults), provider keys (Feature 10).

## 9. Tests

- `src/modules/organisations/core/agent-ai-types.test.ts`, ai-settings suites, defaults versioning tests (see `scripts/feature-doc/tests.txt`).

## 10. Cross-links

- Execution — **10 Provider Core**; gating — **11 Catalog**; version adoption — **04 Agent Versioning**; embedding realignment worker — **25**.
