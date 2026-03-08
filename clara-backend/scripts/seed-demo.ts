#!/usr/bin/env tsx
/**
 * scripts/seed-demo.ts
 * Clara AI — Deterministic demo data seed
 * Run:  npx tsx scripts/seed-demo.ts
 * Reset: npx tsx scripts/seed-demo.ts --reset
 */

import { Pool } from "pg";
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LEN  = 64;
const SALT_LEN = 16;

/**
 * MUST match password.ts exactly: scrypt with `<hex-salt>:<hex-hash>` format.
 * The seed cannot import from src/ (Next.js internals), so we duplicate the logic here.
 */
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN).toString("hex");
  const hash = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Fixed UUIDs for reproducibility ──────────────────────────────────────────
const IDS = {
  // Orgs
  omenOrgId:       "10000000-0000-0000-0000-000000000001",
  techvisionOrgId: "10000000-0000-0000-0000-000000000002",
  // Projects
  omenProjectId:       "20000000-0000-0000-0000-000000000001",
  techvisionProjectId: "20000000-0000-0000-0000-000000000002",
  // Knowledge Bases — Omen
  omenKb1: "30000000-0000-0000-0000-000000000001",
  omenKb2: "30000000-0000-0000-0000-000000000002",
  omenKb3: "30000000-0000-0000-0000-000000000003",
  // Knowledge Bases — TechVision
  tvKb1: "30000000-0000-0000-0000-000000000004",
  tvKb2: "30000000-0000-0000-0000-000000000005",
  // Users
  superAdminId:    "40000000-0000-0000-0000-000000000001",
  omenAdminId:     "40000000-0000-0000-0000-000000000002",
  tvAdminId:       "40000000-0000-0000-0000-000000000003",
};

// hashPassword is defined above using scrypt — matches password.ts exactly

async function reset(client: any) {
  console.log("⚠  Resetting demo data…");
  await client.query(`
    DELETE FROM query_events  WHERE kb_id IN ($1,$2,$3,$4,$5)
  `, [IDS.omenKb1, IDS.omenKb2, IDS.omenKb3, IDS.tvKb1, IDS.tvKb2]);
  await client.query(`DELETE FROM documents WHERE kb_id IN ($1,$2,$3,$4,$5)`,
    [IDS.omenKb1, IDS.omenKb2, IDS.omenKb3, IDS.tvKb1, IDS.tvKb2]);
  await client.query(`DELETE FROM assistant_configs WHERE kb_id IN ($1,$2,$3,$4,$5)`,
    [IDS.omenKb1, IDS.omenKb2, IDS.omenKb3, IDS.tvKb1, IDS.tvKb2]);
  await client.query(`DELETE FROM knowledge_bases WHERE id IN ($1,$2,$3,$4,$5)`,
    [IDS.omenKb1, IDS.omenKb2, IDS.omenKb3, IDS.tvKb1, IDS.tvKb2]);
  await client.query(`DELETE FROM projects WHERE id IN ($1,$2)`, [IDS.omenProjectId, IDS.techvisionProjectId]);
  await client.query(`DELETE FROM org_subscriptions WHERE org_id IN ($1,$2)`, [IDS.omenOrgId, IDS.techvisionOrgId]);
  await client.query(`DELETE FROM org_members WHERE org_id IN ($1,$2)`, [IDS.omenOrgId, IDS.techvisionOrgId]);
  await client.query(`DELETE FROM organisations WHERE id IN ($1,$2)`, [IDS.omenOrgId, IDS.techvisionOrgId]);
  await client.query(`DELETE FROM users WHERE id IN ($1,$2,$3)`,
    [IDS.superAdminId, IDS.omenAdminId, IDS.tvAdminId]);
  console.log("✓  Demo data removed");
}

async function seed() {
  const client = await pool.connect();
  try {
    const isReset = process.argv.includes("--reset");

    await client.query("BEGIN");

    if (isReset) {
      await reset(client);
      await client.query("COMMIT");
      return;
    }

    console.log("\n🌱  Seeding Clara AI demo data…\n");

    // ── 1. Super admin user ───────────────────────────────────────────────────
    console.log("  Creating admin users…");
    await client.query(`
      INSERT INTO users (id, email, password_hash, full_name, is_super_admin, email_verified, status)
      VALUES ($1, $2, $3, $4, TRUE, TRUE, 'active')
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email, password_hash = EXCLUDED.password_hash,
        is_super_admin = TRUE
    `, [IDS.superAdminId, "admin@clara.ai", hashPassword("Admin1234!"), "Platform Admin"]);

    // ── 2. Omen Insurance org + user ─────────────────────────────────────────
    console.log("  Creating Omen United Insurance…");
    await client.query(`
      INSERT INTO organisations (id, name, slug, logo_url)
      VALUES ($1, 'Omen United Insurance', 'omen-insurance', NULL)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug
    `, [IDS.omenOrgId]);

    await client.query(`
      INSERT INTO users (id, email, password_hash, full_name, email_verified, status)
      VALUES ($1, $2, $3, $4, TRUE, 'active')
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash
    `, [IDS.omenAdminId, "admin@omeninsurance.com", hashPassword("Omen1234!"), "Omen Portal Admin"]);

    await client.query(`
      INSERT INTO org_members (org_id, user_id, role)
      VALUES ($1, $2, 'org_admin')
      ON CONFLICT (org_id, user_id) DO NOTHING
    `, [IDS.omenOrgId, IDS.omenAdminId]);

    // Omen subscription → Pro plan
    await client.query(`
      INSERT INTO org_subscriptions (org_id, plan_id, status)
      VALUES ($1, 'pro', 'active')
      ON CONFLICT (org_id) DO UPDATE SET plan_id = 'pro', status = 'active'
    `, [IDS.omenOrgId]);

    // ── 3. TechVision org + user ──────────────────────────────────────────────
    console.log("  Creating TechVision Solutions…");
    await client.query(`
      INSERT INTO organisations (id, name, slug)
      VALUES ($1, 'TechVision Solutions', 'techvision')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug
    `, [IDS.techvisionOrgId]);

    await client.query(`
      INSERT INTO users (id, email, password_hash, full_name, email_verified, status)
      VALUES ($1, $2, $3, $4, TRUE, 'active')
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash
    `, [IDS.tvAdminId, "admin@techvision.io", hashPassword("Tech1234!"), "TechVision Admin"]);

    await client.query(`
      INSERT INTO org_members (org_id, user_id, role)
      VALUES ($1, $2, 'org_admin')
      ON CONFLICT (org_id, user_id) DO NOTHING
    `, [IDS.techvisionOrgId, IDS.tvAdminId]);

    // TechVision subscription → Starter plan
    await client.query(`
      INSERT INTO org_subscriptions (org_id, plan_id, status)
      VALUES ($1, 'starter', 'active')
      ON CONFLICT (org_id) DO UPDATE SET plan_id = 'starter', status = 'active'
    `, [IDS.techvisionOrgId]);

    // ── 4. Projects ───────────────────────────────────────────────────────────
    console.log("  Creating projects…");
    await client.query(`
      INSERT INTO projects (id, org_id, name, description)
      VALUES ($1, $2, 'Omen Insurance Operations', 'Internal AI knowledge portal')
      ON CONFLICT (id) DO NOTHING
    `, [IDS.omenProjectId, IDS.omenOrgId]);

    await client.query(`
      INSERT INTO projects (id, org_id, name, description)
      VALUES ($1, $2, 'TechVision Product Team', 'Product and engineering knowledge base')
      ON CONFLICT (id) DO NOTHING
    `, [IDS.techvisionProjectId, IDS.techvisionOrgId]);

    // ── 5. Knowledge Bases ────────────────────────────────────────────────────
    console.log("  Creating knowledge bases…");
    const omenKbs = [
      { id: IDS.omenKb1, name: "Home Insurance Policies",   coll: "omen_home_insurance" },
      { id: IDS.omenKb2, name: "Motor Insurance 2024",      coll: "omen_motor_insurance" },
      { id: IDS.omenKb3, name: "Life & Health Plans",       coll: "omen_life_health" },
    ];
    for (const kb of omenKbs) {
      await client.query(`
        INSERT INTO knowledge_bases (id, project_id, name, qdrant_collection, status)
        VALUES ($1, $2, $3, $4, 'active')
        ON CONFLICT (id) DO NOTHING
      `, [kb.id, IDS.omenProjectId, kb.name, kb.coll]);
    }

    const tvKbs = [
      { id: IDS.tvKb1, name: "Product Documentation", coll: "tv_product_docs" },
      { id: IDS.tvKb2, name: "Engineering Runbooks",  coll: "tv_engineering" },
    ];
    for (const kb of tvKbs) {
      await client.query(`
        INSERT INTO knowledge_bases (id, project_id, name, qdrant_collection, status)
        VALUES ($1, $2, $3, $4, 'active')
        ON CONFLICT (id) DO NOTHING
      `, [kb.id, IDS.techvisionProjectId, kb.name, kb.coll]);
    }

    // ── 6. Assistant Configs ──────────────────────────────────────────────────
    console.log("  Creating assistant configs…");
    for (const kb of omenKbs) {
      await client.query(`
        INSERT INTO assistant_configs (kb_id, assistant_name, system_prompt, tone, primary_colour, accent_colour, voice_enabled, voice_provider)
        VALUES ($1, 'Aria', $2, 'professional', '#0a1628', '#c8821a', TRUE, 'openai')
        ON CONFLICT (kb_id) DO NOTHING
      `, [kb.id,
        `You are Aria, an AI assistant for Omen United Insurance. Answer questions about insurance policies using only information from the knowledge base. Always cite your sources with [S1], [S2] notation. Be accurate, professional, and helpful. If you cannot find an answer in the knowledge base, say so clearly.`
      ]);
    }

    for (const kb of tvKbs) {
      await client.query(`
        INSERT INTO assistant_configs (kb_id, assistant_name, system_prompt, tone, primary_colour, accent_colour, voice_enabled, voice_provider)
        VALUES ($1, 'Sage', $2, 'concise', '#0f172a', '#0ea5e9', TRUE, 'openai')
        ON CONFLICT (kb_id) DO NOTHING
      `, [kb.id,
        `You are Sage, a technical AI assistant for TechVision Solutions. Help engineers and product managers find information in our documentation. Use code examples where helpful. Be concise and technically precise.`
      ]);
    }

    // ── 7. Synthetic query events (analytics data) ────────────────────────────
    console.log("  Seeding synthetic analytics (700 query events)…");

    const omenQueries = [
      "Does my home insurance cover flood damage?",
      "What is the excess for motor theft claims?",
      "How do I make a claim for accidental damage?",
      "Is my bicycle covered under home contents insurance?",
      "What documents do I need for a life insurance claim?",
      "Can I add a named driver to my motor policy?",
      "What is not covered by standard home insurance?",
      "How long does a motor insurance claim take?",
      "Does home insurance cover garden equipment?",
      "What is the cooling-off period for my policy?",
    ];

    const tvQueries = [
      "How do I set up a new development environment?",
      "What is our API rate limiting strategy?",
      "How do I deploy to production?",
      "What are the database backup procedures?",
      "How do I configure environment variables?",
      "What monitoring tools do we use?",
      "How to roll back a failed deployment?",
      "What is the on-call escalation process?",
    ];

    // 500 events for Omen over 30 days
    const allKbs = [
      ...omenKbs.map(k => ({ ...k, queries: omenQueries, orgId: IDS.omenOrgId })),
      ...tvKbs.map(k => ({ ...k, queries: tvQueries, orgId: IDS.techvisionOrgId })),
    ];

    const eventCounts = [500, 500, 500, 300, 200, 200, 200];

    for (let kbIdx = 0; kbIdx < allKbs.length; kbIdx++) {
      const kb = allKbs[kbIdx];
      const count = eventCounts[kbIdx] ?? 100;
      for (let i = 0; i < count; i++) {
        const daysAgo = Math.floor(Math.random() * 30);
        const hoursAgo = Math.floor(Math.random() * 24);
        const ts = new Date(Date.now() - daysAgo * 86400000 - hoursAgo * 3600000);
        const query = kb.queries[Math.floor(Math.random() * kb.queries.length)];
        const latency = Math.floor(200 + Math.random() * 800);

        await client.query(`
          INSERT INTO query_events (kb_id, query_text, latency_ms, source_count, created_at)
          VALUES ($1, $2, $3, $4, $5)
        `, [kb.id, query, latency, Math.floor(1 + Math.random() * 4), ts]);
      }
    }

    await client.query("COMMIT");

    console.log("\n✅  Demo seed complete!\n");
    console.log("  Org IDs (update .env.local):");
    console.log(`    Omen Insurance:    CLARA_ORG_ID=${IDS.omenOrgId}`);
    console.log(`    TechVision:        CLARA_ORG_ID=${IDS.techvisionOrgId}`);
    console.log("\n  Login credentials:");
    console.log("    Platform admin:  admin@clara.ai        / Admin1234!");
    console.log("    Omen admin:      admin@omeninsurance.com / Omen1234!");
    console.log("    TechVision admin: admin@techvision.io  / Tech1234!\n");

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌  Seed failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
