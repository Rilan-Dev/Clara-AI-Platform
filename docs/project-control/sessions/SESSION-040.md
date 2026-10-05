# SESSION-040 — Role/RBAC + Subscription UI Enablement

Date: 2026-10-05
Owner: ChatGPT project owner/developer
Branch: `feature/ai-core-from-doable-source`

## Scope
Enable the existing Clara admin UI for real organisation role/permission UX and make subscription plan limits fully configurable/visible without changing the security model or database schema.

## Completed
- Added client-only organisation capability matrix for `org_admin`, `project_manager`, `kb_editor`, `kb_viewer`.
- Kept server RBAC authoritative; client matrix only controls presentation/navigation.
- Added direct-route UX guards for foreign organisations and role-incompatible organisation/agent sections.
- Removed duplicate Platform Admin AI Platform navigation item.
- Hid agent creation for Editor/Viewer roles and publish/edit surfaces for read-only roles.
- Added role capability contract tests and focused UI CI verification job.
- Rewired admin Plans UI from absent legacy endpoints to current versioned platform-plan API.
- Added draft-version discovery and publish flow in the Plans UI.
- Exposed TTS/STT/translation daily limits in public/admin plan APIs and plan editor.
- Exposed those limits in organisation Billing UI.
- Fixed plan-guard fallback resolution so voice/language budgets remain effective.
- No migrations, immutable/reference-source edits, MCP additions, or D-023 billable tool metering changes.

## Verification state
- Source review: PASS for intended bounded changes.
- Existing RBAC server enforcement: preserved.
- Existing dashboard/billing/member UI: retained and extended.
- Focused UI test/CI job: added but not yet independently observed as executed on the latest head.
- Global typecheck/lint: known repository baseline/reference-tree failures remain.
- Vercel: latest head does not have a usable preview deployment; combined status reports Hobby build-rate-limit failure.
- Phase 7-C: remains OPEN; no closure/pass claimed.

## Next
1. Observe fresh CI results for the latest head and focused UI job.
2. Run/reproduce immutable-source, library-integrity, secret-pattern and runtime-boundary gates.
3. Fresh-context governance review and closure decision.
4. Only then close Phase 7-C if all acceptance evidence supports it.
