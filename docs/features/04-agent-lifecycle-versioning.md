# 04 — Agent Lifecycle & Versioning

> Clara AI Platform feature documentation · Domain: `agent-versioning` + agent routes · Base: `feature/ai-core-from-doable-source @ 031279b4`

## 1. Definition & Purpose

An agent is the tenant's configurable AI assistant: system prompt, AI model choices, voice bindings, knowledge bases, tools. This feature is the agent's full lifecycle — creation, draft editing, versioned snapshots, Git-like branches and merges, publish/rollback with deployment records, and preview of unpublished work. Its purpose is safe iteration: organisation teams can experiment on drafts and branches while a pinned production deployment serves end users, then promote changes through a reviewed publish flow.

## 2. Business Logic

- **Draft ↔ version model** — every agent has a main branch (`ensureMainBranch`, `agent-versioning/core/db.ts:110`) and an editable draft (`getDraft:289`, `putDraft:297`, cached `getAgentDraftConfigCached:349` with invalidation `:363`). Saving a version snapshots the draft (`insertVersion:226`, `listVersions:188`, `getLatestVersion:209`).
- **Branches** — `createBranch:122` forks a configuration line; `listBranches:75`, `setBranchArchived:150`; a branch can be reviewed (`reviewMergeHandler`, api/handlers.ts:261) and merged (`executeMergeHandler:272`) back into main.
- **Publish & deploy** — `getPublishReviewHandler:290` runs pre-flight checks, `publishHandler:305` promotes a version, `rollbackHandler:322` restores the previous deployment, `listDeploymentsHandler:338` + `getActiveDeployment:397` / `insertDeployment:419` record what is live. KB collections are snapshotted per deployment (`getActiveDeploymentKbCollection:465`, migration `047_agent_deployment_kb_snapshots.sql`).
- **Default-update flow** — when platform assistant defaults change, `checkDefaultUpdateHandler:352` / `applyDefaultUpdateHandler:364` let an agent adopt them consciously.
- **System prompt generation** — `POST /api/agents/[agentId]/system-prompt/generate` → `generateSystemPromptHandler` (`src/modules/assistant/api/system-prompt-generator.ts:183`) AI-drafts a system prompt from the agent's KB: `classifyKnowledge:113` picks/validates a template (`PROMPT_TEMPLATES:33` in `assistant/core/prompt-templates.ts` — customer support, clinical, org policy… or "Let AI decide"), `buildGenerationPrompt:144` assembles the generation prompt with optional admin notes; the UI (`src/components/admin/SystemPromptGenerator.tsx` — "Generate from knowledge base" dialog + `SystemPromptPreview.tsx`) shows the draft with sampled-document count and template reason, and NOTHING is written to the agent prompt without an explicit Replace / Append.
- **Workspace context** — `getWorkspaceContextHandler:64` assembles draft + versions + KB bindings for the workspace UI; snapshots (`/config/snapshots`, restore) give point-in-time config recovery.
- **Handlers index** — `src/modules/agent-versioning/api/handlers.ts:64-364` maps 1:1 onto the routes below.

## 3. Business Rules

- Only published deployments serve end-user traffic (embed/chat resolves the ACTIVE deployment config — see `getProductionVersionConfigCached:492`).
- Publish is gated by a review step (checks pass → promote); rollback is always available to the previous deployment.
- Version configs are immutable once saved; edits happen on the draft.
- KB binding at publish time is snapshotted so later KB edits cannot silently change a live agent's index (per-deployment collection).
- Agent status lifecycle: `draft → published → archived` (`organisations/core/models.ts:23`).
- AI-generated prompts are suggestions only — generation never auto-writes the agent prompt; Replace/Append is an explicit admin action (the result carries `documentsSampled` + template reason for review).

## 4. Data Model

- Agent tables — `001_foundation.sql`; versioning/branches/deployments — `040_ai_governance_and_agent_versioning.sql`; deployment KB snapshots — `047_agent_deployment_kb_snapshots.sql`; capability slots — `044_agent_ai_capability_slots.sql`.

## 5. API Surface

| Route | Handler anchor (api/handlers.ts) |
|---|---|
| `/api/agents/[agentId]/workspace` | `getWorkspaceContextHandler:64` |
| `/api/agents/[agentId]/draft` | `getDraftHandler:77` / `putDraftHandler:101` |
| `/api/agents/[agentId]/versions` (+ `[versionId]`, restore, diff) | `listVersionsHandler:121`, `saveVersionHandler:155`, `getVersionHandler:170`, `restoreVersionHandler:183`, `diffHandler:196` |
| `/api/agents/[agentId]/branches` (+ `[branchId]`, merge) | `listBranchesHandler:215`, `createBranchHandler:226`, `archiveBranchHandler:246`, `reviewMergeHandler:261`, `executeMergeHandler:272` |
| `/api/agents/[agentId]/publish`, rollback, deployments | `getPublishReviewHandler:290`, `publishHandler:305`, `rollbackHandler:322`, `listDeploymentsHandler:338` |
| `/api/agents/[agentId]/default-update` | `checkDefaultUpdateHandler:352` / `applyDefaultUpdateHandler:364` |
| `/api/agents/[agentId]/config` (+ snapshots, snapshots/[id]/restore) | config + snapshot routes |
| `/api/agents/[agentId]/preview`, `/kbs`, `/ai-options`, `/ai-settings`, `/explore-link` | workspace aux surfaces |
| `/api/orgs/[orgId]/agents` (+ `[agentId]`) | CRUD — `organisations/api/agents.ts:12-90` |
| `/api/public/agents/[agentId]/config` | public (unauthenticated) published-agent config for embeds |

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/modules/agent-versioning/core/db.ts` | `AgentVersioningError:21`, `parseVersionConfig:28`, `listBranches:75`, `getMainBranch:101`, `ensureMainBranch:110`, `createBranch:122`, `listVersions:188`, `insertVersion:226`, `getDraft:289`, `putDraft:297`, `getActiveDeployment:397`, `insertDeployment:419`, `getActiveDeploymentKbCollection:465`, `getProductionVersionConfig:478`, `getProductionVersionConfigCached:492` |
| `src/modules/agent-versioning/api/handlers.ts` | handlers `:64-364` (above) |
| `src/modules/agent-versioning/core/diff.ts` | config diffing for `/versions/diff` and merge review |
| `src/modules/agent-versioning/core/service.ts` / `projection.ts` | orchestration + read-model projection |

## 7. UI Reference

- `src/app/(admin)/orgs/[id]/agents/page.tsx` — agent roster.
- `.../agents/[agentId]/page.tsx` — overview; `config/page.tsx` — draft editor; `versions/page.tsx` — version/branch/merge console; `publish/page.tsx` — publish review; `knowledge/page.tsx` — KB bindings; `tools/page.tsx`, `faq/page.tsx`, `mcp/page.tsx`, `messaging/page.tsx`, `integrations/page.tsx` — capability tabs.
- `src/app/preview/agents/[agentId]/page.tsx` + `src/app/api/agents/[agentId]/preview` — unpublished-agent preview.
- Screens: `src/features/admin/screens/agent-workspace/*.tsx` (overview, config, versions, publish, knowledge, tools, assistant-ai, published-preview).

## 8. Environment Variables

- None dedicated; deployment records live in Postgres.

## 9. Tests

- `src/modules/agent-versioning/core/diff.test.ts` + module suites (see `scripts/feature-doc/tests.txt`).

## 10. Cross-links

- Published config feeds **08 RAG Chat** (production config resolution) and **13 Embeddable Widget** (public agent config).
- KB bindings snapshotted per deployment — **05 Knowledge Bases** / **06 Ingestion**.
- Platform default adoption links to **22 Platform Administration** (assistant defaults versioning).
