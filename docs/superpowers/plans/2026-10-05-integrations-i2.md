# Integrations I-2 — Control Plane, Agent Access and Doable Runtime

Date: 2026-10-05
Owner: ChatGPT

## Objective
Deliver Clara integrations as a first-class platform capability using docs/doable-source/** as the authoritative implementation/reference source. The Doable integration registry and runner are reused as the source basis; Clara-specific tenancy, RBAC, plan entitlement, credential storage, and AI-tool authorization are host bindings.

## Implemented
1. Imported Doable integration type vocabulary and registry families into src/modules/integrations/**.
2. Preserved the Doable registry source as src/modules/integrations/doable-registry.ts; communication/productivity/developer/AI/CRM/finance families are imported from the immutable snapshot.
3. Expanded the catalog to 168 integration definitions present in the extracted registry families.
4. Added platform integration controls: platform admin enable/disable and allowed-plan metadata.
5. Added organisation entitlement/access controls with plan-based maximum integration counts.
6. Added per-agent integration grants; an agent can only use integrations explicitly enabled by its organisation.
7. Added encrypted integration connections using pgp_sym_encrypt and server-only credential reads.
8. Added integration action store scoped by organisation/agent.
9. Added the Doable/Activepieces runner support files and a Clara-bound credential vault/context/runtime adapter.
10. Registered integration_availability and guarded integration_action with the existing Unified Tool Runtime so Chat/Realtime/Embed surfaces use the same authorization boundary and bounded agent loop.
11. Added platform, organisation, and agent UI routes and navigation.
12. Added @e965/xlsx@0.20.3 to the application dependency/lock boundary to resolve the user-reported Docker build blocker without touching immutable/reference source.
13. Added focused registry/CI verification coverage.

## Remaining gates
- OAuth application credentials and callback configuration must be supplied per provider before OAuth connections can be exercised.
- The application manifest now includes the Doable Activepieces piece dependency set, but the lockfile has not yet been regenerated for that large dependency expansion because the current ChatGPT runtime cannot reach npm/GitHub from the local execution container. npm install --legacy-peer-deps must regenerate/synchronize it in the executable build environment.
- Production Docker build, focused integration typecheck/tests/lint, migration execution, and browser verification remain pending.
- No billable tool-usage event was introduced; integration execution remains audit/operational telemetry.

## Acceptance boundary
An I-2 PASS requires dependency install/lock synchronization; migration execution; registry tests; strict typecheck/lint of runtime/API/UI; credential encryption smoke test; platform→org→agent access test; action-runner smoke test with at least one real connector; and browser verification of the three access surfaces. Until those gates are observed, I-2 is IMPLEMENTED — VERIFICATION PENDING.
