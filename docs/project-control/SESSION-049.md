# SESSION-049 — Vercel deployment diagnosis and bounded correction

**Date:** 2026-10-06  
**Owner:** ChatGPT / Architect  
**Branch:** `feature/ai-core-from-doable-source`

## Scope

Bounded I-2 verification/build correction only. No I-3, MCP expansion, production promotion, or unrelated implementation.

## Vercel deployment reviewed

Deployment:
`dpl_2zSX7vRmLwJUDYXRdnE1YpeD1noL`

Project:
`clara-backend`

Commit:
`535be16b8db2957580221e29b6a9f67726ff98a2`

Result:
`ERROR`

### Root cause

The deployment failed before application compilation because Vercel ran:

`npm ci --legacy-peer-deps --include=dev`

npm reported that `package.json` and `package-lock.json` are not synchronized. The missing lock entries include the newly declared `@activepieces/*` dependency family.

Representative Vercel errors:
- `npm ci can only install packages when your package.json and package-lock.json ... are in sync`
- `Missing: @activepieces/piece-activecampaign@0.1.3 from lock file`
- `Missing: @activepieces/piece-amazon-sqs@0.1.3 from lock file`
- `Missing: @activepieces/piece-amazon-sns@0.1.3 from lock file`
- `Missing: @activepieces/piece-amazon-ses@0.1.3 from lock file`
- and many additional Activepieces packages.

This is a dependency/lock synchronization failure, not a Next.js source-code failure.

## Bounded correction

Commit:
`3d87c000b7f3bdee337d524eeb06718094ebeb84`

Changed only `vercel.json`:

`npm ci --legacy-peer-deps --include=dev`

to

`npm install --legacy-peer-deps --include=dev`

Reason: allow Vercel to resolve the declared dependency graph while the repository lockfile remains unsynchronized. This is an operational build unblock, not a claim that the lockfile problem is permanently resolved.

## Independent lockfile verification attempt

A clean Vercel sandbox was created and the exact current `package.json` was loaded from commit `535be16b8db2957580221e29b6a9f67726ff98a2`.

Command attempted:

`npm install --package-lock-only --legacy-peer-deps --include=dev --no-audit --no-fund`

The resolver ran for approximately 827 seconds (~13.8 minutes) and exited with failure. The sandbox stopped before its final logs could be recovered. No generated lockfile was accepted or committed.

Therefore:
- No lockfile was fabricated.
- No immutable/reference source was modified.
- `package-lock.json` remains an open synchronization issue.
- `npm ci` must not be restored until a genuine regenerated lockfile passes `npm ci` verification.

## Vercel deployment-limit constraint

A fresh deployment could not be created through the connected Vercel deployment API because the team has exhausted the Hobby deployment creation quota:

`api-deployments-free-per-day`

The API reported 100/100 deployments with the counter reset in approximately 24 hours. Existing Vercel history also shows repeated feature-branch deployments/cancellations, explaining the current limit.

This prevents claiming a fresh Vercel build result from commit `3d87c000b7f3bdee337d524eeb06718094ebeb84` at this checkpoint.

## Verification status

- Vercel deployment `2zSX7vRmLwJUDYXRdnE1YpeD1noL`: **FAILED — dependency lock mismatch**
- Immediate source correction: **COMMITTED**
- Fresh Vercel build of correction: **NOT OBSERVED — deployment quota exhausted**
- Lockfile synchronization: **OPEN**
- I-2 Gate-C: **MISSING**
- I-2 Gate-D: **IN PROGRESS**
- I-2 PASS: **NOT CLAIMED**

## Next bounded action

When deployment capacity is available, deploy current feature HEAD and inspect the complete build path. If `npm install` reaches application compilation, resolve only the next concrete build/type/test blocker. Separately, regenerate `package-lock.json` using a reproducible npm environment and restore `npm ci` only after executable strict-install verification succeeds.

No production promotion or phase closure is authorized by this record.
