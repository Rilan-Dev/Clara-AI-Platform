/**
 * scripts/seed-docs-content-techvision.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Content definitions for the two fictional TechVision Solutions sample
 * documents used by the Phase 5 demo seed. All product names, URLs, ports,
 * figures and procedures are fictional demonstration values.
 */

export const TECHVISION_DOCS = [
  {
    title: "Product Docs Overview",
    filename: "Product-Docs-Overview.pdf",
    meta: {
      subtitle: "TechVision Flow Platform — Product Documentation Overview",
      version: "Docs v3.4 (Sample)",
      reference: "Sample document TV-PROD-2024-SAMPLE-001",
      pages: 12,
    },
    sections: [
      {
        heading: "1. About TechVision Flow",
        blocks: [
          { p: "This is a SAMPLE document created for demonstration purposes only. TechVision Solutions is a fictional software company, and TechVision Flow is a fictional data workflow platform. Every endpoint, limit, port and price in this document is invented so that assistants in the TechVision demo knowledge base can answer realistic product questions. Nothing here describes a real product or a real service." },
          { p: "TechVision Flow is a cloud platform for building, scheduling and monitoring data pipelines. Teams connect sources such as databases, object storage and SaaS applications, transform the data with a visual designer or code, and deliver the results to destinations like a warehouse, a lake or a webhook. The platform runs on managed infrastructure, handles retries and backfills automatically, and exposes every operation through a REST API." },
          { p: "The core object model is simple: a workspace contains spaces; a space contains pipelines; a pipeline contains steps; a step reads from a source, transforms data, or writes to a destination. Runs are executions of a pipeline; each run produces logs, metrics and lineage records. Connectors authenticate to external systems through connection objects whose credentials are encrypted at rest and never returned by the API." },
        ],
      },
      {
        heading: "2. Getting Started",
        blocks: [
          { p: "New workspaces are created from the signup flow and arrive with a sample space containing two tutorial pipelines. The first task for a new team is usually connecting a source: choose the connector type from the catalogue, supply credentials, and test the connection from the wizard. The second task is building a pipeline: drag a source step, optionally add transform steps, and finish with a destination step. A pipeline can be run manually for testing and then scheduled." },
          {
            bullets: [
              "Create a workspace from the web console, accepting the sample data pack.",
              "Invite team members and assign roles as described in Section 6.",
              "Create a connection for each external system you will read from or write to.",
              "Build your first pipeline in the designer, run it manually, and inspect the run log.",
              "Attach a schedule to run the pipeline automatically — cron syntax or the visual interval picker.",
              "Add alerting rules so failed runs notify your team channel.",
            ],
          },
          { p: "The onboarding checklist in the console tracks these steps and unlocks a guided tour for each one. Completing the checklist also provisions the sample datasets used by the tutorial pipelines, which can be deleted at any time. There is no charge for sample data or tutorial runs on any plan." },
        ],
      },
      {
        heading: "3. Core Concepts and Object Model",
        blocks: [
          {
            table: {
              cols: ["Object", "Purpose", "Key fields (sample API)"],
              rows: [
                ["Workspace", "Billing and membership boundary", "id, name, plan, region"],
                ["Space", "Team and project grouping inside a workspace", "id, name, owner, members"],
                ["Pipeline", "Ordered graph of steps with a schedule", "id, name, steps, schedule, status"],
                ["Step", "Source, transform or destination node", "id, type, config, retryPolicy"],
                ["Run", "One execution of a pipeline", "id, pipelineId, startedAt, state, metrics"],
                ["Connection", "Stored credentials for a connector", "id, connector, authType, scopes"],
                ["Secret", "Reusable encrypted value for steps", "id, name, version"],
              ],
            },
          },
          { p: "Objects are addressed by immutable identifier in the API and by name in the console. Deleting a space requires deleting or moving its pipelines first; deleting a pipeline retains run history for the workspace retention window so that lineage and audit queries still resolve. Runs are immutable: a failed run is retried as a new run linked to the original by the parentRunId field." },
        ],
      },
      {
        heading: "4. Data Sources and Connectors",
        blocks: [
          { p: "The connector catalogue covers four families: database sources (fictional Postgres-compatible, MySQL-compatible and warehouse connectors), file sources (object storage buckets, SFTP and public HTTPS), SaaS application sources (CRM, billing, support and analytics suites), and streaming sources (webhook ingress and queue topics). Each connector declares the sync modes it supports: full refresh, incremental by cursor, and change data capture where the upstream system offers it." },
          { p: "Connections store credentials encrypted with workspace-scoped keys. The console never displays a stored secret again after creation; the API returns only the connection metadata. Rotating a credential is a two-step operation — create the new connection version, then repoint pipelines at it — which lets cutover happen without editing each pipeline individually. Failed syncs due to expired credentials raise a specific error code that alerting rules can target." },
          { p: "Sample catalogue entries include the CRM connector syncing accounts and contacts incrementally by updated_at cursor; the billing connector streaming invoice events; the warehouse connector performing full refresh with partition parallelism; and the support connector pulling tickets with change data capture. Requesting a new connector is a product-request workflow inside the console; requests are triaged monthly." },
        ],
      },
      {
        heading: "5. Building and Scheduling Pipelines",
        blocks: [
          { p: "Pipelines are built in the visual designer or as code in the pipeline-as-code editor using the fictional Flow YAML dialect. Both views are interchangeable: the designer renders the same graph the YAML describes. Steps execute in dependency order; conditional branches choose paths on expression predicates, and parallel fan-out runs independent branches concurrently up to the plan concurrency limit." },
          { p: "Schedules use cron expressions in the workspace timezone, with a visual picker for common intervals. The minimum schedule interval on any plan is 5 minutes. Each scheduled run receives the pipeline's parameter values; parameters can be supplied per schedule, and the API accepts overrides per manual run. Backfills replay a schedule's interval over a historical window as separate runs, respecting concurrency limits so a backfill never starves fresh schedules." },
          { p: "Retry policies are attached per step: exponential backoff defaults to three attempts with a 30-second initial delay, bounded by a maximum elapsed time. Steps can be marked as allowing partial success so downstream steps continue when a non-critical branch fails, and the run then completes with a warning state instead of an error state." },
        ],
      },
      {
        heading: "6. Permissions and Roles",
        blocks: [
          { p: "Workspaces have five roles: owner, admin, developer, analyst and viewer. Owners manage billing and can delete the workspace. Admins manage members, connections and settings but cannot change the plan. Developers create and edit pipelines and connections. Analysts run pipelines and read all data, metrics and logs but cannot edit definitions. Viewers read dashboards and lineage only. Membership is managed per space with the same role set, scoped to that space." },
          {
            table: {
              cols: ["Capability", "Owner", "Admin", "Developer", "Analyst", "Viewer"],
              rows: [
                ["Manage billing and plan", "Yes", "No", "No", "No", "No"],
                ["Manage members and roles", "Yes", "Yes", "No", "No", "No"],
                ["Create connections and secrets", "Yes", "Yes", "Yes", "No", "No"],
                ["Edit pipelines", "Yes", "Yes", "Yes", "No", "No"],
                ["Run pipelines manually", "Yes", "Yes", "Yes", "Yes", "No"],
                ["Read dashboards and lineage", "Yes", "Yes", "Yes", "Yes", "Yes"],
              ],
            },
          },
          { p: "Service accounts are non-human members with a single role and a token instead of a password; they are recommended for CI automation. All permission checks are enforced server-side; the console hides what the API would reject, so a user who can see a button always has the right to click it." },
        ],
      },
      {
        heading: "7. API Overview",
        blocks: [
          { p: "The Flow REST API is served from the fictional base URL https://api.flow.techvision.example with versioned paths such as /v1/pipelines and /v1/runs. Authentication uses bearer tokens issued per member or per service account; tokens expire after 90 days and are rotated from the console. All responses are JSON, timestamps are UTC ISO-8601, and errors use a consistent envelope with code, message and a request id for support." },
          {
            bullets: [
              "GET /v1/pipelines — list pipelines with cursor pagination (page size up to 100).",
              "POST /v1/pipelines — create a pipeline from a definition object or Flow YAML.",
              "POST /v1/pipelines/{id}/run — trigger a manual run with optional parameter overrides.",
              "GET /v1/runs/{id} — fetch run state, step states, timings and metrics.",
              "POST /v1/runs/{id}/cancel — request cancellation; steps finish their current transaction.",
              "GET /v1/lineage?asset={id} — lineage graph for a dataset asset.",
            ],
          },
          { p: "Webhooks complement polling: subscribe to events such as run.completed, run.failed, connection.expired and pipeline.created, and Flow delivers a signed JSON payload to your HTTPS endpoint with retries over 24 hours. The signature header authenticates deliveries using the subscription's shared secret, and a 64-bit delivery id supports idempotent consumption." },
        ],
      },
      {
        heading: "8. Rate Limits and Quotas",
        blocks: [
          { p: "API rate limiting is the mechanism that keeps the multi-tenant platform fair: every token can issue up to 1,000 requests per minute to the REST API, with a burst allowance of 100 additional requests that refills at the steady rate. Responses carry X-RateLimit-Limit, X-RateLimit-Remaining and X-RateLimit-Reset headers, and a 429 response includes a Retry-After header in seconds. Sustained abuse triggers progressive throttling rather than hard revocation." },
          { p: "Concurrent runs are limited by plan: the Team plan allows 2 concurrent runs per workspace, Business allows 10, and Enterprise negotiates dedicated capacity. Queued runs beyond the concurrency limit wait in FIFO order with a fair-share component per pipeline so a single chatty pipeline cannot monopolise the queue. Run duration is capped at 6 hours on Team, 12 on Business, and configurable on Enterprise." },
          { p: "Other quotas include 100 connections per workspace on Business, 1,000 scheduled triggers per hour across the workspace, and payload sizes limited to 10 MB per webhook delivery and 50 MB per synchronous API request. Hitting a quota returns the specific quota code in the error envelope, which the console's diagnostics page decodes into the exact limit, current usage and the plan that raises it." },
        ],
      },
      {
        heading: "9. Monitoring, Logs and Lineage",
        blocks: [
          { p: "Every run emits structured logs viewable in the console with level, step, message and correlation id; logs are retained 7 days on Team, 30 days on Business and 1 year on Enterprise. Metrics include rows read and written per step, duration, memory high-water mark and retry counts. Dashboards aggregate pipeline success rates and freshness of destination datasets; freshness widgets alert when a schedule has not produced new data within its expected window." },
          { p: "Lineage is captured automatically as runs execute: source datasets, transforms and destination datasets become nodes in a graph queryable by asset. Impact analysis answers which downstream reports break if an upstream schema changes. Lineage retention matches log retention per plan, and lineage exports to a JSON graph are available on Business and above." },
        ],
      },
      {
        heading: "10. Security and Compliance (Fictional)",
        blocks: [
          { p: "Flow encrypts data in transit with TLS 1.3 and at rest with workspace-scoped keys managed through the fictional key management service. Connections run in an isolated credential plane with no network egress except to the configured upstream. Audit logs record every API call, console action and permission change with actor, object, action and request id, and are exportable to your log sink on Business and above." },
          { p: "The fictional compliance posture includes SOC2-style controls, regional data residency on Enterprise, and IP allow-listing of API tokens on request. Penetration test summaries are shared with customers under the fictional NDA programme. Nothing in this section describes a real certification; the platform is a demonstration artefact." },
        ],
      },
      {
        heading: "11. Plans and Billing (Fictional)",
        blocks: [
          {
            table: {
              cols: ["Plan", "Monthly list price (sample)", "Concurrent runs", "Log retention"],
              rows: [
                ["Team", "\u00a340 per member", "2", "7 days"],
                ["Business", "\u00a380 per member", "10", "30 days"],
                ["Enterprise", "Custom", "Negotiated", "1 year"],
              ],
            },
          },
          { p: "Billing is per member per month, prorated for mid-cycle joins and removals. Trial workspaces convert to a paid plan after 14 days; pipelines are paused, not deleted, during the grace period after downgrade, and resume when the plan is restored. Invoices are downloadable from the fictional billing portal, and usage-based overages for extra run hours are itemised per pipeline." },
        ],
      },
      {
        heading: "12. Support, SLAs and FAQ",
        blocks: [
          { p: "Support operates a ticket queue with target first-response times of 8 business hours on Team, 4 on Business and 1 hour with a 24/7 escalation path on Enterprise. The fictional availability SLA is 99.9% monthly for the API and console on Business and Enterprise, with service credits applied automatically to invoices when the target is missed. Status is published at the fictional status page with incident timelines." },
          { qa: { q: "How do I set up a new development environment?", a: "Create a separate workspace named for the environment, invite only the developers who need it, and clone pipelines into it with the pipeline-as-code export and import. Use service-account tokens rather than personal tokens for anything automated." } },
          { qa: { q: "What is our API rate limiting strategy?", a: "1,000 requests per minute per token with a 100-request burst that refills continuously; 429 responses carry Retry-After. Webhook deliveries and console traffic do not count toward the API budget." } },
          { qa: { q: "How do I roll back a failed deployment of a pipeline change?", a: "Every pipeline edit is versioned; open the pipeline history and restore the previous version, which takes effect on the next run. Runs already completed are immutable and are not affected by the restore." } },
          { p: "TechVision Solutions is a fictional company; this document ends the product overview sample. All endpoints, limits and prices are demonstration values for the TechVision knowledge base." },
        ],
      },
    ],
  },
  {
    title: "Engineering Runbook v2",
    filename: "Engineering-Runbook-v2.pdf",
    meta: {
      subtitle: "TechVision Platform Engineering — Operations Runbook",
      version: "Runbook v2.1 (Sample)",
      reference: "Sample document TV-ENG-2024-SAMPLE-002",
      pages: 10,
    },
    sections: [
      {
        heading: "1. Purpose and Scope",
        blocks: [
          { p: "This is a SAMPLE runbook created for demonstration purposes. TechVision Solutions is a fictional company, and every command, hostname, port, threshold and escalation contact in this runbook is invented. The runbook exists so that assistants in the TechVision demo knowledge base can answer operational questions about environment setup, deployment, rollback, backups, monitoring and on-call escalation." },
          { p: "The runbook covers the platform's primary services: the API tier, the worker tier that executes pipeline runs, the scheduler service, and the shared Postgres and Redis dependencies. It is written for the on-call engineer holding the platform pager, and assumes familiarity with the fictional internal tooling named in each section. Change management requires that every procedure here be executed exactly as written, with deviations recorded in the incident channel." },
        ],
      },
      {
        heading: "2. Development Environment Setup",
        blocks: [
          { p: "How do I set up a new development environment? The supported local stack runs on Node.js 22 with the fictional package manager, a local Postgres 16 on port 5433, and Redis 7 on 6380. The bootstrap sequence below brings a laptop from zero to a running platform in roughly 20 minutes." },
          {
            bullets: [
              "Install Node.js 22.x and verify with node --version; the fictional toolchain refuses other majors.",
              "Clone the platform repository and copy .env.example to .env — the example file contains working localhost defaults.",
              "Run the database bootstrap: ./scripts/dev-db-up.sh starts Postgres 16 on 5433 and Redis 7 on 6380 in detached mode.",
              "Install dependencies with the frozen lockfile: pnpm install --frozen-lockfile.",
              "Apply migrations: pnpm db:migrate — idempotent, safe on an existing volume.",
              "Seed demo data: pnpm db:seed — creates the fictional sample orgs and pipelines.",
              "Start the stack: pnpm dev — API on localhost:4000, worker and scheduler in watch mode.",
            ],
          },
          { p: "The verification checklist after bootstrap: hit http://localhost:4000/healthz and expect 200 OK; run pnpm test:smoke for the 12-check smoke suite; and confirm the worker registers by checking the workers table has a heartbeat newer than 60 seconds. Common setup failures are a stale volume from an old branch — fixed with pnpm db:reset — and a port conflict on 5433 from a previous detached container." },
        ],
      },
      {
        heading: "3. CI/CD Pipeline Overview",
        blocks: [
          { p: "Every merge to main triggers the fictional CI pipeline: lint and typecheck in parallel, the unit suite next, then an integration suite that boots the real Postgres and Redis service containers, and finally a container build that produces the api and worker images tagged with the commit SHA. Merges to release branches additionally run the deployment rehearsal, which applies migrations against a throwaway copy of the production snapshot." },
          { p: "Deployments are promoted through three environments: staging receives every main build automatically; canary receives builds promoted by the release manager; production receives builds only after canary metrics pass their gates for 30 minutes — error rate under 0.5%, p99 latency within 10% of baseline, and worker queue depth back to steady state. A failed gate halts promotion and pages the release manager, never auto-rolling back silently." },
        ],
      },
      {
        heading: "4. Deploying to Production",
        blocks: [
          { p: "How do I deploy to production? Production deployments run through the fictional deploy CLI and follow the sequence below. Total downtime is zero: the API tier is behind a rolling load balancer, and the worker tier drains in-flight runs before replacing each pod." },
          {
            bullets: [
              "Step 1 — Announce the deploy in #platform-release with the release candidate SHA and the changelog link.",
              "Step 2 — Confirm canary gates passed: deployctl status canary must show all gates green for the RC.",
              "Step 3 — Run the preflight: deployctl preflight prod — verifies migrations are dry-run clean, disk headroom, and replication lag under 5 seconds.",
              "Step 4 — Apply migrations: deployctl migrate prod — migrations are expand-only and backward compatible by convention; contract-breaking changes ship in two phases.",
              "Step 5 — Roll the API tier: deployctl rollout prod api — 10%, then 50%, then 100%, with automatic halt on error-budget burn.",
              "Step 6 — Roll the worker tier: deployctl rollout prod worker — drains each pod for up to 15 minutes before replacement.",
              "Step 7 — Verify: deployctl verify prod — checks healthz on every pod, synthetic read/write probes, and scheduler heartbeat.",
              "Step 8 — Close the release in #platform-release with the verify summary and mark the changelog entry shipped.",
            ],
          },
          { p: "Deployment windows are business hours on Tuesdays and Thursdays; emergency deploys outside windows require a second approver through the break-glass workflow, which logs to the audit trail automatically. Never apply a migration that the preflight flags as contracting without the two-phase plan attached." },
        ],
      },
      {
        heading: "5. Rollback Procedure",
        blocks: [
          { p: "How to roll back a failed deployment? Rollback is the first remedy whenever production error rate exceeds 1% for 5 minutes or p99 latency doubles after a rollout. Roll forward only when the fix is already built and verified; otherwise roll back." },
          {
            bullets: [
              "Step 1 — Freeze the rollout: deployctl rollout prod api --pause stops further percentage increases immediately.",
              "Step 2 — Roll back the API tier: deployctl rollback prod api --to <previous-SHA> — redeploys the previous image; takes about 3 minutes.",
              "Step 3 — Roll back the worker tier: deployctl rollback prod worker --to <previous-SHA>.",
              "Step 4 — Database: because migrations are expand-only, no down-migration is performed. The rollback runbook keeps the expanded columns and the old code simply ignores them.",
              "Step 5 — Verify recovery: deployctl verify prod plus watch the error rate and queue depth dashboards for 15 minutes.",
              "Step 6 — Post-incident: file the rollback note in the incident record; the platform retrospective reviews whether the release gate missed the defect class.",
            ],
          },
          { p: "If the defect is in a migration's data transformation rather than the code, rollback alone does not heal data: engage the data-recovery procedure in the incident runbook, restore affected rows from the nearest snapshot, and only then roll forward with the corrected migration. The two-phase migration convention exists precisely to keep this window rare." },
        ],
      },
      {
        heading: "6. Database Backup and Restore",
        blocks: [
          { p: "What are the database backup procedures? Automated backups run nightly at 02:00 UTC: a full physical snapshot of the Postgres data volume, shipped to the fictional object storage bucket with 30-day retention, plus continuous write-ahead-log archiving that exposes a 5-minute recovery point objective. A weekly logical dump (pg_dump, compressed) is retained 90 days for cross-region restores and partial table recovery." },
          {
            bullets: [
              "Verify the latest snapshot: backupctl status — shows last success, size, and integrity check result.",
              "Restore to a scratch instance: backupctl restore --snapshot latest --to scratch-<ticket> — provisions an isolated clone in about 12 minutes.",
              "Point-in-time recovery: backupctl restore --pitr '2026-09-17 09:35' --to scratch-<ticket> — replays WAL to the minute.",
              "Partial table recovery: restore the weekly logical dump, extract the table, and load it with the standard upsert script.",
            ],
          },
          { p: "The quarterly restore drill is mandatory: each rotation, the on-call restores last night's snapshot to a scratch instance, runs the smoke suite against it, and records the measured restore time in the runbook's drill log. The recovery time objective is 60 minutes for a full region loss, using the cross-region replica and the weekly logical dump; the replica can be promoted with replicactl promote --force, which pages the secondary on-call for confirmation." },
        ],
      },
      {
        heading: "7. Monitoring and Alerting",
        blocks: [
          { p: "What monitoring tools do we use? The fictional observability stack is: Prometheus for metrics with 15-second scrape intervals; Grafana for dashboards, with the golden-signals board open during incidents; Sentry for API error tracking with release tagging; and the ELK-style log cluster for structured logs, searched through the fictional Kibana front-end. Synthetic probes run from three external regions every 30 seconds against healthz and a read/write pair." },
          { p: "Alerts route through Alertmanager to the on-call rotation, with severity levels matching the incident levels in Section 9. Burn-rate alerting protects the error budget: a 2% burn in 1 hour or a 5% burn in 6 hours pages immediately. Queue depth on the worker tier alerts at 1,000 pending runs for 10 minutes; replication lag alerts at 15 seconds; certificate expiry alerts at 21 days." },
          { p: "Dashboard conventions: every service panel names its owner team, every alert links to its runbook section here, and every dashboard carries a link to the on-call calendar. If an alert fires without a linked runbook section, the on-call files a documentation bug — that is a defect in the runbook, not noise to be silenced." },
        ],
      },
      {
        heading: "8. On-Call Escalation Process",
        blocks: [
          { p: "What is the on-call escalation process? Primary on-call holds the pager for the platform rotation, one week at a time, handing over at 10:00 UTC on Mondays with a written handover note. Unacknowledged pages escalate after 5 minutes to the secondary, after another 5 minutes to the engineering manager, and after a further 10 minutes to the fictional VP of Engineering. Break-glass access to production escalates in parallel with the page, requiring the secondary's approval for any change outside the procedures in this runbook." },
          {
            table: {
              cols: ["Timeline", "Escalation target"],
              rows: [
                ["T+0", "Primary on-call paged (Sev-1/Sev-2)"],
                ["T+5 min unack", "Secondary on-call paged"],
                ["T+10 min unack", "Engineering manager paged"],
                ["T+20 min unack", "VP Engineering paged; incident bridge opened"],
              ],
            },
          },
          { p: "Every Sev-1 incident opens a bridge call and an incident channel automatically from the pager payload. The incident commander role separates coordination from investigation: the commander runs the timeline, calls for rollbacks, and is the only voice authorising production changes. Customer communication drafts live in the incident template library and are posted by the communications lead, not by whoever happens to be typing." },
        ],
      },
      {
        heading: "9. Incident Severity Levels",
        blocks: [
          {
            table: {
              cols: ["Severity", "Definition (fictional)", "Response target"],
              rows: [
                ["Sev-1", "Production down or data loss risk; >50% of requests failing", "Acknowledge 5 min, bridge immediately"],
                ["Sev-2", "Major feature degraded; error rate 1-50%; no data risk", "Acknowledge 15 min, update hourly"],
                ["Sev-3", "Minor degradation or cosmetic defect with workaround", "Acknowledge 1 business day"],
                ["Sev-4", "Bug in non-production path or documentation gap", "Next sprint triage"],
              ],
            },
          },
          { p: "Severity is set by the incident commander at declaration and re-evaluated every 30 minutes; a Sev-2 that breaches the 50% error threshold is upgraded without waiting for the scheduled review. Post-incident reviews are blameless, scheduled within 5 business days for Sev-1 and Sev-2, and every action item gets an owner and a due date tracked to closure in the engineering review." },
        ],
      },
      {
        heading: "10. Glossary and Closing",
        blocks: [
          {
            table: {
              cols: ["Term", "Meaning (fictional)"],
              rows: [
                ["RC", "Release candidate — a commit SHA promoted through canary to production."],
                ["RPO / RTO", "Recovery point / recovery time objective for the backup regime."],
                ["Burn rate", "Speed of error-budget consumption used for alerting."],
                ["Expand-only migration", "A schema change that old code can safely ignore."],
                ["Break-glass", "The emergency approval path for out-of-procedure changes."],
              ],
            },
          },
          { p: "TechVision Solutions is a fictional company; this runbook is a demonstration artefact for the TechVision knowledge base. All commands, hosts, thresholds and escalation targets are invented, and no real infrastructure is described." },
        ],
      },
    ],
  },
];
