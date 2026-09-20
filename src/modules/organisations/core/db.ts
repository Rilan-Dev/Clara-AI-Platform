/**
 * src/modules/organisations/core/db.ts
 * All PostgreSQL queries for organisations and agents.
 *
 * Agents are the former "projects" — one entity that owns its knowledge
 * bases AND its assistant configuration (assistant_configs, 1:1) used by
 * the runtime AI config resolution. Knowledge bases hold content only.
 */

import { query, queryOne, withTransaction } from "@/lib/db";
import { getPlatformAssistantDefaults } from "@/modules/ai-core/assistant-defaults-db";
import type { Agent, AgentStatus, Organisation, CreateOrgInput, UpdateOrgInput, CreateAgentInput, UpdateAgentInput } from "./models";

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "org";
}

async function uniqueSlug(base: string): Promise<string> {
  let candidate = base;
  let n = 2;
  while (true) {
    const existing = await queryOne<{ id: string }>("SELECT id FROM organisations WHERE slug = $1", [candidate]);
    if (!existing) return candidate;
    candidate = `${base}-${n++}`;
  }
}

function toOrg(row: Record<string, unknown>): Organisation {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    logoUrl: row.logo_url != null ? String(row.logo_url) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    agentCount: row.agent_count != null ? Number(row.agent_count) : undefined,
    knowledgeBaseCount: row.kb_count != null ? Number(row.kb_count) : undefined,
  };
}

function str(v: unknown, fb: string): string { return v != null ? String(v) : fb; }
function strN(v: unknown): string | null { return v != null ? String(v) : null; }

function toAgent(row: Record<string, unknown>): Agent {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    name: str(row.name, ""),
    description: strN(row.description),
    status: (row.status as AgentStatus) ?? "draft",
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

// ── Validation ───────────────────────────────────────────────────────────────

const AGENT_STATUSES = new Set<AgentStatus>(["draft", "published", "archived"]);

export class AgentValidationError extends Error {
  constructor(message: string) { super(message); this.name = "AgentValidationError"; }
}

function validateAgentUpdate(input: UpdateAgentInput): void {
  if (input.name !== undefined && !input.name.trim()) throw new AgentValidationError("name cannot be empty");
  if (input.status !== undefined && !AGENT_STATUSES.has(input.status)) throw new AgentValidationError("status must be draft, published or archived");
}

// ── Organisations ─────────────────────────────────────────────────────────────

export async function createOrganisation(input: CreateOrgInput): Promise<Organisation> {
  const slug = await uniqueSlug(input.slug ? slugify(input.slug) : slugify(input.name));
  return withTransaction(async (client) => {
    const result = await client.query<Record<string, unknown>>(
      `INSERT INTO organisations (name, slug, logo_url) VALUES ($1, $2, $3) RETURNING *`,
      [input.name, slug, input.logoUrl ?? null],
    );
    const orgRow = result.rows[0]!;
    await client.query(`INSERT INTO org_ai_settings (org_id) VALUES ($1) ON CONFLICT (org_id) DO NOTHING`, [orgRow.id]);
    return toOrg(orgRow);
  });
}

export async function listOrganisations(): Promise<Organisation[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT o.*, COUNT(DISTINCT a.id)::int AS agent_count, COUNT(DISTINCT kb.id)::int AS kb_count
     FROM organisations o
     LEFT JOIN agents a ON a.org_id = o.id
     LEFT JOIN knowledge_bases kb ON kb.agent_id = a.id
     GROUP BY o.id
     ORDER BY o.name ASC`,
  );
  return rows.map(toOrg);
}

export async function getOrganisationById(id: string): Promise<Organisation | null> {
  const row = await queryOne<Record<string, unknown>>("SELECT * FROM organisations WHERE id = $1", [id]);
  return row ? toOrg(row) : null;
}

export async function getOrganisationBySlug(slug: string): Promise<Organisation | null> {
  const row = await queryOne<Record<string, unknown>>("SELECT * FROM organisations WHERE slug = $1", [slug]);
  return row ? toOrg(row) : null;
}

export async function updateOrganisation(id: string, input: UpdateOrgInput): Promise<Organisation | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (input.name !== undefined) { sets.push(`name = $${i++}`); params.push(input.name); }
  if (input.logoUrl !== undefined) { sets.push(`logo_url = $${i++}`); params.push(input.logoUrl); }
  if (sets.length === 0) return getOrganisationById(id);
  params.push(id);
  const row = await queryOne<Record<string, unknown>>(`UPDATE organisations SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, params);
  return row ? toOrg(row) : null;
}

export async function deleteOrganisation(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>("DELETE FROM organisations WHERE id = $1 RETURNING id", [id]);
  return rows.length > 0;
}

// ── Agents ────────────────────────────────────────────────────────────────────

export async function createAgent(orgId: string, input: CreateAgentInput): Promise<Agent> {
  const name = input.name.trim();
  if (!name) throw new AgentValidationError("name is required");

  const duplicate = await queryOne<{ id: string }>(
    "SELECT id FROM agents WHERE org_id = $1 AND lower(name) = lower($2)",
    [orgId, name],
  );
  if (duplicate) throw new AgentValidationError("An agent with this name already exists in your organisation");

  // New agents start from the platform assistant defaults (Identity /
  // Behaviour / Language / Voice). The values are COPIED at creation time —
  // later platform default edits never touch this agent.
  const defaults = await getPlatformAssistantDefaults();

  return withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO agents (org_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [orgId, name, input.description?.trim() || null],
    );
    const agent = toAgent(result.rows[0] as Record<string, unknown>);

    // Seed the agent-owned assistant config from the platform defaults
    // (Identity / Behaviour / Language / Voice). Values are COPIED at creation
    // time — later platform default edits never touch this agent.
    // assistant_configs has NOT NULL constraints — empty platform defaults
    // fall back to the SQL column defaults.
    await client.query(
      `INSERT INTO assistant_configs (
         agent_id, assistant_name, avatar_url, system_prompt, welcome_message,
         out_of_scope_reply, rules, default_language, allowed_languages,
         always_respond_in, voice_id, speed
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::text[],$10,$11,$12)`,
      [
        agent.id,
        defaults.assistantName,
        defaults.avatarUrl,
        defaults.systemPrompt,
        defaults.welcomeMessage,
        defaults.outOfScopeReply,
        JSON.stringify(defaults.rules),
        defaults.defaultLanguage,
        defaults.allowedLanguages,
        defaults.alwaysRespondIn,
        defaults.voiceId ?? "alloy",
        defaults.voiceSpeed ?? 1.0,
      ],
    );

    await client.query(`INSERT INTO agent_ai_settings (agent_id, org_id) VALUES ($1, $2) ON CONFLICT (agent_id) DO NOTHING`, [agent.id, orgId]);
    return agent;
  }).then(async (agent) => {
  // ── Agent version-control bootstrap (migration Stage E/F) ────────────────
  // Every new agent enters the versioned world immediately: permanent Main
  // branch + draft seeded from the CURRENT platform default assistant
  // version, with the source default version recorded for provenance (agents
  // are never silently mutated by later default changes). Best-effort:
  // ensureAgentVersioning is idempotent and self-heals on the first
  // workspace visit, so a failure here never blocks agent creation.
  try {
    const { ensureAgentVersioning, recordDefaultAssistantProvenanceIfMissing } = await import(
      "@/modules/agent-versioning/core/service"
    );
    await ensureAgentVersioning(agent.id, input.createdBy ?? null);
    await recordDefaultAssistantProvenanceIfMissing(agent.id);
  } catch (versioningErr) {
    console.warn(
      `[agents] version-control bootstrap deferred for agent ${agent.id}:`,
      (versioningErr as Error).message,
    );
  }
  return agent;
  });
}

export async function listAgents(orgId: string): Promise<Agent[]> {
  const rows = await query<Record<string, unknown>>("SELECT * FROM agents WHERE org_id = $1 ORDER BY name ASC", [orgId]);
  return rows.map(toAgent);
}

export async function getAgentById(id: string): Promise<Agent | null> {
  const row = await queryOne<Record<string, unknown>>("SELECT * FROM agents WHERE id = $1", [id]);
  return row ? toAgent(row) : null;
}

export async function updateAgent(id: string, input: UpdateAgentInput): Promise<Agent | null> {
  validateAgentUpdate(input);

  const sets: string[] = [];
  const params: unknown[] = [];
  const fieldMap: Array<[keyof UpdateAgentInput, string]> = [
    ["name", "name"],
    ["description", "description"],
    ["status", "status"],
  ];

  for (const [key, column] of fieldMap) {
    const value = (input as Record<string, unknown>)[key as string];
    if (value === undefined) continue;
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  }

  if (sets.length === 0) return getAgentById(id);

  params.push(id);
  const row = await queryOne<Record<string, unknown>>(
    `UPDATE agents SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  return row ? toAgent(row) : null;
}

export async function deleteAgent(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>("DELETE FROM agents WHERE id = $1 RETURNING id", [id]);
  return rows.length > 0;
}
