import type { PoolClient } from "pg";

import { pool } from "@/lib/db";
import { hashPassword } from "@/modules/auth/core/password";
import { seedProductionData } from "./production";

/**
 * Development seed — realistic demo data for LOCAL development only.
 *
 * Runs the production seed first (admin user, platform settings, landing demo),
 * then adds two demo organisations with agents, KBs, assistant personas,
 * subscriptions and a realistic spread of query events so the analytics
 * dashboards have something to render against while developing.
 *
 *   • Omen United Insurance   (org admin: admin@omeninsurance.com / Omen1234!)
 *   • TechVision Solutions    (org admin: admin@techvision.io      / Tech1234!)
 *
 * NEVER run this against a production database.
 */

type Logger = Pick<typeof console, "log" | "warn" | "error">;

const IDS = {
  omenOrgId:   "10000000-0000-0000-0000-000000000002",
  techvisionOrgId: "10000000-0000-0000-0000-000000000003",
  omenAgentId: "20000000-0000-0000-0000-000000000002",
  techvisionAgentId: "20000000-0000-0000-0000-000000000003",
  omenKb1: "30000000-0000-0000-0000-000000000002",
  omenKb2: "30000000-0000-0000-0000-000000000003",
  omenKb3: "30000000-0000-0000-0000-000000000004",
  tvKb1:   "30000000-0000-0000-0000-000000000005",
  tvKb2:   "30000000-0000-0000-0000-000000000006",
  omenAdminId:  "40000000-0000-0000-0000-000000000002",
  tvAdminId:    "40000000-0000-0000-0000-000000000003",
} as const;

async function seedDemoOrgs(client: PoolClient, logger: Logger) {
  const roleRow = await client.query<{ id: string }>(
    `SELECT id FROM roles WHERE name = 'org_admin' LIMIT 1`,
  );
  const orgAdminRoleId = roleRow.rows[0]!.id;

  const omenHash = await hashPassword("Omen1234!");
  await client.query(
    `INSERT INTO users (id, email, password_hash, full_name, email_verified, status)
     VALUES ($1, 'admin@omeninsurance.com', $2, 'Omen Portal Admin', TRUE, 'active')
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email, password_hash = EXCLUDED.password_hash`,
    [IDS.omenAdminId, omenHash],
  );

  const tvHash = await hashPassword("Tech1234!");
  await client.query(
    `INSERT INTO users (id, email, password_hash, full_name, email_verified, status)
     VALUES ($1, 'admin@techvision.io', $2, 'TechVision Admin', TRUE, 'active')
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email, password_hash = EXCLUDED.password_hash`,
    [IDS.tvAdminId, tvHash],
  );

  await client.query(
    `INSERT INTO organisations (id, name, slug)
     VALUES ($1, 'Omen United Insurance', 'omen-insurance')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug`,
    [IDS.omenOrgId],
  );
  await client.query(
    `INSERT INTO organisations (id, name, slug)
     VALUES ($1, 'TechVision Solutions', 'techvision')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug`,
    [IDS.techvisionOrgId],
  );

  for (const [orgId, userId] of [
    [IDS.omenOrgId, IDS.omenAdminId],
    [IDS.techvisionOrgId, IDS.tvAdminId],
  ] as const) {
    await client.query(
      `INSERT INTO org_members (org_id, user_id, role_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (org_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id`,
      [orgId, userId, orgAdminRoleId],
    );
  }

  for (const [orgId, plan] of [
    [IDS.omenOrgId, "pro"],
    [IDS.techvisionOrgId, "starter"],
  ] as const) {
    await client.query(
      `INSERT INTO org_subscriptions (org_id, plan_id, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (org_id) DO UPDATE SET plan_id = EXCLUDED.plan_id, status = 'active'`,
      [orgId, plan],
    );
  }

  logger.log("[seed:dev] demo orgs + users + subscriptions ready");
}

async function seedDemoAgentsAndKbs(client: PoolClient, logger: Logger) {
  await client.query(
    `INSERT INTO agents (id, org_id, name, description, status)
     VALUES ($1, $2, 'Omen Insurance Operations', 'Internal AI knowledge portal', 'published')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description`,
    [IDS.omenAgentId, IDS.omenOrgId],
  );
  await client.query(
    `INSERT INTO agents (id, org_id, name, description, status)
     VALUES ($1, $2, 'TechVision Product Team', 'Product and engineering knowledge base', 'published')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description`,
    [IDS.techvisionAgentId, IDS.techvisionOrgId],
  );

  const kbs = [
    { id: IDS.omenKb1, agentId: IDS.omenAgentId, name: "Home Insurance Policies", collection: "dev_omen_home_insurance" },
    { id: IDS.omenKb2, agentId: IDS.omenAgentId, name: "Motor Insurance 2024", collection: "dev_omen_motor_insurance" },
    { id: IDS.omenKb3, agentId: IDS.omenAgentId, name: "Life & Health Plans", collection: "dev_omen_life_health" },
    { id: IDS.tvKb1, agentId: IDS.techvisionAgentId, name: "Product Documentation", collection: "dev_tv_product_docs" },
    { id: IDS.tvKb2, agentId: IDS.techvisionAgentId, name: "Engineering Runbooks", collection: "dev_tv_engineering" },
  ] as const;

  for (const kb of kbs) {
    await client.query(
      `INSERT INTO knowledge_bases (id, agent_id, name, qdrant_collection, status)
       VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT (id) DO NOTHING`,
      [kb.id, kb.agentId, kb.name, kb.collection],
    );
  }

  const omenPrompt =
    "You are Aria, an AI assistant for Omen United Insurance. " +
    "Answer questions about insurance policies using only information from the knowledge base. " +
    "Always cite your sources with [S1], [S2] notation. " +
    "Be accurate, professional, and helpful. " +
    "If you cannot find an answer in the knowledge base, say so clearly.";
  for (const kbId of [IDS.omenKb1, IDS.omenKb2, IDS.omenKb3]) {
    await client.query(
      `INSERT INTO assistant_configs
         (kb_id, assistant_name, system_prompt, welcome_message, out_of_scope_reply,
          voice_id, primary_colour, accent_colour, temperature, max_tokens, cite_sources, strict_mode)
       VALUES ($1, 'Aria', $2,
         'Hello! I''m Aria, your Omen Insurance assistant. How can I help you today?',
         'I can only answer questions about Omen United Insurance policies and products.',
         'alloy', '#0a1628', '#c8821a', 0.7, 500, TRUE, TRUE)
       ON CONFLICT (kb_id) DO UPDATE SET
         assistant_name = EXCLUDED.assistant_name,
         system_prompt = EXCLUDED.system_prompt,
         primary_colour = EXCLUDED.primary_colour,
         accent_colour = EXCLUDED.accent_colour`,
      [kbId, omenPrompt],
    );
  }

  const tvPrompt =
    "You are Sage, a technical AI assistant for TechVision Solutions. " +
    "Help engineers and product managers find information in our documentation. " +
    "Use code examples where helpful. Be concise and technically precise.";
  for (const kbId of [IDS.tvKb1, IDS.tvKb2]) {
    await client.query(
      `INSERT INTO assistant_configs
         (kb_id, assistant_name, system_prompt, welcome_message, out_of_scope_reply,
          voice_id, primary_colour, accent_colour, temperature, max_tokens, cite_sources, strict_mode)
       VALUES ($1, 'Sage', $2,
         'Hi! I''m Sage, your TechVision AI assistant. What can I help you find?',
         'I can only answer questions about TechVision product and engineering documentation.',
         'echo', '#0f172a', '#0ea5e9', 0.5, 600, TRUE, TRUE)
       ON CONFLICT (kb_id) DO UPDATE SET
         assistant_name = EXCLUDED.assistant_name,
         system_prompt = EXCLUDED.system_prompt,
         primary_colour = EXCLUDED.primary_colour,
         accent_colour = EXCLUDED.accent_colour`,
      [kbId, tvPrompt],
    );
  }

  logger.log("[seed:dev] demo agents + KBs + assistant personas ready");
}

async function seedDemoQueryEvents(client: PoolClient, logger: Logger) {
  // Replace any previously generated sample events so re-seeding never
  // double-counts (dev analytics stay deterministic).
  const kbIds = [IDS.omenKb1, IDS.omenKb2, IDS.omenKb3, IDS.tvKb1, IDS.tvKb2];
  await client.query(`DELETE FROM query_events WHERE kb_id = ANY($1::uuid[])`, [kbIds]);

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
    { id: IDS.omenKb1, queries: omenQueries, count: 400 },
    { id: IDS.omenKb2, queries: omenQueries, count: 300 },
    { id: IDS.omenKb3, queries: omenQueries, count: 300 },
    { id: IDS.tvKb1, queries: tvQueries, count: 300 },
    { id: IDS.tvKb2, queries: tvQueries, count: 200 },
  ] as const;

  for (const kb of allKbs) {
    const values: (string | number)[] = [];
    const placeholders: string[] = [];
    let parameter = 1;

    for (let i = 0; i < kb.count; i++) {
      const daysAgo = Math.floor(Math.random() * 30);
      const hoursAgo = Math.floor(Math.random() * 24);
      const timestamp = new Date(Date.now() - daysAgo * 86_400_000 - hoursAgo * 3_600_000);
      const queryText = kb.queries[Math.floor(Math.random() * kb.queries.length)]!;
      const latency = Math.floor(200 + Math.random() * 800);
      const sourceCount = Math.floor(1 + Math.random() * 4);

      placeholders.push(`($${parameter++},$${parameter++},$${parameter++},$${parameter++},$${parameter++})`);
      values.push(kb.id, queryText, latency, sourceCount, timestamp.toISOString());
    }

    await client.query(
      `INSERT INTO query_events (kb_id, query_text, latency_ms, source_count, created_at)
       VALUES ${placeholders.join(",")}`,
      values,
    );
  }

  logger.log("[seed:dev] sample query events generated (analytics demo data)");
}

export async function seedDevelopmentData(options?: { logger?: Logger }) {
  const logger = options?.logger ?? console;

  // Dev includes everything production has…
  await seedProductionData({ logger });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await seedDemoOrgs(client, logger);
    await seedDemoAgentsAndKbs(client, logger);
    await seedDemoQueryEvents(client, logger);
    await client.query("COMMIT");
    logger.log("[seed:dev] development seed complete.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
