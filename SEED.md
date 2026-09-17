# SEED — Demo Data & Seeding (Developer Guide)

How the platform's seed data is structured, what each command does, and why
re-running any of them is safe. All seed logic lives in
`src/lib/db/seed/` and `scripts/`.

> **Audience** — developers setting up demo/staging environments.  
> Setup steps: `SETUP.md` §5. Tenant-facing story: `TENANT-GUIDE.md`.

---

## 1. Three layers

| Layer | Code | Creates | Command |
|-------|------|---------|---------|
| **Production bootstrap** | `src/lib/db/seed/production.ts` | Roles, 4 subscription plans, platform admin, the "Clara" demo org + Enterprise subscription + demo user | `npm run seed:prod` (runs automatically on first prod boot) |
| **Demo dataset** | `src/lib/db/seed/demo.ts` (721 lines) | The two customer tenants, their KBs, agents, personas, documents, synthetic analytics | `npm run seed` |
| **Sample documents** | `scripts/generate-seed-docs.mjs` + content modules | 5 fictional PDFs under `public/seed-docs/` (~160 KB, deterministic) | `npm run seed:docs` |

`development.ts` is a thin compatibility wrapper that now delegates to the
demo dataset, so historic `seed:dev` invocations behave like `npm run seed`.

## 2. What `npm run seed` actually does

Runs `scripts/seed-demo.ts` → `seedDemoData()`:

1. **Bootstrap first** — roles/plans/platform admin (idempotent upserts).
2. **Omen United Insurance (Pro plan)** — org, `org_admin`
   `omen-admin@omeninsurance.com` / `Omen1234!`, two project agents, three
   knowledge bases (Home / Motor / Life & Health), the **Aria** persona
   (navy `#1e293b` + gold `#d97706`), and the three seeded policy PDFs
   queued through the **real ingest pipeline** (`documents` +
   `ingest_jobs` rows — the poller processes them exactly like customer
   uploads).
3. **TechVision Solutions (Starter plan)** — org,
   `techvision-admin@techvision.io` / `Tech1234!`, one agent, two KBs, the
   **Sage** persona (slate + sky `#0ea5e9`), two seeded PDFs.
4. **Synthetic analytics** — 500 (Omen) + 200 (TechVision) deterministic
   `query_events` spread over the last 30 days: mulberry32 PRNG, business
   hours only, realistic surface mix (workspace/embed/voice), org-tagged,
   with token + cost metering so dashboards, org analytics and revenue
   screens all show plausible live data.

Everything is **idempotent**: fixed UUIDs + `ON CONFLICT` upserts. Run it
twice, get the same state. Credentials are overridable via
`CLARA_OMEN_ADMIN_EMAIL/PASSWORD`, `CLARA_TECHVISION_ADMIN_EMAIL/PASSWORD`,
`CLARA_ADMIN_EMAIL/PASSWORD`.

## 3. Reset semantics — `npm run seed:reset`

`resetDemoData()` purges **only** the fixed demo UUID scope (both demo
orgs, their users, agents, KBs, documents, chunks, events, embed keys) and
re-seeds from scratch. Rows you created yourself (your own org, uploads,
API keys) are untouched — the scope is defined by UUID constants inside
`demo.ts`, never by "delete everything".

Typical loop while developing against the demo tenants:

```bash
npm run seed:reset     # wipe demo scope + reseed
node scripts/e2e-phase5.js   # 53 checks: idempotency, logins, analytics parity
```

## 4. The sample PDFs

`scripts/generate-seed-docs.mjs` builds them deterministically with
pdf-lib (no network, byte-identical across runs):

```
public/seed-docs/omen/Home-Insurance-Policy-2024.pdf        (26 pages)
public/seed-docs/omen/Motor-Insurance-Comprehensive.pdf      (21 pages)
public/seed-docs/omen/Life-Health-Plans-Guide.pdf            (19 pages)
public/seed-docs/techvision/Engineering-Runbook-v2.pdf       (13 pages)
public/seed-docs/techvision/Product-Docs-Overview.pdf        (11 pages)
```

Content modules (`seed-docs-content-*.mjs`) hold realistic policy
wordings, excess tables (e.g. the £500 theft excess the e2e suite cites),
claims processes and runbook prose. Every title page and footer carries an
explicit **fictional-document notice** so demo PDFs can never be mistaken
for real policies. 13 unit tests pin the generators (page counts, content
markers, determinism).

## 5. Production bootstrap details

`production.ts` is intentionally minimal — no demo noise on a real install:

- roles + permissions (RBAC spine),
- the four plans from migration 006 at their published versions,
- one platform admin (`CLARA_ADMIN_EMAIL` default `admin@clara.ai`,
  password from `CLARA_ADMIN_PASSWORD` — **change the default in any real
  deployment**),
- the "Clara" demo org + Enterprise subscription + `demo@clara.ai` user
  that powers the marketing landing demo.

It runs on first production boot (guarded by `schema_migrations`-style
markers, so it never duplicates history) and is safe to re-run.

## 6. Verifying seeded state

```bash
npm run seed
node scripts/e2e-phase5.js        # 53/53: seeding, logins, analytics, cited answers
psql "$DATABASE_URL" -c "SELECT slug, plan_id FROM org_subscriptions s JOIN organisations o ON o.id=s.org_id;"
```

The e2e suite re-checks both tenant logins, per-KB analytics totals
against SQL, and that streamed answers **cite the seeded PDFs** — the
fastest confidence check that ingest + retrieval are wired end-to-end.
