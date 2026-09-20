# AI Configuration Migration — Deploy Runbook

Release sequence for the AI configuration platform + agent versioning rollout
(implements `docs/superpowers/plans/2026-09-20-clara-ai-configuration-platform-agent.md`
and `docs/superpowers/plans/2026-09-20-clara-ai-configuration-migration.md`).

## 1. Deploy the release

```bash
git pull
docker compose build && docker compose up -d
```

Schema migration `040_ai_governance_and_agent_versioning.sql` applies
automatically on boot (`ensureMigrated`). It is **purely additive** — no legacy
column or table is dropped.

## 1b. Take a pre-migration backup (Phase 0 procedure)

Before running the data migration, snapshot the AI configuration state and the
full database (migration plan § "Before migration" + § Rollback):

```bash
# Logical export of every AI-configuration table (read-only, secrets redacted):
node scripts/backup-ai-configuration.mjs

# Full physical backup (needs pg_dump + gzip on PATH; password never in argv):
node scripts/backup-ai-configuration.mjs --pg-dump

# Both artifacts land in backups/ (gitignored):
#   backups/ai-configuration-<timestamp>.json   — logical, auditable, redacted
#   backups/clara-full-<timestamp>.sql.gz       — physical, complete, secret-bearing
```

Notes:

- The script is **read-only** — it never writes to the database.
- `--include-secrets` includes `platform_env_settings` secret values in the
  JSON export; only use it when the backup target is access-controlled.
- Works before AND after migration 040 (missing tables are recorded as
  `TABLE_MISSING`), so the same command produces the pre-migration safety
  snapshot and the post-migration verification snapshot.
- Restore path for the physical dump:
  `gunzip -c clara-full-<timestamp>.sql.gz | psql <database>`.
- Copy artifacts off-host — `backups/` is gitignored on purpose.

## 2. Run the data migration (once, after the release is up)

```bash
# Backup first (see § 1b), then dry-run — report only, no writes:
node scripts/migrate-ai-configuration.mjs

# Apply (idempotent — safe to re-run):
node scripts/migrate-ai-configuration.mjs --apply

# Verification checklist (migration plan §18):
node scripts/migrate-ai-configuration.mjs --verify
```

The script:

- populates the provider registry (Stage B/C) and repairs stale legacy
  organisation allow-lists additively;
- creates Main + immutable versions for every active agent (Stage E), imports
  legacy `config_snapshots` as `legacy_snapshot` versions with UNKNOWN
  parentage (Stage G — never fabricated);
- creates production deployments for currently published agents;
- leaves Default-Assistant provenance NULL for historical agents (Stage F);
- writes a retained report artifact to
  `docs/superpowers/reports/2026-09-20-ai-configuration-migration-report.md`.

## 3. Post-deploy checks

- `GET /api/platform/ai/providers` (super admin) → four providers with correct
  configured/enabled/capability state.
- Organisation agent workspace header shows `Main · vN` and the published badge.
- Public embed still resolves (production serves the deployed immutable
  version; unpublished agents keep the legacy dual-read path — counted in logs
  as `legacy resolution fallback`).
- Old org AI settings writes now receive an explicit `410 AI_SETTINGS_MIGRATED`
  response (Stage J freeze).

## Rollback

- **Schema failure** → roll back the application release; additive tables stay.
- **Data migration failure** → stop re-running the script; legacy data is
  intact (nothing was modified or deleted).
- **Runtime failure** → the resolver keeps the legacy chain as fallback for
  agents without deployments; publishing failure keeps serving the last
  deployment.
- Immutable versions are NEVER deleted by any rollback path.

## What organisation users see after the rollout

- Organisation → Settings no longer contains "AI Providers & Models".
- Agents open into the workspace: Overview / Assistant & AI / Knowledge / Tools
  / Versions / Publish, with persistent branch + version + published context.
- Editing targets a DRAFT; "Save version" creates an immutable version;
  "Publish" points production at an exact version. Nothing else affects
  production.
