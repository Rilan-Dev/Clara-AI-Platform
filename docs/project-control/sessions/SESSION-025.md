# SESSION-025 — I-015 lockfile reconciliation checkpoint

Date: 2026-10-04  
Owner: ChatGPT  
Branch: `feature/ai-core-from-doable-source`  
Authorization: D-025 / continuation plan Task 2

## Finding

The branch `package.json` declares `@vercel/functions ^3.9.9`. The current `package-lock.json` contains the matching root dependency plus `node_modules/@vercel/functions@3.9.9` with resolved URL/integrity and its `@vercel/oidc@3.8.9` dependency; the matching OIDC package entry is present.

## Verification boundary

Static repository inspection confirms the lockfile metadata is present and internally connected at the relevant package nodes. The required executable `npm install`/typecheck/full verification has not been run because the current sandbox lacks the repository checkout and outbound clone is blocked.

## Ruling

**Ruling:** treat the lockfile metadata as reconciled but keep I-015 OPEN until executable verification is available — this preserves the plan's evidence standard and costs only a deferred closure rather than risking a false resolution.

## Next

Re-establish an executable repository workspace and run the Task 2 verification commands, then continue the Task 3–5 regression matrix and whole-branch review.