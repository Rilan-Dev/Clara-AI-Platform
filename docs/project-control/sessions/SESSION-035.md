# SESSION-035 — Integrations I-1 current-state architect review

Date: 2026-10-05
Owner: ChatGPT
Branch: feature/ai-core-from-doable-source
Current branch tip: d9705441b016d565923f9e0813d7a22544aef8c8
Authorization: D-031

## Review target

Fresh-context review of the current I-1 Integrations Framework contract/test foundation after the recorded correction at bfc40f671aea218def571c617f00789e15b45823.

## Findings

- The corrected contract removes generic connection metadata and generic error-detail bags.
- Connection and credential-vault lookups require concrete connection IDs.
- Integration actions require zod-backed input schemas.
- The integration bridge is explicitly typed to the Phase 7 Unified Tool Runtime; no second executor is introduced.
- The threat model preserves host ownership of persistence, credential decryption, OAuth transport, egress/SSRF policy, and runtime execution.
- The current branch tip is d9705441; the correction commit bfc40f67 is an ancestor of the current tip.
- The current PR is #265. The connected GitHub Actions surface exposes no workflow run for the current feature head, and combined commit status exposes only the unrelated Vercel status.

## Architect disposition

**Gate D: PASS_WITH_FOLLOWUP.** The corrected I-1 contract boundary is architecturally acceptable, but executable Gate-C evidence is still required before I-1 can close.

No correction is authorized from this review. The next bounded action is to obtain executable CI evidence for the exact current head, then perform the final Gate-D closure review.

## Non-scope

No I-2, OAuth routes, persistence, credential-vault implementation, outbound HTTP/egress execution, integration action runtime, Activepieces dependency, deployment, billing changes, MCP runtime, or Phase 8 work.

## Stopping boundary

I-1 remains IMPLEMENTED — VERIFICATION PENDING.

## 2026-10-06 — Vercel build-boundary and install-path correction

Authorization: D-032 / I-2 verification-correction boundary

### Finding
A real Vercel build for commit `085aa90b34767f18cc58059493ffcf7a732866eb` failed during Next.js type checking, not compilation. The failing file was `docs/doable-source/adapters/ui-inventory.ts`, a reference-only source file using `surface:"confirmation"` while its local reference type omitted that value.

The application TypeScript globs were broad enough to traverse `docs/doable-source/**`. Modifying the immutable/reference file would be the wrong correction.

### Duration diagnosis
- `npm install --legacy-peer-deps --include=dev`: ~19 minutes.
- `npm run db:migrate`: ~2 seconds; migrations were already applied.
- Next.js compilation: ~93 seconds.
- Lint/type check before the error: ~94 seconds.
- The 681 npm vulnerability report and deprecation/Browserslist warnings did not cause the failure.

### Corrections
- Excluded `docs/doable-source/**` from `tsconfig.json` and `tsconfig.typecheck.json`.
- Excluded `docs/doable-source/` from Vercel deployment input via `.vercelignore`; the reference source remains in Git.
- Changed Vercel installation from `npm install --legacy-peer-deps --include=dev` to deterministic `npm ci --legacy-peer-deps --include=dev` using the committed lockfile.

Commits: `990d414ccb4176cc5c6048dc2671f14d4a6a436d`, `ed86221a2e2a144d4c0566443ea0c3bf543cabb8`, `2f539729ee7f2958bee2724bb3a3ed69589667fd`, `0da813b174204692cf229b4b015e63a358a70acf`.

### Ignore-file review
- `.gitignore` is not responsible for the Vercel type-check traversal.
- `.vercelignore` was missing the reference-only Doable tree and is now corrected.
- `.npmignore` is absent; this is not relevant to the Vercel repository build because npmignore governs npm package publication.
- `package-lock.json` exists and contains the declared `@e965/xlsx@0.20.3` entry.

### Verification
These are bounded source/build-path corrections only. No immutable/reference source was modified. Gate-C remains pending until corrected current-head build/test/typecheck/lint evidence is actually executed. I-2 remains open.

No I-3, MCP expansion, production promotion, or unrelated implementation is authorized.