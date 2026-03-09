#!/usr/bin/env tsx
/**
 * scripts/seed-demo.ts
 * Clara AI — Deterministic demo data seed
 * Run:   npm run seed
 * Reset: npm run seed:reset
 *
 * Schema contract (matches actual DB migrations):
 *   org_members     → role_id UUID FK (no "role" text column)
 *   assistant_configs → assistant_name, system_prompt, primary_colour,
 *                        accent_colour, voice_id, temperature, max_tokens,
 *                        cite_sources, strict_mode, welcome_message,
 *                        out_of_scope_reply (NO tone/voice_enabled/voice_provider)
 *   query_events    → kb_id, query_text, source_count, latency_ms, created_at
 */

import { Pool, PoolClient } from "pg";
import { scrypt, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LEN  = 64;
const SALT_LEN = 16;

/**
 * Matches password.ts exactly: scrypt → "<hex-salt>:<hex-hash>"
 * Duplicated here because the seed cannot import from Next.js src/.
 */
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN).toString("hex");
  const hash = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

// ── DB — mirrors src/lib/db.ts defaults exactly ────────────────────────────
const pool = new Pool({
  host:     process.env.POSTGRES_HOST     ?? "180.188.231.138",
  port:     Number(process.env.POSTGRES_PORT ?? "5434"),
  user:     process.env.POSTGRES_USER     ?? "atc",
  password: process.env.POSTGRES_PASSWORD ?? "Postgres@ATC",
  database: process.env.POSTGRES_DB       ?? "postgres",
  ssl: process.env.POSTGRES_SSL === "true" ? { rejectUnauthorized: false } : false,
});

// ── Fixed UUIDs for reproducibility ────────────────────────────────────────
const IDS = {
  omenOrgId:           "10000000-0000-0000-0000-000000000001",
  techvisionOrgId:     "10000000-0000-0000-0000-000000000002",
  omenProjectId:       "20000000-0000-0000-0000-000000000001",
  techvisionProjectId: "20000000-0000-0000-0000-000000000002",
  omenKb1:  "30000000-0000-0000-0000-000000000001",
  omenKb2:  "30000000-0000-0000-0000-000000000002",
  omenKb3:  "30000000-0000-0000-0000-000000000003",
  tvKb1:    "30000000-0000-0000-0000-000000000004",
  tvKb2:    "30000000-0000-0000-0000-000000000005",
  superAdminId: "40000000-0000-0000-0000-000000000001",
  omenAdminId:  "40000000-0000-0000-0000-000000000002",
  tvAdminId:    "40000000-0000-0000-0000-000000000003",
};

// ── Reset ───────────────────────────────────────────────────────────────────
async function reset(client: PoolClient) {
  console.log("⚠   Resetting demo data…");
  const kbIds = [IDS.omenKb1, IDS.omenKb2, IDS.omenKb3, IDS.tvKb1, IDS.tvKb2];
  await client.query(`DELETE FROM query_events       WHERE kb_id = ANY($1::uuid[])`, [kbIds]);
  await client.query(`DELETE FROM config_snapshots   WHERE kb_id = ANY($1::uuid[])`, [kbIds]);
  await client.query(`DELETE FROM ingest_jobs        WHERE kb_id = ANY($1::uuid[])`, [kbIds]);
  await client.query(`DELETE FROM documents          WHERE kb_id = ANY($1::uuid[])`, [kbIds]);
  await client.query(`DELETE FROM assistant_configs  WHERE kb_id = ANY($1::uuid[])`, [kbIds]);
  await client.query(`DELETE FROM knowledge_bases    WHERE id    = ANY($1::uuid[])`, [kbIds]);
  await client.query(`DELETE FROM projects           WHERE id    = ANY($1::uuid[])`,
    [[IDS.omenProjectId, IDS.techvisionProjectId]]);
  await client.query(`DELETE FROM org_subscriptions  WHERE org_id = ANY($1::uuid[])`,
    [[IDS.omenOrgId, IDS.techvisionOrgId]]);
  await client.query(`DELETE FROM org_members        WHERE org_id = ANY($1::uuid[])`,
    [[IDS.omenOrgId, IDS.techvisionOrgId]]);
  await client.query(`DELETE FROM organisations      WHERE id    = ANY($1::uuid[])`,
    [[IDS.omenOrgId, IDS.techvisionOrgId]]);
  await client.query(`DELETE FROM users              WHERE id    = ANY($1::uuid[])`,
    [[IDS.superAdminId, IDS.omenAdminId, IDS.tvAdminId]]);
  console.log("✓   Demo data removed");
}

// ── Seed ────────────────────────────────────────────────────────────────────
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

    // ── Resolve role_id for org_admin (required by org_members FK) ──────────
    const roleRow = await client.query<{ id: string }>(
      `SELECT id FROM roles WHERE name = 'org_admin' LIMIT 1`
    );
    if (!roleRow.rows[0]) throw new Error("Role 'org_admin' not found — run migrations first");
    const orgAdminRoleId = roleRow.rows[0].id;

    // ── 1. Users ─────────────────────────────────────────────────────────────
    console.log("  Creating users…");

    const superHash = await hashPassword("Admin1234!");
    await client.query(`
      INSERT INTO users (id, email, password_hash, full_name, is_super_admin, email_verified, status)
      VALUES ($1, $2, $3, 'Platform Admin', TRUE, TRUE, 'active')
      ON CONFLICT (id) DO UPDATE SET
        email         = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash,
        is_super_admin = TRUE
    `, [IDS.superAdminId, "admin@clara.ai", superHash]);

    const omenHash = await hashPassword("Omen1234!");
    await client.query(`
      INSERT INTO users (id, email, password_hash, full_name, email_verified, status)
      VALUES ($1, $2, $3, 'Omen Portal Admin', TRUE, 'active')
      ON CONFLICT (id) DO UPDATE SET
        email         = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash
    `, [IDS.omenAdminId, "admin@omeninsurance.com", omenHash]);

    const tvHash = await hashPassword("Tech1234!");
    await client.query(`
      INSERT INTO users (id, email, password_hash, full_name, email_verified, status)
      VALUES ($1, $2, $3, 'TechVision Admin', TRUE, 'active')
      ON CONFLICT (id) DO UPDATE SET
        email         = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash
    `, [IDS.tvAdminId, "admin@techvision.io", tvHash]);

    // ── 2. Organisations ─────────────────────────────────────────────────────
    console.log("  Creating organisations…");

    await client.query(`
      INSERT INTO organisations (id, name, slug)
      VALUES ($1, 'Omen United Insurance', 'omen-insurance')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug
    `, [IDS.omenOrgId]);

    await client.query(`
      INSERT INTO organisations (id, name, slug)
      VALUES ($1, 'TechVision Solutions', 'techvision')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug
    `, [IDS.techvisionOrgId]);

    // ── 3. Org members (role_id FK — must use UUID from roles table) ─────────
    console.log("  Assigning org members…");

    await client.query(`
      INSERT INTO org_members (org_id, user_id, role_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (org_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id
    `, [IDS.omenOrgId, IDS.omenAdminId, orgAdminRoleId]);

    await client.query(`
      INSERT INTO org_members (org_id, user_id, role_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (org_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id
    `, [IDS.techvisionOrgId, IDS.tvAdminId, orgAdminRoleId]);

    // ── 4. Subscriptions ─────────────────────────────────────────────────────
    console.log("  Assigning subscriptions…");

    await client.query(`
      INSERT INTO org_subscriptions (org_id, plan_id, status)
      VALUES ($1, 'pro', 'active')
      ON CONFLICT (org_id) DO UPDATE SET plan_id = 'pro', status = 'active'
    `, [IDS.omenOrgId]);

    await client.query(`
      INSERT INTO org_subscriptions (org_id, plan_id, status)
      VALUES ($1, 'starter', 'active')
      ON CONFLICT (org_id) DO UPDATE SET plan_id = 'starter', status = 'active'
    `, [IDS.techvisionOrgId]);

    // ── 5. Projects ──────────────────────────────────────────────────────────
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

    // ── 6. Knowledge Bases ────────────────────────────────────────────────────
    console.log("  Creating knowledge bases…");

    const omenKbs = [
      { id: IDS.omenKb1, name: "Home Insurance Policies", coll: "omen_home_insurance" },
      { id: IDS.omenKb2, name: "Motor Insurance 2024",    coll: "omen_motor_insurance" },
      { id: IDS.omenKb3, name: "Life & Health Plans",     coll: "omen_life_health" },
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

    // ── 7. Assistant Configs (only real schema columns) ───────────────────────
    // Real columns from 001_foundation.sql:
    //   assistant_name, system_prompt, welcome_message, out_of_scope_reply,
    //   voice_id, primary_colour, accent_colour, temperature, max_tokens,
    //   cite_sources, strict_mode, default_language
    console.log("  Creating assistant configs…");

    const omenPrompt = `You are Aria, an AI assistant for Omen United Insurance. ` +
      `Answer questions about insurance policies using only information from the knowledge base. ` +
      `Always cite your sources with [S1], [S2] notation. ` +
      `Be accurate, professional, and helpful. ` +
      `If you cannot find an answer in the knowledge base, say so clearly.`;

    for (const kb of omenKbs) {
      await client.query(`
        INSERT INTO assistant_configs
          (kb_id, assistant_name, system_prompt, welcome_message, out_of_scope_reply,
           voice_id, primary_colour, accent_colour, temperature, max_tokens, cite_sources, strict_mode)
        VALUES
          ($1, 'Aria', $2,
           'Hello! I''m Aria, your Omen Insurance assistant. How can I help you today?',
           'I can only answer questions about Omen United Insurance policies and products.',
           'alloy', '#0a1628', '#c8821a', 0.7, 500, TRUE, TRUE)
        ON CONFLICT (kb_id) DO UPDATE SET
          assistant_name  = EXCLUDED.assistant_name,
          system_prompt   = EXCLUDED.system_prompt,
          primary_colour  = EXCLUDED.primary_colour,
          accent_colour   = EXCLUDED.accent_colour
      `, [kb.id, omenPrompt]);
    }

    const tvPrompt = `You are Sage, a technical AI assistant for TechVision Solutions. ` +
      `Help engineers and product managers find information in our documentation. ` +
      `Use code examples where helpful. Be concise and technically precise.`;

    for (const kb of tvKbs) {
      await client.query(`
        INSERT INTO assistant_configs
          (kb_id, assistant_name, system_prompt, welcome_message, out_of_scope_reply,
           voice_id, primary_colour, accent_colour, temperature, max_tokens, cite_sources, strict_mode)
        VALUES
          ($1, 'Sage', $2,
           'Hi! I''m Sage, your TechVision AI assistant. What can I help you find?',
           'I can only answer questions about TechVision product and engineering documentation.',
           'echo', '#0f172a', '#0ea5e9', 0.5, 600, TRUE, TRUE)
        ON CONFLICT (kb_id) DO UPDATE SET
          assistant_name  = EXCLUDED.assistant_name,
          system_prompt   = EXCLUDED.system_prompt,
          primary_colour  = EXCLUDED.primary_colour,
          accent_colour   = EXCLUDED.accent_colour
      `, [kb.id, tvPrompt]);
    }

    // ── 8. Synthetic query events (analytics) ─────────────────────────────────
    console.log("  Seeding synthetic analytics (1500 query events)…");

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

    const allKbs = [
      ...omenKbs.map(k => ({ ...k, queries: omenQueries })),
      ...tvKbs.map(k => ({ ...k, queries: tvQueries })),
    ];
    const eventCounts = [400, 300, 300, 300, 200];

    for (let kbIdx = 0; kbIdx < allKbs.length; kbIdx++) {
      const kb      = allKbs[kbIdx];
      const count   = eventCounts[kbIdx] ?? 100;
      const values: (string | number | undefined)[] = [];
      const placeholders: string[] = [];
      let p = 1;

      for (let i = 0; i < count; i++) {
        const daysAgo  = Math.floor(Math.random() * 30);
        const hoursAgo = Math.floor(Math.random() * 24);
        const ts       = new Date(Date.now() - daysAgo * 86400000 - hoursAgo * 3600000);
        const qtext    = kb.queries[Math.floor(Math.random() * kb.queries.length)];
        const latency  = Math.floor(200 + Math.random() * 800);
        const sources  = Math.floor(1 + Math.random() * 4);

        placeholders.push(`($${p++},$${p++},$${p++},$${p++},$${p++})`);
        values.push(kb.id, qtext, latency, sources, ts.toISOString());
      }

      await client.query(
        `INSERT INTO query_events (kb_id, query_text, latency_ms, source_count, created_at)
         VALUES ${placeholders.join(",")}`,
        values
      );
    }

    await client.query("COMMIT");

    console.log("\n✅  Demo seed complete!\n");
    console.log("  Login credentials:");
    console.log("    Platform admin:   admin@clara.ai             / Admin1234!");
    console.log("    Omen admin:       admin@omeninsurance.com    / Omen1234!");
    console.log("    TechVision admin: admin@techvision.io        / Tech1234!\n");
    console.log("  URLs:");
    console.log("    Backend admin:  http://localhost:3000/admin/login");
    console.log("    Omen portal:    http://localhost:3001/login");
    console.log("    TechVision:     http://localhost:3002/login\n");

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
