/**
 * src/modules/agents/core/db.ts
 * All PostgreSQL queries for agents and project_agents.
 *
 * Business rules enforced here:
 *  - Agents belong to an organisation (tenant isolation via org_id).
 *  - A project has at most ONE active agent (DB partial unique index
 *    project_agents_one_active_per_project), while an agent can power
 *    many projects.
 *  - Assigning a new agent deactivates the previous one (history kept).
 */

import { query, queryOne, withTransaction } from "@/lib/db";
import { getPlatformAssistantDefaults } from "@/modules/ai-core/assistant-defaults-db";
import type {
  Agent, AgentSummary, AgentStatus, CreateAgentInput, UpdateAgentInput,
  ProjectAgentAssignment, AssignAgentResult,
} from "./models";

// ── Row → model ───────────────────────────────────────────────────────────────

function str(v: unknown, fb: string): string { return v != null ? String(v) : fb; }
function strN(v: unknown): string | null { return v != null ? String(v) : null; }
function num(v: unknown, fb: number): number { return v != null ? Number(v) : fb; }
function bool(v: unknown, fb: boolean): boolean { return v != null ? Boolean(v) : fb; }
function strArr(v: unknown, fb: string[]): string[] { return Array.isArray(v) ? (v as string[]) : fb; }

function toAgent(row: Record<string, unknown>): Agent {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    name: str(row.name, ""),
    description: strN(row.description),
    status: (row.status as AgentStatus) ?? "draft",
    assistantName: str(row.assistant_name, "Clara"),
    avatarUrl: strN(row.avatar_url),
    systemPrompt: str(row.system_prompt, ""),
    welcomeMessage: str(row.welcome_message, ""),
    outOfScopeReply: str(row.out_of_scope_reply, ""),
    rules: strArr(row.rules, []),
    defaultLanguage: str(row.default_language, "en"),
    allowedLanguages: strArr(row.allowed_languages, ["en"]),
    alwaysRespondIn: strN(row.always_respond_in),
    voiceProvider: (row.voice_provider as "openai" | "gemini" | null) ?? null,
    voiceId: strN(row.voice_id),
    speed: num(row.speed, 1.0),
    chatModel: strN(row.chat_model),
    temperature: num(row.temperature, 0.7),
    maxTokens: num(row.max_tokens, 500),
    citeSources: bool(row.cite_sources, true),
    strictMode: bool(row.strict_mode, true),
    createdBy: strN(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    orgName: strN(row.org_name),
    projectCount: row.project_count != null ? Number(row.project_count) : undefined,
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

const VOICE_PROVIDERS = new Set(["openai", "gemini"]);
const AGENT_STATUSES = new Set<AgentStatus>(["draft", "published", "archived"]);

export class AgentValidationError extends Error {
  constructor(message: string) { super(message); this.name = "AgentValidationError"; }
}

function validateUpdate(input: UpdateAgentInput): void {
  if (input.name !== undefined && !input.name.trim()) throw new AgentValidationError("name cannot be empty");
  if (input.assistantName !== undefined && !input.assistantName.trim()) throw new AgentValidationError("assistantName cannot be empty");
  if (input.status !== undefined && !AGENT_STATUSES.has(input.status)) throw new AgentValidationError("status must be draft, published or archived");
  if (input.voiceProvider !== undefined && input.voiceProvider !== null && !VOICE_PROVIDERS.has(input.voiceProvider)) throw new AgentValidationError("voiceProvider must be openai or gemini");
  if (input.speed !== undefined && (input.speed < 0.25 || input.speed > 4.0)) throw new AgentValidationError("speed must be between 0.25 and 4.0");
  if (input.temperature !== undefined && (input.temperature < 0 || input.temperature > 1)) throw new AgentValidationError("temperature must be between 0 and 1");
  if (input.maxTokens !== undefined && (input.maxTokens < 50 || input.maxTokens > 4000)) throw new AgentValidationError("maxTokens must be between 50 and 4000");
  if (input.rules !== undefined && !Array.isArray(input.rules)) throw new AgentValidationError("rules must be a list of strings");
  if (input.rules !== undefined) input.rules = input.rules.map((r) => String(r)).filter((r) => r.trim() !== "");
  if (input.allowedLanguages !== undefined) {
    if (!Array.isArray(input.allowedLanguages) || input.allowedLanguages.length === 0) throw new AgentValidationError("allowedLanguages must have at least one language");
    input.allowedLanguages = input.allowedLanguages.map((l) => String(l).trim().toLowerCase()).filter(Boolean);
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function createAgent(input: CreateAgentInput): Promise<Agent> {
  const name = input.name.trim();
  if (!name) throw new AgentValidationError("name is required");

  const duplicate = await queryOne<{ id: string }>(
    "SELECT id FROM agents WHERE org_id = $1 AND lower(name) = lower($2)",
    [input.orgId, name],
  );
  if (duplicate) throw new AgentValidationError("An agent with this name already exists in your organisation");

  // New agents start from the platform assistant defaults (Identity /
  // Behaviour / Language / Voice). The values are COPIED at creation time —
  // later platform default edits never touch this agent. Any field the
  // creator supplied explicitly wins over the default.
  const defaults = await getPlatformAssistantDefaults();

  const row = await queryOne<Record<string, unknown>>(
    `INSERT INTO agents (
       org_id, name, description, assistant_name, avatar_url,
       system_prompt, welcome_message, out_of_scope_reply, rules,
       default_language, allowed_languages, always_respond_in,
       voice_id, speed, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::text[], $12, $13, $14, $15)
     RETURNING *`,
    [
      input.orgId, name,
      input.description?.trim() || null,
      input.assistantName?.trim() || defaults.assistantName,
      input.avatarUrl?.trim() || defaults.avatarUrl,
      input.systemPrompt?.trim() || defaults.systemPrompt,
      input.welcomeMessage?.trim() || defaults.welcomeMessage,
      input.outOfScopeReply?.trim() || defaults.outOfScopeReply,
      JSON.stringify(input.rules?.length ? input.rules : defaults.rules),
      input.defaultLanguage?.trim().toLowerCase() || defaults.defaultLanguage,
      input.allowedLanguages?.length
        ? input.allowedLanguages.map((l) => l.trim().toLowerCase()).filter(Boolean)
        : defaults.allowedLanguages,
      input.alwaysRespondIn?.trim() || defaults.alwaysRespondIn,
      input.voiceId?.trim() || defaults.voiceId,
      input.voiceSpeed ?? defaults.voiceSpeed ?? 1.0,
      input.createdBy ?? null,
    ],
  );
  return toAgent(row!);
}

export async function listAgents(orgId?: string | null): Promise<AgentSummary[]> {
  const rows = orgId
    ? await query<Record<string, unknown>>(
        `SELECT a.*, o.name AS org_name,
                (SELECT count(*)::int FROM project_agents pa WHERE pa.agent_id = a.id AND pa.is_active) AS project_count
         FROM agents a JOIN organisations o ON o.id = a.org_id
         WHERE a.org_id = $1
         ORDER BY a.created_at DESC`,
        [orgId],
      )
    : await query<Record<string, unknown>>(
        `SELECT a.*, o.name AS org_name,
                (SELECT count(*)::int FROM project_agents pa WHERE pa.agent_id = a.id AND pa.is_active) AS project_count
         FROM agents a JOIN organisations o ON o.id = a.org_id
         ORDER BY a.created_at DESC`,
      );
  return rows.map(toAgent);
}

export async function getAgentById(agentId: string): Promise<Agent | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT a.*, o.name AS org_name FROM agents a JOIN organisations o ON o.id = a.org_id WHERE a.id = $1`,
    [agentId],
  );
  return row ? toAgent(row) : null;
}

export async function updateAgent(agentId: string, input: UpdateAgentInput): Promise<Agent | null> {
  validateUpdate(input);

  const sets: string[] = [];
  const params: unknown[] = [];
  const fieldMap: Array<[keyof UpdateAgentInput, string]> = [
    ["name", "name"],
    ["description", "description"],
    ["status", "status"],
    ["assistantName", "assistant_name"],
    ["avatarUrl", "avatar_url"],
    ["systemPrompt", "system_prompt"],
    ["welcomeMessage", "welcome_message"],
    ["outOfScopeReply", "out_of_scope_reply"],
    ["defaultLanguage", "default_language"],
    ["alwaysRespondIn", "always_respond_in"],
    ["voiceProvider", "voice_provider"],
    ["voiceId", "voice_id"],
    ["speed", "speed"],
    ["chatModel", "chat_model"],
    ["temperature", "temperature"],
    ["maxTokens", "max_tokens"],
    ["citeSources", "cite_sources"],
    ["strictMode", "strict_mode"],
  ];

  for (const [key, column] of fieldMap) {
    const value = (input as Record<string, unknown>)[key as string];
    if (value === undefined) continue;
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  }
  if (input.rules !== undefined) { params.push(JSON.stringify(input.rules)); sets.push(`rules = $${params.length}::jsonb`); }
  if (input.allowedLanguages !== undefined) { params.push(input.allowedLanguages); sets.push(`allowed_languages = $${params.length}::text[]`); }

  if (sets.length === 0) return getAgentById(agentId);

  params.push(agentId);
  const row = await queryOne<Record<string, unknown>>(
    `UPDATE agents SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  return row ? toAgent(row) : null;
}

export async function deleteAgent(agentId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>("DELETE FROM agents WHERE id = $1 RETURNING id", [agentId]);
  return Boolean(row);
}

// ── Project ↔ Agent assignment ────────────────────────────────────────────────

export async function getActiveAgentForProject(projectId: string): Promise<Agent | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT a.* FROM agents a
     JOIN project_agents pa ON pa.agent_id = a.id
     WHERE pa.project_id = $1 AND pa.is_active`,
    [projectId],
  );
  return row ? toAgent(row) : null;
}

export async function listProjectsForAgent(agentId: string): Promise<ProjectAgentAssignment[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT pa.project_id, p.name AS project_name, pa.agent_id, a.name AS agent_name,
            pa.org_id, pa.is_active, pa.assigned_by, pa.assigned_at
     FROM project_agents pa
     JOIN projects p ON p.id = pa.project_id
     JOIN agents a ON a.id = pa.agent_id
     WHERE pa.agent_id = $1
     ORDER BY pa.is_active DESC, pa.assigned_at DESC`,
    [agentId],
  );
  return rows.map((row) => ({
    projectId: String(row.project_id),
    projectName: str(row.project_name, ""),
    agentId: String(row.agent_id),
    agentName: str(row.agent_name, ""),
    orgId: String(row.org_id),
    isActive: bool(row.is_active, false),
    assignedBy: strN(row.assigned_by),
    assignedAt: String(row.assigned_at),
  }));
}

/**
 * Assign an agent to a project (or unassign with agentId = null).
 * Deactivates any previously active agent on that project — history is kept
 * in project_agents so you can always see which agent was used when.
 * The agent must belong to the same organisation as the project.
 */
export async function assignAgentToProject(
  projectId: string,
  agentId: string | null,
  assignedBy?: string | null,
): Promise<AssignAgentResult> {
  return withTransaction(async (client) => {
    const project = await client.query<{ id: string; org_id: string }>(
      "SELECT id, org_id FROM projects WHERE id = $1",
      [projectId],
    );
    if (project.rowCount === 0) throw new AgentValidationError("Project not found");
    const orgId = String(project.rows[0].org_id);

    // Deactivate current active assignment (if any)
    const prev = await client.query<{ agent_id: string }>(
      "UPDATE project_agents SET is_active = false WHERE project_id = $1 AND is_active RETURNING agent_id",
      [projectId],
    );
    const previousAgentId = prev.rowCount && prev.rows[0] ? String(prev.rows[0].agent_id) : null;

    if (agentId === null) {
      return { projectId, previousAgentId, agentId: null };
    }

    // Validate agent exists and belongs to the same org as the project
    const agent = await client.query<{ id: string; org_id: string }>(
      "SELECT id, org_id FROM agents WHERE id = $1",
      [agentId],
    );
    if (agent.rowCount === 0) throw new AgentValidationError("Agent not found");
    if (String(agent.rows[0].org_id) !== orgId) throw new AgentValidationError("Agent belongs to a different organisation than the project");

    // Upsert the assignment and mark it active
    await client.query(
      `INSERT INTO project_agents (project_id, agent_id, org_id, is_active, assigned_by)
       VALUES ($1, $2, $3, true, $4)
       ON CONFLICT (project_id, agent_id)
       DO UPDATE SET is_active = true, assigned_by = $4, assigned_at = now()`,
      [projectId, agentId, orgId, assignedBy ?? null],
    );

    return { projectId, previousAgentId, agentId };
  });
}
