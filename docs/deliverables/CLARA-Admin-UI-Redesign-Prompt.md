# Clara Admin UI/UX Restructure — Master Implementation Prompt

> **Bundle:** `clara-admin-ui-redesign-prompt.zip` · created 2026-09-24
> **Scope:** Restore agent section menus into the sidebar, move the version/deploy cluster into the global topbar next to the profile avatar, and add draft-diff, published-URL and usage-limits affordances — **by redesigning the existing UI/UX, not introducing anything new**.
> **Implementation status:** already implemented and delivered (commit `12a6a25` on `Vite-Converted`; PR #151 merged → Vercel-Preview; PR #152 open → Vercel-Prod). Product owner reviewed and confirmed: *"All changes are all ok perfect."* Use this prompt to re-run the work on a fresh environment or as the verification checklist against the live app.

---

## 1. Objectives

| # | Objective |
|---|---|
| O1 | The seven agent section menus — **Overview, Main, FAQ, Knowledge, Tools, Branches, Publish** — live in the **sidebar**, grouped under an **"Agents >"** header. They must **NOT** render at the top of the main content area (that layout is the rejected anti-pattern). |
| O2 | Sidebar has two states: **plain org rail** when no agent is selected (clean nav, no agent submenu) and **agent rail** when an agent is open (identity card + the 7 section tabs with icons and active states). |
| O3 | The version/deploy cluster — **`Main · vN`, `Draft changes`, `Published vN`, `Draft saved Xm ago`, `Preview`, `Publish update`** — moves into the **global topbar next to the profile avatar** (e.g. "MR MOHAMMED RILAN. J"). The **username is removed from the navbar**; the profile trigger becomes avatar-only. |
| O4 | **"Draft changes"** opens a *view pending changes* experience showing the **draft vs current version diff**. |
| O5 | **"Published vN"** opens **published URL controls** (copy / open the public page), consistent with the Publish screen. |
| O6 | The **profile popup** shows **usage limits etc.** — plan badge and live meters (requests/day, storage, KBs, docs-per-KB) with warning states. |
| O7 | Constraint throughout: **redesign the existing UI/UX — do not introduce anything new** (no new navigation concepts, no new pages, no new mental models; relocation and restoration only). |

---

## 2. Reference screenshot registry (S1–S9)

> ⚠️ **Binary availability note (verified 2026-09-24, twice):** the chat gateway did **not** persist the pasted image binaries for these filenames to workspace storage (exhaustive filesystem sweep + vision-analysis of every recoverable paste confirmed it). The owner's captions below — taken verbatim from the request — are the authoritative reference. **When re-running this prompt, re-attach the originals next to this file using the exact filenames.** See `references/PUT-SCREENSHOTS-HERE.txt`.

| Ref | Filename | Owner's caption / role | What it shows |
|---|---|---|---|
| S1 | `pasted_image_1790178841516.png` | "This is what you changed" — **the anti-pattern** | Agent section menus rendered at the TOP of the main content area. This is the wrong state to eliminate. |
| S2 | `pasted_image_1790179059322.png` | "I want to restore these menus into sidebar… move the above menus here below under 'Agents >'" | Sidebar with the agent section expanded — the restore target: `Agents >` followed by Overview / Main / FAQ / Knowledge / Tools / Branches / Publish. |
| S3 | `pasted_image_1790179416607.png` | "When not selecting an agent, the sidebar looks something like this" | Idle/plain sidebar with NO agent selected — no agent submenu, clean organisation-level nav. |
| S4 | `pasted_image_1790179235085.png` | "For example, selected agent sidebar view" | Selected-state sidebar: agent identity card + the 7 section tabs (with icons). |
| S5 | `pasted_image_1790179688782.png` | "move these things into the top of the navbar near the profile icon 'MR MOHAMMED RILAN. J' and remove the username from the navbar" | Topbar area next to the profile avatar — destination for the version cluster `[Main, v8, Draft changes, Published v8, Draft saved 18 min ago, Preview, Publish update]`. |
| S6 | `pasted_image_1790179931543.png` | "Reference to update for publishing" | Publish screen — the publishing UX reference; published-URL controls link from here and from the "Published vN" popover. |
| S7 | `pasted_image_1790180026215.png` | "for versioning drafts examples" | How draft/version status is surfaced: version chips, saved-age, pending-changes entry point. |
| S8 | `pasted_image_1790180748312.png` | "to click 'view pending changes' … we show the draft diff view changes" | The draft diff view: draft vs current version, opened from "Draft changes". |
| S9 | `pasted_image_1790180948723.png` | "for the profile pop up we need like this: show usage limits etc…" | Profile popup content: usage limits, plan, meters. |

**Recovered structural analogs** — the `design-references/` folder in this bundle contains the 8 screenshots that DID survive in storage (7 ElevenLabs Conversational-AI dashboard screens + 1 Clara Providers dashboard). The ElevenLabs sidebar-grouping and Branches/History screens are the closest available visual analogs for S2/S4 (grouped `Agents >` structure) and S7 (versioned drafts). They are NOT the originals — see `design-references/DESIGN-REFERENCES.md`.

---

## 3. Non-negotiable rules

1. **Redesign, don't add.** Relocate existing controls and restore existing menus. No new navigation concepts, no new top-level pages, no renamed sections.
2. The seven section tabs are exactly: **Overview, Main, FAQ, Knowledge, Tools, Branches, Publish** — under the **"Agents >"** group header, in that order.
3. The version cluster items are exactly: **`Main · vN` · `Draft changes` · `Published vN` · `Draft saved Xm ago` · `Preview` · `Publish update`** — in the topbar, next to the profile avatar.
4. **No username in the navbar.** Profile trigger is avatar-only; the user's name appears only inside the popup.
5. Plain sidebar (S3) must show zero agent-scoped UI when no agent is open.
6. Mobile: the agent section degrades to a horizontal pill strip under the topbar — same tabs, same order, no layout surprises.
7. Accessibility: keyboard-reachable popovers/drawer, focus traps in drawers, `aria-expanded` on pill triggers, reduced-motion-safe transitions.

---

## 4. Verified baseline (before this work)

- The previous session's "one-navbar" experiment (`7ff79f1`) had collapsed agent navigation into a single top navbar inside the main content — the anti-pattern in S1.
- `workspace-shell.tsx` carried `WorkspaceNavbar`/`AgentNavbar`/`NavbarTab` (to be removed entirely).
- `admin-shell.tsx` owned the org sidebar and a topbar with `TopbarContextLabel` + `ThemeToggle` + `ProfileMenu` (with username text) on the right.
- Draft/version facts available server-side: `agent_drafts` (Main branch), `getDraft`, `getMainBranch`, version list, `fetchAgentDiff(a, b)` already supports `a|b = 'draft'`.
- `getOrgUsageSnapshot(orgId)` already existed for the dashboard but had no lightweight org-member endpoint.
- Publish screen already had a public-page URL card pattern to reuse for the "Published vN" popover.

---

## 5. Implementation plan

### Phase 0 — Baseline hygiene
- Work in the `Vite-Converted` worktree, clean tree, synced with origin.
- Confirm the anti-pattern exists (`WorkspaceNavbar` in `workspace-shell.tsx`) so the restore has a defined start state.

### Phase 1 — Topbar cluster component
- New `src/features/admin/layouts/agent-topbar.tsx` exporting:
  - **`AgentTopbarProvider`** — resolves the open agent's workspace context once via the shared 60s context cache; listens for `agent-workspace:refresh` events and refetches with cache write-back so sidebar and topbar stay in sync after publish.
  - **`TopbarContextLabel`** — left slot: agent name + open section on agent routes, neutral page label elsewhere. **No username.**
  - **`AgentTopbarCluster`** — right slot, next to the avatar: `Main · vN` · `Draft changes` pill → drawer · `Published vN` pill → popover · `Draft saved Xm ago` (20s tick) · `Preview` · one-click `Publish update` (moved from the old navbar).
- `context-cache.ts`: add `updateAgentWorkspaceContextCache` (fresh snapshots written back after publish/refresh).

### Phase 2 — Sidebar restoration
- `admin-shell.tsx`:
  - Sidebar agent section restored under an **"Agents >"** back-link header (returns to the agents index).
  - Agent identity card: name, `Main · vN`, hover delete.
  - The 7 section tabs with icons and active states.
  - **Plain org rail when no agent is open** (S3) — no agent submenu at all.
- `workspace-shell.tsx`: remove `WorkspaceNavbar`/`AgentNavbar`/`NavbarTab` entirely; keep the §22 update banner; add `AgentMobileTabs` (`md:hidden` horizontal pill strip, same 7 tabs).
- Update stale copy in `publish-screen`, `faq-screen`, `assistant-ai-screen`, `overview-screen` that referenced the old header ("header" → "top bar").

### Phase 3 — Draft-changes drawer (S7 → S8)
- "Draft changes" pill opens `DraftChangesDrawer`: `fetchAgentDiff(a = currentVersion, b = 'draft')` rendered through the existing `DiffViewer`, plus a shortcut into Publish.

### Phase 4 — Published URL controls (S6)
- "Published vN" pill opens a popover with copy/open actions for the public page URL, mirroring the publish-screen URL card pattern; publish screen gains a "Public page" link card.

### Phase 5 — Profile usage-limits popup (S9)
- `ProfileMenu.tsx`: avatar-only trigger; **`UsageLimitsSection`** lazily fetched on open: plan badge + 4 meters (requests/day, storage, KBs, docs-per-KB) with amber ≥80% / rose ≥100% / `Unlimited` (−1).
- New route `GET /api/orgs/[orgId]/usage-limits` (org-member auth) → `getOrgUsageSnapshot`; client fn `fetchOrgUsageLimits` + `OrgUsageLimits` type in `admin-ui/api.ts`.

### Phase 6 — Quality gates
- `tsc` 0 errors; `eslint` 0 new warnings; `vitest` matches HEAD baseline exactly; webpack compile OK.

### Phase 7 — Git delivery
- Commit on `Vite-Converted` → PR → `Vercel-Preview` (self-merge) → PR → `Vercel-Prod` (leave open for owner review).

---

## 6. Acceptance checklist

- [ ] S1 anti-pattern gone: no agent menus at the top of main content, anywhere.
- [ ] Sidebar shows `Agents >` + Overview / Main / FAQ / Knowledge / Tools / Branches / Publish (S2/S4), with plain rail when no agent selected (S3).
- [ ] Topbar right side, next to the avatar: `Main · vN` · `Draft changes` · `Published vN` · `Draft saved Xm ago` · `Preview` · `Publish update` (S5).
- [ ] Username absent from the navbar; profile trigger avatar-only; name only inside the popup.
- [ ] "Draft changes" → pending-changes drawer with draft-vs-current diff (S7→S8).
- [ ] "Published vN" → URL popover (copy/open), consistent with the Publish screen (S6).
- [ ] Profile popup shows plan badge + 4 live usage meters (S9).
- [ ] Nothing NEW introduced — every control is a relocation/restoration of an existing one.
- [ ] All quality gates green; PRs delivered per §5 Phase 7.

---

## Appendix A — Screenshot → Phase map

| Ref | Filename | Phase(s) |
|---|---|---|
| S1 | `pasted_image_1790178841516.png` | 2 (anti-pattern to remove) |
| S2 | `pasted_image_1790179059322.png` | 2 |
| S3 | `pasted_image_1790179416607.png` | 2 |
| S4 | `pasted_image_1790179235085.png` | 2 |
| S5 | `pasted_image_1790179688782.png` | 1, 2 |
| S6 | `pasted_image_1790179931543.png` | 4 |
| S7 | `pasted_image_1790180026215.png` | 1, 3 |
| S8 | `pasted_image_1790180748312.png` | 3 |
| S9 | `pasted_image_1790180948723.png` | 5 |

## Appendix B — Delivered implementation inventory (commit `12a6a25`)

| File | Change |
|---|---|
| `src/features/admin/layouts/agent-topbar.tsx` | NEW (603 lines): AgentTopbarProvider + TopbarContextLabel + AgentTopbarCluster |
| `src/features/admin/layouts/admin-shell.tsx` | Sidebar agent section restored + topbar restructured (avatar-only profile) |
| `src/features/admin/screens/agent-workspace/workspace-shell.tsx` | One-navbar removed (net −375 lines restructure); AgentMobileTabs added |
| `src/features/admin/screens/agent-workspace/context-cache.ts` | +updateAgentWorkspaceContextCache |
| `src/components/admin/ProfileMenu.tsx` | Avatar-only trigger + UsageLimitsSection (+169 lines) |
| `src/app/api/orgs/[orgId]/usage-limits/route.ts` | NEW: org-member usage snapshot endpoint |
| `src/modules/admin-ui/api.ts` | +fetchOrgUsageLimits + OrgUsageLimits type |
| `publish-screen` / `faq-screen` / `assistant-ai-screen` / `overview-screen` | Stale header copy → topbar |
| Total | 11 files, +1090 / −339 |
