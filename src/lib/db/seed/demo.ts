import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { PoolClient } from "pg";

import { pool } from "@/lib/db";
import { hashPassword } from "@/modules/auth/core/password";
import { seedProductionData } from "@/lib/db/seed/production";
import {
  createDocument,
  createIngestJob,
  listDocuments,
} from "@/modules/knowledge-bases/core/documents-db";

/**
 * Demo seed — the Phase 5 "clone → npm run seed → working demo" dataset.
 *
 * Builds on the production bootstrap (admin user, platform settings, landing
 * demo, Clara demo org) and adds the two showcase tenants:
 *
 *   • Omen United Insurance   (Pro plan)      org admin: omen-admin@omeninsurance.com
 *   • TechVision Solutions    (Starter plan)  org admin: techvision-admin@techvision.io
 *
 * Each tenant gets a project agent, knowledge bases, an assistant persona
 * (Aria — navy/gold, insurance tone; Sage — slate/sky, technical tone), the
 * fictional sample documents from public/seed-docs/ queued through the REAL
 * ingest pipeline (documents + ingest_jobs rows — any running worker with
 * provider access processes them), and a deterministic spread of synthetic
 * query_events so analytics dashboards render realistic data immediately.
 *
 * Everything is idempotent: re-running reconciles rows by fixed UUIDs and
 * (kb_id, original_filename) document identity, and regenerates the synthetic
 * analytics dataset. `resetDemoData()` purges only the demo tenants' data
 * (fixed UUID scope) and re-seeds — production traffic is never touched.
 *
 * NEVER run against a live production database (scripts/seed-demo.ts guards
 * on NODE_ENV=production).
 */

type Logger = Pick<typeof console, "log" | "warn" | "error">;

const DEMO_IDS = {
  omenOrgId:     "10000000-0000-0000-0000-000000000010",
  techvisionOrgId: "10000000-0000-0000-0000-000000000011",
  omenAgentId:   "20000000-0000-0000-0000-000000000010",
  tvAgentId:     "20000000-0000-0000-0000-000000000011",
  omenKbHome:    "30000000-0000-0000-0000-000000000010",
  omenKbMotor:   "30000000-0000-0000-0000-000000000011",
  omenKbLife:    "30000000-0000-0000-0000-000000000012",
  tvKbProduct:   "30000000-0000-0000-0000-000000000013",
  tvKbEng:       "30000000-0000-0000-0000-000000000014",
  omenAdminUserId:  "40000000-0000-0000-0000-000000000010",
  tvAdminUserId:    "40000000-0000-0000-0000-000000000011",
} as const;

/** All demo KB ids — the scope for synthetic analytics and reset. */
export const DEMO_KB_IDS = [
  DEMO_IDS.omenKbHome,
  DEMO_IDS.omenKbMotor,
  DEMO_IDS.omenKbLife,
  DEMO_IDS.tvKbProduct,
  DEMO_IDS.tvKbEng,
] as readonly string[];

const DEMO_ORG_IDS = [DEMO_IDS.omenOrgId, DEMO_IDS.techvisionOrgId] as readonly string[];

/** Synthetic events per KB (Omen totals 500, TechVision 200 — per plan). */
export const DEMO_EVENT_COUNTS = {
  [DEMO_IDS.omenKbHome]: 200,
  [DEMO_IDS.omenKbMotor]: 150,
  [DEMO_IDS.omenKbLife]: 150,
  [DEMO_IDS.tvKbProduct]: 120,
  [DEMO_IDS.tvKbEng]: 80,
} as const;

/** Fictional chat model actually configured on the platform (for realism). */
const DEMO_MODEL = "gpt-5.6-terra";
const DEMO_PROVIDER = "openai";

// ── deterministic PRNG (pure, unit-tested) ───────────────────────────────────

/**
 * mulberry32 — small, fast, deterministic PRNG. The demo dataset must be
 * reproducible: same seed → same synthetic analytics on every machine.
 * Exported for tests.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type SyntheticQueryEvent = {
  kbId: string;
  orgId: string;
  userId: string | null;
  queryText: string;
  answerText: string | null;
  surface: "workspace" | "embed" | "voice";
  status: "ok" | "error";
  latencyMs: number;
  sourceCount: number;
  promptTokens: number;
  completionTokens: number;
  costUsdMicros: string;
  createdAt: Date;
};

type QaTemplate = { q: string; a: string };

const QA_LIBRARY: Record<string, QaTemplate[]> = {
  [DEMO_IDS.omenKbHome]: [
    { q: "Does my home insurance cover flood damage?", a: "Yes — flood is covered under both Section A (buildings) and Section B (contents) of the Omen Shield policy, with a specific flood excess of £500 per claim [S1]." },
    { q: "What is the excess for an escape of water claim?", a: "Escape of water from fixed installations carries a £350 excess. The resulting damage is covered; repairing the source of the leak itself is not [S1]." },
    { q: "Are bicycles covered under home contents insurance?", a: "At the insured address, unspecified bicycles are covered up to £500 in total. Any bicycle worth more must be specified, and cover away from home requires Section C with an approved lock [S1]." },
    { q: "Is garden equipment covered by my policy?", a: "Yes — garden furniture, mowers, barbecues and power tools are covered up to £2,500 in total under Section B, with theft from the open covered only when locked away overnight [S1]." },
    { q: "What is the single article limit for contents?", a: "£2,500 per item, pair or set. Valuables such as jewellery and works of art are limited to one third of the contents sum insured overall [S1]." },
    { q: "Does the policy cover accidental damage?", a: "Only when the accidental damage extension is purchased — it covers one-off incidents like a smashed television or a nail through a pipe, with the standard £250 excess [S1]." },
    { q: "What is the cooling-off period for my policy?", a: "14 days from receiving the full policy documentation, with a full premium refund provided no claim has been made [S1]." },
    { q: "What is not covered by standard home insurance?", a: "Wear and tear, gradual deterioration, storm damage to fences and hedges, deliberate acts, war, and the cost of repairing the source of a leak are excluded [S1]." },
    { q: "Is theft from my shed covered?", a: "Yes, provided there is evidence of violent and forcible entry to the shed itself; the standard £250 theft excess applies [S1]." },
    { q: "What does subsidence cover include?", a: "Subsidence, landslip and heave are covered under Section A with a £1,000 excess per building per period of insurance. Underpinning and root damage are covered; the tree's value is not [S1]." },
    { q: "How do I make a claim for accidental damage?", a: "Notify us within 48 hours, provide photographs and receipts within 30 days, allow the loss adjuster to inspect, and reasonable emergency repair costs are reimbursed [S1]." },
    { q: "Does home insurance cover home office equipment?", a: "Yes — up to £5,000 in total under Section B for clerical, administrative or study use; business stock requires the business extension [S1]." },
    { q: "What happens if my house is unoccupied for 40 days?", a: "Theft, malicious damage, escape of water and glass breakage cover is suspended after 30 consecutive days of unoccupancy unless we agree otherwise [S1]." },
    { q: "Am I covered for storm damage to my fence?", a: "No — storm damage to fences, gates and hedges is excluded under the standard wording [S1]." },
  ],
  [DEMO_IDS.omenKbMotor]: [
    { q: "What is the excess for motor theft claims?", a: "The theft excess is £500 on the Omen Drive comprehensive policy, and the vehicle must have had its security conditions met for the claim to succeed [S1]." },
    { q: "Can I add a named driver to my motor policy?", a: "Yes — named drivers can be added at any time through a mid-term adjustment. Drivers under 25 or with under 12 months' licence attract a £600 young-driver excess [S1]." },
    { q: "How does the no-claims discount work?", a: "NCD builds one step per claim-free year up to 55% after five years. One fault claim steps back two levels; protection allows one fault claim without the step-back [S1]." },
    { q: "What is the difference between comprehensive and third party fire and theft?", a: "Comprehensive adds accidental damage to your own car, windscreen cover, a courtesy car, personal accident benefit and personal belongings cover [S1]." },
    { q: "How long does a motor insurance claim take?", a: "Acknowledgement within 24 hours, an estimate within 3 working days of inspection, and total-loss settlement within 10 working days; disputed liability or injury claims typically take 3 to 9 months [S1]." },
    { q: "Is a courtesy car provided during repairs?", a: "Yes — a small hatchback is provided for up to 14 days while your car is repaired by the approved network, or for 7 days after a total-loss settlement [S1]." },
    { q: "What is the windscreen excess?", a: "£75 for a chip repair and £150 for a full replacement; repairs do not affect your no-claims discount [S1]." },
    { q: "Does my motor policy cover commuting?", a: "Yes if the usage class is SDP plus commuting — travel to and from a single fixed workplace, including park-and-ride parking [S1]." },
    { q: "What is my car insured for if it is written off?", a: "Market value at the date of loss, assessed from trade guides and comparable vehicles; outstanding finance is settled first [S1]." },
    { q: "Are track days covered by my policy?", a: "No — racing, pace-making, speed testing and track days are excluded at every cover level [S1]." },
    { q: "What should I do after a car accident?", a: "Make the scene safe, exchange details, photograph the vehicles and the road, report injuries to the police, then notify the claim [S1]." },
    { q: "Does the policy cover personal belongings in the car?", a: "Yes, up to £200 in total under comprehensive cover, excluding items insured elsewhere, money and business goods [S1]." },
  ],
  [DEMO_IDS.omenKbLife]: [
    { q: "What documents do I need for a life insurance claim?", a: "A certified death certificate, the policy schedule, the completed claimant's statement, and proof of authority — probate, letters of administration or the trust deed [S1]." },
    { q: "Does critical illness cover pay for early-stage cancer?", a: "Early-stage and non-invasive cancers receive a partial payment of 25% of the sum assured, and the plan continues in force for the remaining sum [S1]." },
    { q: "What is the deferred period on income protection?", a: "You choose 4, 8, 13, 26 or 52 weeks; shorter deferred periods cost more because claims begin sooner [S1]." },
    { q: "Are children covered under critical illness?", a: "Yes — children's critical illness is included automatically, paying up to £25,000 or 50% of the adult sum assured without reducing adult cover [S1]." },
    { q: "What is the grace period for missed premiums?", a: "30 days — cover continues during the grace period, and the policy lapses if the premium remains unpaid after it [S1]." },
    { q: "Can I write my life policy in trust?", a: "Yes — a trust pays proceeds directly to your beneficiaries outside the estate, avoiding probate delays; Omen supplies a simple trust form with every policy [S1]." },
    { q: "What is the suicide exclusion period?", a: "Suicide within the first 12 months of a life or critical illness policy is excluded [S1]." },
    { q: "Does the health plan cover physiotherapy?", a: "Yes — £30 per session up to £360 per benefit year, after the 3-month waiting period [S1]." },
    { q: "How do waiting periods work on the health plan?", a: "Inpatient hospital nights are payable immediately; surgical and outpatient benefits begin after 3 months of continuous membership. Accidental injury claims are exempt from waiting periods [S1]." },
    { q: "What happens if my policy lapses?", a: "Within 12 months you can reinstate on payment of arrears and confirmation of health; after 12 months a new application is required [S1]." },
    { q: "Is income protection benefit taxable?", a: "Yes — benefits are taxable as earnings, which is why the benefit is capped at 60% of gross earnings [S1]." },
    { q: "What is the free-look period?", a: "14 days to return the documents for a full premium refund, provided no claim has been made [S1]." },
  ],
  [DEMO_IDS.tvKbProduct]: [
    { q: "How do I set up a new development environment?", a: "Create a separate workspace, invite only the developers who need it, and clone pipelines using the pipeline-as-code export and import. Use service-account tokens for automation [S1]." },
    { q: "What is our API rate limiting strategy?", a: "1,000 requests per minute per token with a 100-request burst that refills continuously; 429 responses carry Retry-After, and webhook and console traffic do not count toward the budget [S1]." },
    { q: "How do I authenticate to the Flow API?", a: "Bearer tokens issued per member or service account, sent on versioned paths such as /v1/pipelines; tokens expire after 90 days [S1]." },
    { q: "What roles are available in a workspace?", a: "Owner, admin, developer, analyst and viewer — permission checks are enforced server-side so the console hides only what the API would reject [S1]." },
    { q: "Do you support webhooks?", a: "Yes — subscribe to events such as run.completed and run.failed; deliveries are signed JSON payloads with retries over 24 hours [S1]." },
    { q: "How much does the Business plan cost?", a: "£80 per member per month with 10 concurrent runs and 30-day log retention, versus £40 per member on Team with 2 concurrent runs [S1]." },
    { q: "What is lineage used for?", a: "Lineage maps source, transform and destination datasets into a queryable graph; impact analysis shows which downstream reports break if an upstream schema changes [S1]." },
    { q: "What sync modes do connectors support?", a: "Full refresh, incremental by cursor, and change data capture where the upstream system offers it [S1]." },
    { q: "How do I trigger a pipeline manually?", a: "POST /v1/pipelines/{id}/run with optional parameter overrides, or press Run in the console [S1]." },
    { q: "What is the minimum pipeline schedule interval?", a: "5 minutes on any plan, using cron expressions interpreted in the workspace timezone [S1]." },
  ],
  [DEMO_IDS.tvKbEng]: [
    { q: "How do I set up a new development environment?", a: "Install Node 22, clone the repo, run ./scripts/dev-db-up.sh for Postgres 16 on 5433 and Redis 7 on 6380, pnpm install --frozen-lockfile, then pnpm db:migrate and pnpm dev [S1]." },
    { q: "How do I deploy to production?", a: "Announce the RC in #platform-release, confirm canary gates, run deployctl preflight prod, apply migrations, roll api then worker with deployctl rollout, verify, and close the release [S1]." },
    { q: "How to roll back a failed deployment?", a: "deployctl rollback prod api --to <previous-SHA>, then the worker tier; migrations are expand-only so no down-migration runs. Verify recovery and file the rollback note [S1]." },
    { q: "What are the database backup procedures?", a: "Nightly full snapshots at 02:00 UTC with 30-day retention, continuous WAL archiving for a 5-minute recovery point, and a weekly logical dump kept 90 days [S1]." },
    { q: "What monitoring tools do we use?", a: "Prometheus for metrics at 15-second scrapes, Grafana dashboards, Sentry for error tracking, and the ELK log cluster; synthetic probes run from three regions every 30 seconds [S1]." },
    { q: "What is the on-call escalation process?", a: "Primary on-call is paged first; unacknowledged pages escalate to secondary after 5 minutes, engineering manager after 10, and VP Engineering after 20 with an incident bridge [S1]." },
    { q: "What is a Sev-1 incident?", a: "Production down or data-loss risk with over 50% of requests failing — acknowledge within 5 minutes and open the bridge immediately [S1]." },
    { q: "How do I restore a database snapshot?", a: "backupctl restore --snapshot latest --to scratch-<ticket> provisions an isolated clone in about 12 minutes; point-in-time recovery replays WAL to the minute [S1]." },
    { q: "What are the canary promotion gates?", a: "Error rate under 0.5%, p99 latency within 10% of baseline, and worker queue depth back to steady state — all sustained for 30 minutes [S1]." },
    { q: "When do backups run and how long are they kept?", a: "Nightly at 02:00 UTC — snapshots kept 30 days, the weekly logical dump kept 90 days [S1]." },
  ],
};

/**
 * Deterministic synthetic query_events for the demo KBs. Pure function —
 * exported for unit tests. Timestamps are relative to `now` so the dataset
 * always covers the trailing 30 days, but day/hour/status/token distributions
 * are identical for a given seed on every run.
 *
 * Fictional token pricing: $2.50 per million prompt tokens, $10 per million
 * completion tokens (cost_usd_micros = prompt × 2.5 + completion × 10).
 */
export function generateSyntheticEvents(options: {
  now?: Date;
  seed?: number;
  counts?: Record<string, number>;
}): SyntheticQueryEvent[] {
  const now = options.now ?? new Date();
  const rand = mulberry32(options.seed ?? 20260917);
  const counts = options.counts ?? DEMO_EVENT_COUNTS;

  const events: SyntheticQueryEvent[] = [];
  for (const [kbId, count] of Object.entries(counts)) {
    const orgId = kbId === DEMO_IDS.tvKbProduct || kbId === DEMO_IDS.tvKbEng
      ? DEMO_IDS.techvisionOrgId
      : DEMO_IDS.omenOrgId;
    const userId = orgId === DEMO_IDS.techvisionOrgId
      ? DEMO_IDS.tvAdminUserId
      : DEMO_IDS.omenAdminUserId;
    const library = QA_LIBRARY[kbId] ?? [];
    if (library.length === 0) continue;

    for (let i = 0; i < count; i++) {
      const qa = library[Math.floor(rand() * library.length)]!;
      // 30-day window; weekend events are partly shifted 2 days back onto a
      // weekday (Sat→Thu, Sun→Fri) so dashboards show a realistic weekly cadence
      const dayOffsetRaw = Math.floor(rand() * 30);
      const dayProbe = new Date(now.getTime() - dayOffsetRaw * 86_400_000);
      const weekday = ((dayProbe.getUTCDay() + 6) % 7) + 1; // 1=Mon … 7=Sun
      const dayOffset = weekday > 5 && dayOffsetRaw >= 2 && rand() < 0.55
        ? dayOffsetRaw - 2
        : dayOffsetRaw;
      const base = new Date(now.getTime() - dayOffset * 86_400_000);
      // business-hours weighted: 10:00–19:00 IST ≈ 04:30–13:30 UTC
      const hourUtc = rand() < 0.8 ? 4 + Math.floor(rand() * 10) : Math.floor(rand() * 24);
      base.setUTCHours(hourUtc, Math.floor(rand() * 60), Math.floor(rand() * 60), 0);
      if (base.getTime() > now.getTime()) base.setTime(now.getTime() - 3_600_000);

      const status: "ok" | "error" = rand() < 0.95 ? "ok" : "error";
      const surfaceRoll = rand();
      const surface: SyntheticQueryEvent["surface"] =
        surfaceRoll < 0.6 ? "workspace" : surfaceRoll < 0.85 ? "embed" : "voice";
      const isWorkspaceUser = surface === "workspace" && rand() < 0.9;

      const latencyMs = 900 + Math.floor(rand() * 3600);
      const sourceCount = 2 + Math.floor(rand() * 4);
      const promptTokens = 600 + Math.floor(rand() * 1600);
      const completionTokens = 150 + Math.floor(rand() * 550);

      events.push({
        kbId,
        orgId,
        userId: isWorkspaceUser ? userId : null,
        queryText: qa.q,
        answerText: status === "ok" ? qa.a : null,
        surface,
        status,
        latencyMs,
        sourceCount,
        promptTokens: status === "ok" ? promptTokens : 0,
        completionTokens: status === "ok" ? completionTokens : 0,
        costUsdMicros: status === "ok"
          ? String(Math.round(promptTokens * 2.5 + completionTokens * 10))
          : "0",
        createdAt: base,
      });
    }
  }
  return events;
}

// ── demo tenants: orgs, users, subscriptions ────────────────────────────────

async function seedDemoTenants(client: PoolClient, logger: Logger) {
  const roleRow = await client.query<{ id: string }>(
    `SELECT id FROM roles WHERE name = 'org_admin' LIMIT 1`,
  );
  const orgAdminRoleId = roleRow.rows[0]?.id;
  if (!orgAdminRoleId) throw new Error("[seed:demo] org_admin role missing — run migrations first");

  const omenEmail = (process.env.CLARA_OMEN_ADMIN_EMAIL ?? "omen-admin@omeninsurance.com").toLowerCase().trim();
  const omenPassword = process.env.CLARA_OMEN_ADMIN_PASSWORD ?? "Omen1234!";
  const tvEmail = (process.env.CLARA_TECHVISION_ADMIN_EMAIL ?? "techvision-admin@techvision.io").toLowerCase().trim();
  const tvPassword = process.env.CLARA_TECHVISION_ADMIN_PASSWORD ?? "Tech1234!";

  const omenHash = await hashPassword(omenPassword);
  await client.query(
    `INSERT INTO users (id, email, password_hash, full_name, email_verified, status)
     VALUES ($1, $2, $3, 'Omen Portal Admin', TRUE, 'active')
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email, password_hash = EXCLUDED.password_hash,
       full_name = EXCLUDED.full_name, status = 'active'`,
    [DEMO_IDS.omenAdminUserId, omenEmail, omenHash],
  );

  const tvHash = await hashPassword(tvPassword);
  await client.query(
    `INSERT INTO users (id, email, password_hash, full_name, email_verified, status)
     VALUES ($1, $2, $3, 'TechVision Admin', TRUE, 'active')
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email, password_hash = EXCLUDED.password_hash,
       full_name = EXCLUDED.full_name, status = 'active'`,
    [DEMO_IDS.tvAdminUserId, tvEmail, tvHash],
  );

  // Keep emails unique across rows: if another user already owns this email at
  // a different id (e.g. legacy dev seed), retire the stale row's email.
  await client.query(
    `UPDATE users SET email = 'retired-' || id || '@demo.invalid'
     WHERE email = ANY($1::text[]) AND id <> ALL($2::uuid[])`,
    [[omenEmail, tvEmail], [DEMO_IDS.omenAdminUserId, DEMO_IDS.tvAdminUserId]],
  );

  await client.query(
    `INSERT INTO organisations (id, name, slug)
     VALUES ($1, 'Omen United Insurance', 'omen-insurance')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug`,
    [DEMO_IDS.omenOrgId],
  );
  await client.query(
    `INSERT INTO organisations (id, name, slug)
     VALUES ($1, 'TechVision Solutions', 'techvision')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug`,
    [DEMO_IDS.techvisionOrgId],
  );

  for (const [orgId, userId] of [
    [DEMO_IDS.omenOrgId, DEMO_IDS.omenAdminUserId],
    [DEMO_IDS.techvisionOrgId, DEMO_IDS.tvAdminUserId],
  ] as const) {
    await client.query(
      `INSERT INTO org_members (org_id, user_id, role_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (org_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id`,
      [orgId, userId, orgAdminRoleId],
    );
  }

  // Active subscriptions: Omen on Pro, TechVision on Starter — pinned to the
  // live plan rows so plan-limit enforcement sees the same terms the plan
  // pages publish (simple active rows, the signup-flow snapshot pattern is
  // reserved for the paid production demo org in the production seed).
  for (const [orgId, planId] of [
    [DEMO_IDS.omenOrgId, "pro"],
    [DEMO_IDS.techvisionOrgId, "starter"],
  ] as const) {
    const planExists = await client.query<{ id: string }>(
      `SELECT id FROM subscription_plans WHERE id = $1`, [planId],
    );
    if (!planExists.rows[0]) throw new Error(`[seed:demo] plan '${planId}' missing — run migrations first`);
    await client.query(
      `INSERT INTO org_subscriptions (org_id, plan_id, status, current_period_start, current_period_end, gateway)
       VALUES ($1, $2, 'active', now(), now() + INTERVAL '1 year', 'manual')
       ON CONFLICT (org_id) DO UPDATE SET
         plan_id = EXCLUDED.plan_id, status = 'active', paused_at = NULL,
         cancelled_at = NULL, cancel_at_period_end = FALSE,
         current_period_end = now() + INTERVAL '1 year'`,
      [orgId, planId],
    );
  }

  logger.log(
    `[seed:demo] tenants ready → ${omenEmail} (Omen/Pro), ${tvEmail} (TechVision/Starter)`,
  );
}

// ── demo agents, KBs and assistant personas ─────────────────────────────────

async function seedDemoAgentsAndKbs(client: PoolClient, logger: Logger) {
  await client.query(
    `INSERT INTO agents (id, org_id, name, description, status)
     VALUES ($1, $2, 'Omen Insurance Operations', 'Omen United Insurance internal knowledge portal', 'published')
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, description = EXCLUDED.description, status = 'published'`,
    [DEMO_IDS.omenAgentId, DEMO_IDS.omenOrgId],
  );
  await client.query(
    `INSERT INTO agents (id, org_id, name, description, status)
     VALUES ($1, $2, 'TechVision Product Team', 'Product and engineering knowledge base', 'published')
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, description = EXCLUDED.description, status = 'published'`,
    [DEMO_IDS.tvAgentId, DEMO_IDS.techvisionOrgId],
  );

  const kbs = [
    { id: DEMO_IDS.omenKbHome, agentId: DEMO_IDS.omenAgentId, name: "Home Insurance Policies", collection: "demo_omen_home_insurance" },
    { id: DEMO_IDS.omenKbMotor, agentId: DEMO_IDS.omenAgentId, name: "Motor Insurance 2024", collection: "demo_omen_motor_insurance" },
    { id: DEMO_IDS.omenKbLife, agentId: DEMO_IDS.omenAgentId, name: "Life & Health Plans", collection: "demo_omen_life_health" },
    { id: DEMO_IDS.tvKbProduct, agentId: DEMO_IDS.tvAgentId, name: "Product Documentation", collection: "demo_tv_product_docs" },
    { id: DEMO_IDS.tvKbEng, agentId: DEMO_IDS.tvAgentId, name: "Engineering Runbooks", collection: "demo_tv_engineering" },
  ] as const;

  for (const kb of kbs) {
    await client.query(
      `INSERT INTO knowledge_bases (id, agent_id, name, qdrant_collection, status)
       VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, qdrant_collection = EXCLUDED.qdrant_collection, status = 'active'`,
      [kb.id, kb.agentId, kb.name, kb.collection],
    );
  }

  // Assistant personas — AGENT-owned (one per agent, the platform's 1:1 model).
  const ariaPrompt =
    "You are Aria, the AI assistant for Omen United Insurance. Answer questions about " +
    "home, motor, life and health insurance using only information from the knowledge base. " +
    "Always cite your sources with [S1], [S2] notation. Be accurate, professional and helpful. " +
    "Quote exact excesses, limits and waiting periods from the policy documents. " +
    "If you cannot find an answer in the knowledge base, say so clearly.";
  await client.query(
    `INSERT INTO assistant_configs
       (agent_id, assistant_name, system_prompt, welcome_message, out_of_scope_reply,
        voice_id, primary_colour, accent_colour, temperature, max_tokens, cite_sources, strict_mode)
     VALUES ($1, 'Aria', $2,
       'Hello! I''m Aria, your Omen Insurance assistant. How can I help you today?',
       'I can only answer questions about Omen United Insurance policies and products.',
       'alloy', '#0a1628', '#c8821a', 0.7, 500, TRUE, TRUE)
     ON CONFLICT (agent_id) DO UPDATE SET
       assistant_name = EXCLUDED.assistant_name,
       system_prompt = EXCLUDED.system_prompt,
       welcome_message = EXCLUDED.welcome_message,
       out_of_scope_reply = EXCLUDED.out_of_scope_reply,
       primary_colour = EXCLUDED.primary_colour,
       accent_colour = EXCLUDED.accent_colour`,
    [DEMO_IDS.omenAgentId, ariaPrompt],
  );

  const sagePrompt =
    "You are Sage, the technical AI assistant for TechVision Solutions. Help engineers " +
    "and product managers find information in the TechVision Flow product documentation " +
    "and the platform engineering runbooks. Use code examples and exact commands where " +
    "helpful. Be concise and technically precise. Cite your sources with [S1], [S2] notation.";
  await client.query(
    `INSERT INTO assistant_configs
       (agent_id, assistant_name, system_prompt, welcome_message, out_of_scope_reply,
        voice_id, primary_colour, accent_colour, temperature, max_tokens, cite_sources, strict_mode)
     VALUES ($1, 'Sage', $2,
       'Hi! I''m Sage, your TechVision AI assistant. What can I help you find?',
       'I can only answer questions about TechVision product and engineering documentation.',
       'echo', '#0f172a', '#0ea5e9', 0.5, 600, TRUE, TRUE)
     ON CONFLICT (agent_id) DO UPDATE SET
       assistant_name = EXCLUDED.assistant_name,
       system_prompt = EXCLUDED.system_prompt,
       welcome_message = EXCLUDED.welcome_message,
       out_of_scope_reply = EXCLUDED.out_of_scope_reply,
       primary_colour = EXCLUDED.primary_colour,
       accent_colour = EXCLUDED.accent_colour`,
    [DEMO_IDS.tvAgentId, sagePrompt],
  );

  logger.log("[seed:demo] agents + KBs + personas (Aria navy/gold, Sage slate/sky) ready");
}

// ── demo documents through the REAL ingest pipeline ─────────────────────────

type SeedDoc = { file: string; kbId: string; title: string };

const SEED_DOCS: SeedDoc[] = [
  { file: "omen/Home-Insurance-Policy-2024.pdf", kbId: DEMO_IDS.omenKbHome, title: "Home Insurance Policy 2024" },
  { file: "omen/Motor-Insurance-Comprehensive.pdf", kbId: DEMO_IDS.omenKbMotor, title: "Motor Insurance Comprehensive" },
  { file: "omen/Life-Health-Plans-Guide.pdf", kbId: DEMO_IDS.omenKbLife, title: "Life & Health Plans Guide" },
  { file: "techvision/Product-Docs-Overview.pdf", kbId: DEMO_IDS.tvKbProduct, title: "Product Docs Overview" },
  { file: "techvision/Engineering-Runbook-v2.pdf", kbId: DEMO_IDS.tvKbEng, title: "Engineering Runbook v2" },
];

/**
 * Creates document + ingest_job rows for each sample PDF using the same
 * production functions the upload API uses. Idempotent by (kb_id,
 * original_filename): ready documents are skipped; failed documents are
 * re-queued; missing jobs for pending documents are (re)created.
 *
 * Jobs are NOT processed here — the running server's ingest poller (or
 * GET /api/worker/ingest) drains them through the real
 * parse → chunk → embed → Qdrant pipeline.
 */
async function seedDemoDocuments(logger: Logger) {
  const root = path.resolve(process.cwd(), "public/seed-docs");
  const kbUploader: Record<string, string> = {
    [DEMO_IDS.omenKbHome]: DEMO_IDS.omenAdminUserId,
    [DEMO_IDS.omenKbMotor]: DEMO_IDS.omenAdminUserId,
    [DEMO_IDS.omenKbLife]: DEMO_IDS.omenAdminUserId,
    [DEMO_IDS.tvKbProduct]: DEMO_IDS.tvAdminUserId,
    [DEMO_IDS.tvKbEng]: DEMO_IDS.tvAdminUserId,
  };

  let queued = 0;
  let skipped = 0;
  let requeued = 0;

  for (const doc of SEED_DOCS) {
    const abs = path.join(root, doc.file);
    let buffer: Buffer;
    try {
      buffer = await readFile(abs);
      await stat(abs);
    } catch {
      logger.warn(`[seed:demo] sample document missing: ${doc.file} — run scripts/generate-seed-docs.mjs`);
      continue;
    }

    const filename = path.basename(doc.file);
    const existing = (await listDocuments(doc.kbId)).find((d) => d.originalFilename === filename);

    if (!existing) {
      const created = await createDocument({
        kbId: doc.kbId,
        title: doc.title,
        originalFilename: filename,
        sourceType: "upload",
        mimeType: "application/pdf",
        fileSize: buffer.length,
        uploadedBy: kbUploader[doc.kbId],
      });
      await createIngestJob(created.id, doc.kbId, {
        base64: buffer.toString("base64"),
        mimeType: "application/pdf",
        filename,
      });
      queued++;
      continue;
    }

    if (existing.status === "ready") {
      skipped++;
      continue;
    }

    // failed/pending/processing document — ensure a pending job exists
    const jobs = await pool.query<{ status: string }>(
      `SELECT status FROM ingest_jobs WHERE document_id = $1 ORDER BY created_at DESC`,
      [existing.id],
    );
    const hasPending = jobs.rows.some((j) => j.status === "pending" || j.status === "running");
    if (existing.status === "failed") {
      if (!hasPending) {
        await createIngestJob(existing.id, doc.kbId, {
          base64: buffer.toString("base64"),
          mimeType: "application/pdf",
          filename,
        });
      }
      await pool.query(
        `UPDATE documents SET status = 'pending', error_message = NULL, chunk_count = NULL WHERE id = $1`,
        [existing.id],
      );
      requeued++;
    } else if (!hasPending) {
      await createIngestJob(existing.id, doc.kbId, {
        base64: buffer.toString("base64"),
        mimeType: "application/pdf",
        filename,
      });
      requeued++;
    } else {
      skipped++;
    }
  }

  logger.log(
    `[seed:demo] documents: ${queued} queued, ${requeued} re-queued, ${skipped} already present/ready`,
  );
}

// ── synthetic analytics ──────────────────────────────────────────────────────

/**
 * Regenerates the synthetic query_events for the demo KBs. Deterministic:
 * the demo KBs' analytics dataset is replaced wholesale (the KBs exist only
 * for the demo, so their events are synthetic by definition) — re-running
 * the seed always yields the same counts and distributions.
 */
async function seedDemoQueryEvents(client: PoolClient, logger: Logger) {
  await client.query(`DELETE FROM query_events WHERE kb_id = ANY($1::uuid[])`, [
    [...DEMO_KB_IDS],
  ]);

  const events = generateSyntheticEvents({});
  const rows: unknown[][] = [];
  const tuples: string[] = [];
  let p = 1;
  const BATCH = 40;

  const flush = async () => {
    if (tuples.length === 0) return;
    await client.query(
      `INSERT INTO query_events
         (kb_id, org_id, user_id, query_text, answer_text, surface, status,
          model, provider, latency_ms, source_count, prompt_tokens, completion_tokens,
          cost_usd_micros, cancelled, redactions, created_at)
       VALUES ${tuples.join(",")}`,
      rows.flat(),
    );
    tuples.length = 0;
    rows.length = 0;
    p = 1;
  };

  for (const ev of events) {
    tuples.push(
      `($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},FALSE,'[]'::jsonb,$${p++})`,
    );
    rows.push([
      ev.kbId, ev.orgId, ev.userId, ev.queryText, ev.answerText, ev.surface, ev.status,
      ev.status === "ok" ? DEMO_MODEL : null,
      ev.status === "ok" ? DEMO_PROVIDER : null,
      ev.latencyMs, ev.sourceCount, ev.promptTokens, ev.completionTokens,
      ev.costUsdMicros, ev.createdAt.toISOString(),
    ]);
    if (tuples.length >= BATCH) await flush();
  }
  await flush();

  const byOrg = events.reduce<Record<string, number>>((acc, ev) => {
    acc[ev.orgId] = (acc[ev.orgId] ?? 0) + 1;
    return acc;
  }, {});
  logger.log(
    `[seed:demo] synthetic analytics: ${events.length} query_events over the last 30 days ` +
    `(${byOrg[DEMO_IDS.omenOrgId] ?? 0} Omen, ${byOrg[DEMO_IDS.techvisionOrgId] ?? 0} TechVision)`,
  );
}

// ── reset ────────────────────────────────────────────────────────────────────

async function deleteQdrantCollections(logger: Logger) {
  const url = process.env.QDRANT_URL?.replace(/"/g, "");
  if (!url) return;
  const apiKey = process.env.QDRANT_API_KEY?.replace(/"/g, "") ?? "";
  const headers: Record<string, string> = apiKey ? { "api-key": apiKey } : {};
  for (const name of [
    "demo_omen_home_insurance", "demo_omen_motor_insurance", "demo_omen_life_health",
    "demo_tv_product_docs", "demo_tv_engineering",
  ]) {
    try {
      const res = await fetch(`${url}/collections/${name}`, { method: "DELETE", headers });
      logger.log(`[seed:demo] qdrant ${name} → ${res.ok ? "deleted" : `kept (${res.status})`}`);
    } catch (err) {
      logger.warn(`[seed:demo] qdrant ${name} delete failed: ${(err as Error).message}`);
    }
  }
}

/**
 * Purges ONLY the demo tenants' data (scoped to the fixed demo UUIDs) and
 * re-seeds. Real organisations, users and traffic are untouched.
 */
export async function resetDemoData(options?: { logger?: Logger }) {
  const logger = options?.logger ?? console;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM query_events WHERE kb_id = ANY($1::uuid[]) OR org_id = ANY($2::uuid[])`, [
      [...DEMO_KB_IDS], [...DEMO_ORG_IDS],
    ]);
    await client.query(`DELETE FROM chat_sessions WHERE kb_id = ANY($1::uuid[])`, [[...DEMO_KB_IDS]]);
    await client.query(`DELETE FROM ingest_jobs WHERE kb_id = ANY($1::uuid[])`, [[...DEMO_KB_IDS]]);
    await client.query(`DELETE FROM documents WHERE kb_id = ANY($1::uuid[])`, [[...DEMO_KB_IDS]]);
    await client.query(`DELETE FROM api_keys WHERE kb_id = ANY($1::uuid[])`, [[...DEMO_KB_IDS]]);
    await client.query(`DELETE FROM knowledge_bases WHERE id = ANY($1::uuid[])`, [[...DEMO_KB_IDS]]);
    await client.query(`DELETE FROM assistant_configs WHERE agent_id = ANY($1::uuid[])`, [
      [DEMO_IDS.omenAgentId, DEMO_IDS.tvAgentId],
    ]);
    await client.query(`DELETE FROM agents WHERE id = ANY($1::uuid[])`, [
      [DEMO_IDS.omenAgentId, DEMO_IDS.tvAgentId],
    ]);
    await client.query(`DELETE FROM subscription_audit_log WHERE org_id = ANY($1::uuid[])`, [[...DEMO_ORG_IDS]]);
    await client.query(`DELETE FROM org_subscriptions WHERE org_id = ANY($1::uuid[])`, [[...DEMO_ORG_IDS]]);
    await client.query(`DELETE FROM org_members WHERE org_id = ANY($1::uuid[])`, [[...DEMO_ORG_IDS]]);
    await client.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [
      [DEMO_IDS.omenAdminUserId, DEMO_IDS.tvAdminUserId],
    ]);
    await client.query(`DELETE FROM organisations WHERE id = ANY($1::uuid[])`, [[...DEMO_ORG_IDS]]);
    await client.query("COMMIT");
    logger.log("[seed:demo] demo data purged (demo UUID scope only)");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  await deleteQdrantCollections(logger);
  await seedDemoData({ logger });
}

// ── orchestrator ─────────────────────────────────────────────────────────────

/**
 * Full demo seed: production bootstrap first (admin, settings, landing demo,
 * Clara demo org), then the two demo tenants and their dataset.
 */
export async function seedDemoData(options?: { logger?: Logger }) {
  const logger = options?.logger ?? console;

  // Production bootstrap included — the demo needs the platform admin, the
  // published plan set the tenants subscribe to, and the landing demo.
  await seedProductionData({ logger });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await seedDemoTenants(client, logger);
    await seedDemoAgentsAndKbs(client, logger);
    await seedDemoQueryEvents(client, logger);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  // Documents + ingest jobs use their own connection (production functions);
  // idempotent by (kb_id, original_filename).
  await seedDemoDocuments(logger);

  // Best-effort local processing: on machines with provider access this
  // finishes the whole pipeline in one command. Where the provider is
  // unreachable (e.g. geo-blocked CI), jobs stay queued for the running
  // server's ingest poller or GET /api/worker/ingest — never a seed failure.
  try {
    const { drainQueue } = await import("@/modules/knowledge-bases/worker/ingest-worker");
    const { processed, errors } = await drainQueue(10);
    if (processed > 0) logger.log(`[seed:demo] local ingest drain: ${processed} processed, ${errors} errors`);
    else if (errors === 0) logger.log("[seed:demo] no pending ingest jobs to drain locally");
    else logger.warn(`[seed:demo] local ingest drain: ${errors} job(s) failed — they remain queued for a worker with provider access`);
  } catch (err) {
    logger.warn(`[seed:demo] local ingest drain skipped: ${(err as Error).message}`);
  }
}
