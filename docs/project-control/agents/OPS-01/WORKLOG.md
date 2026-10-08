# OPS-01 Role-Local Worklog

Append-only operational history for OPS-01. This is not the source of authorization.

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

### OPS-01-2026-10-09-DEPLOYMENT-SPLIT / 2026-10-09
- **Task:** Re-diagnose the two active deployment paths and distinguish current failures from already-resolved historical blockers.
- **Authorization:** OPS-01 operational diagnosis/routing only; application/build source changes are not authorized.
- **Started from:** feature/ai-core-from-doable-source at 8efae4712accd025ce5be6c476a3019e8199c1d0; Vercel deployment dpl_22XsSPHMrei8mh5StC8b4ytVGGke on Vercel-Preview fa46778f08b604125e942f4d39b249017254a8d2.
- **Actions:** Confirmed separate Vercel-Preview branch. db:migrate now succeeds and applies 061_payment_settings_category.sql; active Vercel failure is Cannot find name 'CliLog' at production.ts:37. Feature seed imports CliLog plus listIntegrations; Vercel-Preview lacks integrations/registry.ts. Docker worker succeeds; backend fails only at final standalone copy of node_modules/lodash.defaults, proving Docker/BuildKit is functioning and the Dockerfile assumes a specific npm hoisting layout.
- **Files/code:** No application source changed by OPS-01.
- **Evidence:** Vercel deployment events and local Docker log supplied by the operator.
- **Blockers/dependencies:** FIX-01 owns both bounded corrections; no infrastructure setting change is indicated.
- **Lesson:** Diagnose each deployment path against its own ref. Do not keep routing stale migration/Tailwind failures after current logs prove those stages fixed.
- **Next action:** FIX-01 corrects Vercel-Preview seed dependency synchronization and Docker standalone dependency packaging. OPS-01 does not poll or wait.

<!-- Append new entries below. -->

### OPS-01-2026-10-09 / 2026-10-09
- **Task:** Diagnose failed Vercel deployment and route the smallest authorized remedy.
- **Authorization:** OPS-01 operational diagnosis/routing only; application migration edits not authorized.
- **Started from:** Vercel deployment aBdMD92VM3ZoHmQzqKQULZPuLTvf, Vercel-Preview / 4ea79c3b3bbb5202a25f2411b63471354200b01d.
- **Actions:** Recovered project-control records; inspected src/lib/db/migrate.ts; confirmed the runner enumerates src/lib/db/migrations, extracts numeric prefixes, and fails closed on duplicates before executing migrations. Inspected the exact Vercel deployment metadata and confirmed the failed command was npm run db:migrate && npm run build. Inspected commit 4ea79c3b3bbb5202a25f2411b63471354200b01d and confirmed PR #273 added src/lib/db/migrations/060_payment_settings_category.sql. Compared against Vercel-Preview, where 060_sarvam_realtime_streaming.sql already exists and 061_payment_settings_category.sql is the corrected numbering pattern. No Vercel project setting or deployment workaround was changed.
- **Files/code:** No application source changed by OPS-01. Project-control records updated with the incident, routing, evidence, and next action.
- **Evidence:** Vercel deployment state ERROR; error code BUILD_UTILS_SPAWN_1; error step buildStep; error message Command npm run db:migrate && npm run build exited with 1; log line [db:migrate] duplicate migration numbers detected: 060. Vercel project is Git-linked to Rilan-Dev/Clara-AI-Platform. Current project-control explicitly says external CI/Vercel execution is deferred and must not be awaited.
- **Blockers/dependencies:** FIX-01 must correct the duplicate migration source before a successful Vercel build is possible from that deployment branch.
- **Lesson:** This is an application migration defect, not a Vercel infrastructure failure. The correct OPS response is diagnosis plus routing, not bypassing migrations or weakening the guard.
- **Next action:** FIX-01 corrects the deployment-branch migration filename/number; after the correction, a future deployment may be run when externally authorized. OPS-01 does not poll or wait for that deployment.


### OPS-01-2026-10-09-DOCKER / 2026-10-09
- Task: Diagnose local Docker Compose production-image build failure on feature/ai-core-from-doable-source.
- Authorization: OPS-01 operational diagnosis/routing; do not silently alter application behavior.
- Started from: feature/ai-core-from-doable-source after git pull advanced local branch from 853dfaf8 to 5a79fe6f.
- Actions: Recovered NEXT_ACTION.md and role-local records. Inspected package.json and postcss.config.js. Confirmed tailwindcss is 4.3 while postcss.config.js still registers tailwindcss directly. Classified the failure as Next.js CSS compilation, not Docker/BuildKit infrastructure. clara-worker built and exported successfully; clara-backend failed at next build. Confirmed @tailwindcss/postcss is not declared. A temporary PostCSS edit was made only to validate the diagnosis and immediately reverted because OPS-01 is not authorized to retain application-source changes.
- Files/code: postcss.config.js restored to its original content; no product fix retained.
- Evidence: Docker build failed at RUN npm run build; Next.js 16.4.0 reported that tailwindcss cannot be used directly as the PostCSS plugin and that the plugin moved to @tailwindcss/postcss.
- Blockers/dependencies: FIX-01/DEV-01 must update package.json, package-lock.json, and postcss.config.js consistently.
- Lesson: a frontend toolchain compatibility error inside next build is an application build-configuration defect even when surfaced through Docker. Do not modify Dockerfile/npm reproducibility to hide it.
- Next action: FIX-01 applies the lockfile-backed Tailwind v4 PostCSS migration. OPS-01 does not poll or wait for CI/Vercel.
