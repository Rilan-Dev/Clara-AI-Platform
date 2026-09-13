import type { PoolClient } from "pg";

import { pool } from "@/lib/db";
import { hashPassword } from "@/modules/auth/core/password";

type Logger = Pick<typeof console, "log" | "warn" | "error">;

const IDS = {
  omenOrgId: "10000000-0000-0000-0000-000000000001",
  techvisionOrgId: "10000000-0000-0000-0000-000000000002",
  omenProjectId: "20000000-0000-0000-0000-000000000001",
  techvisionProjectId: "20000000-0000-0000-0000-000000000002",
  omenKb1: "30000000-0000-0000-0000-000000000001",
  omenKb2: "30000000-0000-0000-0000-000000000002",
  omenKb3: "30000000-0000-0000-0000-000000000003",
  tvKb1: "30000000-0000-0000-0000-000000000004",
  tvKb2: "30000000-0000-0000-0000-000000000005",
  superAdminId: "40000000-0000-0000-0000-000000000001",
  omenAdminId: "40000000-0000-0000-0000-000000000002",
  tvAdminId: "40000000-0000-0000-0000-000000000003",
} as const;

async function resetDemoData(client: PoolClient, logger: Logger) {
  logger.log("[seed] Resetting demo data...");

  const kbIds = [IDS.omenKb1, IDS.omenKb2, IDS.omenKb3, IDS.tvKb1, IDS.tvKb2];

  await client.query(`DELETE FROM query_events WHERE kb_id = ANY($1::uuid[])`, [kbIds]);
  await client.query(`DELETE FROM config_snapshots WHERE kb_id = ANY($1::uuid[])`, [kbIds]);
  await client.query(`DELETE FROM ingest_jobs WHERE kb_id = ANY($1::uuid[])`, [kbIds]);
  await client.query(`DELETE FROM documents WHERE kb_id = ANY($1::uuid[])`, [kbIds]);
  await client.query(`DELETE FROM assistant_configs WHERE kb_id = ANY($1::uuid[])`, [kbIds]);
  await client.query(`DELETE FROM knowledge_bases WHERE id = ANY($1::uuid[])`, [kbIds]);
  await client.query(`DELETE FROM agents WHERE id = ANY($1::uuid[])`, [[IDS.omenProjectId, IDS.techvisionProjectId]]);
  await client.query(`DELETE FROM org_subscriptions WHERE org_id = ANY($1::uuid[])`, [[IDS.omenOrgId, IDS.techvisionOrgId]]);
  await client.query(`DELETE FROM org_members WHERE org_id = ANY($1::uuid[])`, [[IDS.omenOrgId, IDS.techvisionOrgId]]);
  await client.query(`DELETE FROM organisations WHERE id = ANY($1::uuid[])`, [[IDS.omenOrgId, IDS.techvisionOrgId]]);
  await client.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[IDS.superAdminId, IDS.omenAdminId, IDS.tvAdminId]]);

  logger.log("[seed] Demo data removed.");
}

export async function seedDemoData(options?: { reset?: boolean; logger?: Logger }) {
  const logger = options?.logger ?? console;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (options?.reset) {
      await resetDemoData(client, logger);
      await client.query("COMMIT");
      return;
    }

    logger.log("[seed] Seeding Clara demo data...");

    const roleRow = await client.query<{ id: string }>(`SELECT id FROM roles WHERE name = 'org_admin' LIMIT 1`);
    if (!roleRow.rows[0]) {
      throw new Error("Role 'org_admin' not found - run migrations first");
    }
    const orgAdminRoleId = roleRow.rows[0].id;

    const superHash = await hashPassword("Admin1234!");
    await client.query(
      `
        INSERT INTO users (id, email, password_hash, full_name, is_super_admin, email_verified, status)
        VALUES ($1, $2, $3, 'Platform Admin', TRUE, TRUE, 'active')
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          password_hash = EXCLUDED.password_hash,
          is_super_admin = TRUE
      `,
      [IDS.superAdminId, "admin@clara.ai", superHash],
    );

    const omenHash = await hashPassword("Omen1234!");
    await client.query(
      `
        INSERT INTO users (id, email, password_hash, full_name, email_verified, status)
        VALUES ($1, $2, $3, 'Omen Portal Admin', TRUE, 'active')
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          password_hash = EXCLUDED.password_hash
      `,
      [IDS.omenAdminId, "admin@omeninsurance.com", omenHash],
    );

    const tvHash = await hashPassword("Tech1234!");
    await client.query(
      `
        INSERT INTO users (id, email, password_hash, full_name, email_verified, status)
        VALUES ($1, $2, $3, 'TechVision Admin', TRUE, 'active')
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          password_hash = EXCLUDED.password_hash
      `,
      [IDS.tvAdminId, "admin@techvision.io", tvHash],
    );

    await client.query(
      `
        INSERT INTO organisations (id, name, slug)
        VALUES ($1, 'Omen United Insurance', 'omen-insurance')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug
      `,
      [IDS.omenOrgId],
    );

    await client.query(
      `
        INSERT INTO organisations (id, name, slug)
        VALUES ($1, 'TechVision Solutions', 'techvision')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug
      `,
      [IDS.techvisionOrgId],
    );

    await client.query(
      `
        INSERT INTO org_members (org_id, user_id, role_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (org_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id
      `,
      [IDS.omenOrgId, IDS.omenAdminId, orgAdminRoleId],
    );

    await client.query(
      `
        INSERT INTO org_members (org_id, user_id, role_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (org_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id
      `,
      [IDS.techvisionOrgId, IDS.tvAdminId, orgAdminRoleId],
    );

    await client.query(
      `
        INSERT INTO org_subscriptions (org_id, plan_id, status)
        VALUES ($1, 'pro', 'active')
        ON CONFLICT (org_id) DO UPDATE SET plan_id = 'pro', status = 'active'
      `,
      [IDS.omenOrgId],
    );

    await client.query(
      `
        INSERT INTO org_subscriptions (org_id, plan_id, status)
        VALUES ($1, 'starter', 'active')
        ON CONFLICT (org_id) DO UPDATE SET plan_id = 'starter', status = 'active'
      `,
      [IDS.techvisionOrgId],
    );

    await client.query(
      `
        INSERT INTO agents (id, org_id, name, description)
        VALUES ($1, $2, 'Omen Insurance Operations', 'Internal AI knowledge portal')
        ON CONFLICT (id) DO NOTHING
      `,
      [IDS.omenProjectId, IDS.omenOrgId],
    );

    await client.query(
      `
        INSERT INTO agents (id, org_id, name, description)
        VALUES ($1, $2, 'TechVision Product Team', 'Product and engineering knowledge base')
        ON CONFLICT (id) DO NOTHING
      `,
      [IDS.techvisionProjectId, IDS.techvisionOrgId],
    );

    const omenKbs = [
      { id: IDS.omenKb1, name: "Home Insurance Policies", collection: "omen_home_insurance" },
      { id: IDS.omenKb2, name: "Motor Insurance 2024", collection: "omen_motor_insurance" },
      { id: IDS.omenKb3, name: "Life & Health Plans", collection: "omen_life_health" },
    ];
    for (const kb of omenKbs) {
      await client.query(
        `
          INSERT INTO knowledge_bases (id, agent_id, name, qdrant_collection, status)
          VALUES ($1, $2, $3, $4, 'active')
          ON CONFLICT (id) DO NOTHING
        `,
        [kb.id, IDS.omenProjectId, kb.name, kb.collection],
      );
    }

    const tvKbs = [
      { id: IDS.tvKb1, name: "Product Documentation", collection: "tv_product_docs" },
      { id: IDS.tvKb2, name: "Engineering Runbooks", collection: "tv_engineering" },
    ];
    for (const kb of tvKbs) {
      await client.query(
        `
          INSERT INTO knowledge_bases (id, agent_id, name, qdrant_collection, status)
          VALUES ($1, $2, $3, $4, 'active')
          ON CONFLICT (id) DO NOTHING
        `,
        [kb.id, IDS.techvisionProjectId, kb.name, kb.collection],
      );
    }

    const omenPrompt =
      "You are Aria, an AI assistant for Omen United Insurance. " +
      "Answer questions about insurance policies using only information from the knowledge base. " +
      "Always cite your sources with [S1], [S2] notation. " +
      "Be accurate, professional, and helpful. " +
      "If you cannot find an answer in the knowledge base, say so clearly.";

    for (const kb of omenKbs) {
      await client.query(
        `
          INSERT INTO assistant_configs
            (kb_id, assistant_name, system_prompt, welcome_message, out_of_scope_reply,
             voice_id, primary_colour, accent_colour, temperature, max_tokens, cite_sources, strict_mode)
          VALUES
            ($1, 'Aria', $2,
             'Hello! I''m Aria, your Omen Insurance assistant. How can I help you today?',
             'I can only answer questions about Omen United Insurance policies and products.',
             'alloy', '#0a1628', '#c8821a', 0.7, 500, TRUE, TRUE)
          ON CONFLICT (kb_id) DO UPDATE SET
            assistant_name = EXCLUDED.assistant_name,
            system_prompt = EXCLUDED.system_prompt,
            primary_colour = EXCLUDED.primary_colour,
            accent_colour = EXCLUDED.accent_colour
        `,
        [kb.id, omenPrompt],
      );
    }

    const tvPrompt =
      "You are Sage, a technical AI assistant for TechVision Solutions. " +
      "Help engineers and product managers find information in our documentation. " +
      "Use code examples where helpful. Be concise and technically precise.";

    for (const kb of tvKbs) {
      await client.query(
        `
          INSERT INTO assistant_configs
            (kb_id, assistant_name, system_prompt, welcome_message, out_of_scope_reply,
             voice_id, primary_colour, accent_colour, temperature, max_tokens, cite_sources, strict_mode)
          VALUES
            ($1, 'Sage', $2,
             'Hi! I''m Sage, your TechVision AI assistant. What can I help you find?',
             'I can only answer questions about TechVision product and engineering documentation.',
             'echo', '#0f172a', '#0ea5e9', 0.5, 600, TRUE, TRUE)
          ON CONFLICT (kb_id) DO UPDATE SET
            assistant_name = EXCLUDED.assistant_name,
            system_prompt = EXCLUDED.system_prompt,
            primary_colour = EXCLUDED.primary_colour,
            accent_colour = EXCLUDED.accent_colour
        `,
        [kb.id, tvPrompt],
      );
    }

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
      ...omenKbs.map((kb) => ({ ...kb, queries: omenQueries })),
      ...tvKbs.map((kb) => ({ ...kb, queries: tvQueries })),
    ];
    const eventCounts = [400, 300, 300, 300, 200];

    for (let kbIndex = 0; kbIndex < allKbs.length; kbIndex++) {
      const kb = allKbs[kbIndex];
      const count = eventCounts[kbIndex] ?? 100;
      const values: (string | number)[] = [];
      const placeholders: string[] = [];
      let parameter = 1;

      for (let i = 0; i < count; i++) {
        const daysAgo = Math.floor(Math.random() * 30);
        const hoursAgo = Math.floor(Math.random() * 24);
        const timestamp = new Date(Date.now() - daysAgo * 86_400_000 - hoursAgo * 3_600_000);
        const queryText = kb.queries[Math.floor(Math.random() * kb.queries.length)];
        const latency = Math.floor(200 + Math.random() * 800);
        const sourceCount = Math.floor(1 + Math.random() * 4);

        placeholders.push(`($${parameter++},$${parameter++},$${parameter++},$${parameter++},$${parameter++})`);
        values.push(kb.id, queryText, latency, sourceCount, timestamp.toISOString());
      }

      await client.query(
        `
          INSERT INTO query_events (kb_id, query_text, latency_ms, source_count, created_at)
          VALUES ${placeholders.join(",")}
        `,
        values,
      );
    }

    await client.query("COMMIT");
    logger.log("[seed] Demo seed complete.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureDemoDataSeededOnStartup(options?: { logger?: Logger }) {
  const logger = options?.logger ?? console;

  if (process.env.AUTO_SEED_DEMO !== "true") {
    return;
  }

  const result = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM users");
  const userCount = Number(result.rows[0]?.count ?? "0");

  if (userCount > 0) {
    logger.log(`[startup] Demo seed skipped; found ${userCount} existing user(s).`);
    return;
  }

  logger.log("[startup] Fresh database detected; seeding demo data...");
  await seedDemoData({ logger });
  logger.log("[startup] Demo data ready.");
}
