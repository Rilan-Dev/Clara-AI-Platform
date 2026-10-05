# SESSION-047 — I-2 dependency-install reproducibility boundary

Date: 2026-10-06
Role: ChatGPT — architect / implementation owner / reviewer
Phase: Integrations Framework I-2
Starting repository state: `0c273806b79459d8dc9cc8521a6a534e21c6e07a`.

## Work performed

1. Reconfirmed from `NEXT_ACTION.md` that Activepieces manifest/lock synchronization is an explicit remaining I-2 verification item.
2. Confirmed the repository's Vercel build path currently installs with `--legacy-peer-deps`; this flag must be reproduced when a lockfile is generated and later consumed by `npm ci`.
3. Added a root `.npmrc` with `legacy-peer-deps=true` so future clean-install and lock-generation operations use the same peer-resolution mode instead of relying on an external CI/Vercel flag.
4. No package versions, product behavior, runtime code, migrations, or immutable/reference files were changed.

## Evidence

- Commit: `b5b51b6f93d1162b8bd83e6312490ee56256905f`
- File: `.npmrc`
- Remaining dependency task: the package-lock still needs to be regenerated from the 529 declared Activepieces packages in an environment with npm-registry access.

## Verification disposition

This makes the dependency-resolution mode deterministic but does **not** claim lock synchronization. Gate-C remains OPEN/MISSING and Gate-D remains IN_PROGRESS.

## Stopping boundary

No I-3, MCP expansion, production promotion, or unrelated dependency changes were started.
