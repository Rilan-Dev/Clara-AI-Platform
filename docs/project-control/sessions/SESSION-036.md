# SESSION-036 — UI test-readiness and Docker build-boundary follow-up

Date: 2026-10-05
Owner: ChatGPT
Branch: feature/ai-core-from-doable-source

## Current product surface reviewed

The existing agent workspace UI is present and wired on the active branch. No duplicate sidebar was introduced.

Verified route surfaces:
- Overview: `/orgs/[id]/agents/[agentId]`
- Assistant & AI: `/config`
- FAQ: `/faq`
- Knowledge: `/knowledge`
- Capabilities/Tools: `/tools`
- Branches: `/versions`
- Publish: `/publish`

The existing workspace also provides:
- organisation sidebar with the selected agent hierarchy;
- global agent topbar with branch/version, draft state, Preview and Publish controls;
- branch search/create/merge/archive controls;
- per-branch history entry;
- half-canvas Branch History flow via `?history=1&branch=...`;
- pending-change review before publish;
- responsive phone navigation;
- draft/public publishing separation.

This review found no need for a UI rewrite or second sidebar.

## Build evidence and correction

The user supplied a local Docker build log showing Next.js compilation succeeded but type checking entered the immutable Doable reference tree and failed on its reference-only `@e965/xlsx` import.

The repository already contains the correct architectural correction: `tsconfig.json` and `tsconfig.typecheck.json` exclude `ai-platform-core/**` and `clara-core/**` from the application TypeScript boundary.

A temporary attempt to declare `@e965/xlsx` as an application dependency was identified as incorrect because it would make a reference-only dependency part of the runtime dependency graph. That change was immediately reverted. The application manifest/lockfile boundary is restored.

## Current verification state

- I-1 remains IMPLEMENTED — VERIFICATION PENDING under D-031.
- I-019 remains VERIFICATION PENDING until an executable production build confirms the existing TypeScript boundary correction.
- A CI attempt for an intermediate manifest state failed immediately across jobs with no step logs; the temporary dependency change was reverted and is not treated as product evidence.
- No Phase 8, I-2, OAuth transport, persistence, credential vault, egress execution, integration runtime, deployment, or billing changes were introduced by this session.

## Next bounded action

Execute the production build from the current head. In parallel/afterward, obtain the current I-1 focused CI evidence and perform the final architect Gate-D review. Do not close I-1 without executable Gate-C evidence.
