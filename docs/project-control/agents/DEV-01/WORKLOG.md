# DEV-01 Role-Local Worklog

Append-only operational history for DEV-01. This is not the source of authorization.

## Entry format

### <SESSION-ID> / <DATE>
- **Task:** <task>
- **Authorization:** <reference or safe-maintenance classification>
- **Started from:** <commit/ref>
- **Actions:** <what was done>
- **Files/code:** <paths>
- **Evidence:** <tests/checks/observations>
- **Blockers/dependencies:** <none or exact>
- **Lesson:** <reusable lesson or none>
- **Next action:** <exact next action>

<!-- Append new entries below. -->


### SESSION-DEV-20261009-01 / 2026-10-09

- **Authorization:** Current `docs/project-control/NEXT_ACTION.md` bounded integration-runtime task; realtime voice dispatch through the Unified Tool Runtime was the explicit next implementation.
- **Started from:** `feature/ai-core-from-doable-source`, recovered from current committed project-control state.
- **Actions:** Added gated realtime integration tool descriptors, an authenticated server-side tool dispatch route, voice-client dispatch handling, and focused regression source for descriptor gating, tenant identity derivation, authorization, and runtime delegation.
- **Files/code:** `src/modules/assistant/api/realtime.ts`; `src/modules/assistant/api/realtime-tool.ts`; `src/app/api/realtime/tool/route.ts`; `src/modules/assistant/core/hooks/useOpenAIRealtime.ts`; `src/modules/assistant/api/realtime.test.ts`; `src/modules/assistant/api/realtime-tool.test.ts`.
- **Implementation commits:** a2dee343b099edef6ad6337fef976047c3f59aa5, c36b5b67beabad175ea9530293846ef8763b3151, f3e8efda5b7a12173e313ee4f476774c62092e52, a64e8f3258b9ab8e59f4f0258c600b1e0ddf13e9, a218e2a354e0c83e7944dbe9b32ad6bebbb574bf, f830efd8fb03f778a4277b2817cc2e684266c3cb, 29e470aea416cd3cc1af56e0a27a1320013498f5, e6da6968d3d7d6e422b309e5188562578f2adb56.
- **Evidence:** Source files and test source were inspected after edits. Tests/build were not executed; no CI/Vercel/Gates were awaited.
- **Blockers/dependencies:** Architect review pending. No deployment performed.
- **Lesson:** Realtime model tool descriptors are not an authorization boundary; every tool call must re-enter a same-origin authenticated endpoint and derive tenant/agent/user/session identity server-side before invoking the shared runtime.
- **Next action:** Architect review this bounded implementation; route any substantial defect to FIX-01. No unrelated implementation is authorized by this task.


### SESSION-DEV-20261009-03 / 2026-10-09

- **Task:** Add a reachable WhatsApp Business Messaging entry point to the existing per-agent workspace and expose the connection-start action.
- **Authorization:** Explicit current owner task; DEV-01 / Forge. No CI/Vercel gate or repeated verification wait.
- **Started from:** `feature/ai-core-from-doable-source`; project-control recovered from the current GitHub branch.
- **Actions:** Added the Messaging route and screen, a Connect WhatsApp Business dialog with a Meta Business Manager handoff, and the Messaging link in the existing desktop agent sidebar and mobile tabs. Preserved the single existing sidebar; no second rail was added.
- **Files/code:** `src/features/admin/screens/agent-messaging-screen.tsx`; `src/app/(admin)/orgs/[id]/agents/[agentId]/messaging/page.tsx`; `src/features/admin/layouts/admin-shell.tsx`; `src/features/admin/screens/agent-workspace/workspace-shell.tsx`.
- **Commits:** `751db6158fca1b85b6f6c933ad46b45635bfeaf1`, `292e8ea5dd5f7c1548d22a196324035f933de762`, `7d0e28314af14fd1739fa1746f5855632645b4d8`, `8fe3ee7c168c0bbc0d1e837514f1e0a3cab73500`.
- **Evidence:** Source writes returned successful GitHub commits. No tests/typecheck/build/CI/Vercel/live Meta flow was run or awaited.
- **Blockers/dependencies:** Repository search/source inspection found no WhatsApp-specific OAuth/connect API, webhook verification route, or durable WhatsApp message persistence implementation. The UI explicitly states that opening Meta does not connect the number; connection status remains Not connected. This is a real backend capability gap, not a UI success.
- **Lesson:** Never show “connected” just because a user was sent to an external provider. Channel UI must derive readiness from server-persisted connection and verified webhook state.
- **Next action:** Implement the server-side Meta WhatsApp Business connection lifecycle: authenticated per-agent connect initiation, durable single-number-per-agent binding, signed/verified webhook subscription and inbound event handling, and persistent message/delivery state; then wire the UI to the real status and callback result. Do not route this to OPS-01 unless deployment/infrastructure work becomes necessary.
