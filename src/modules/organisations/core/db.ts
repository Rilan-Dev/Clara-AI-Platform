/**
 * src/modules/organisations/core/db.ts
 * All PostgreSQL queries for organisations and projects.
 */

import { query, queryOne, withTransaction } from "@/lib/db";
import type { Organisation, Project, CreateOrgInput, UpdateOrgInput, CreateProjectInput, UpdateProjectInput } from "./models";

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
    projectCount: row.project_count != null ? Number(row.project_count) : undefined,
    knowledgeBaseCount: row.kb_count != null ? Number(row.kb_count) : undefined,
  };
}

function toProject(row: Record<string, unknown>): Project {
  return { id: String(row.id), orgId: String(row.org_id), name: String(row.name), description: row.description != null ? String(row.description) : null, createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

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
    `SELECT o.*, COUNT(DISTINCT p.id)::int AS project_count, COUNT(DISTINCT kb.id)::int AS kb_count
     FROM organisations o
     LEFT JOIN projects p ON p.org_id = o.id
     LEFT JOIN knowledge_bases kb ON kb.project_id = p.id
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

export async function createProject(orgId: string, input: CreateProjectInput): Promise<Project> {
  return withTransaction(async (client) => {
    const projectRow = await client.query(`INSERT INTO projects (org_id, name, description) VALUES ($1, $2, $3) RETURNING *`, [orgId, input.name, input.description ?? null]);
    const project = toProject(projectRow.rows[0]);
    await client.query(`INSERT INTO project_ai_settings (project_id, org_id) VALUES ($1, $2) ON CONFLICT (project_id) DO NOTHING`, [project.id, orgId]);
    return project;
  });
}

export async function listProjects(orgId: string): Promise<Project[]> {
  const rows = await query<Record<string, unknown>>("SELECT * FROM projects WHERE org_id = $1 ORDER BY name ASC", [orgId]);
  return rows.map(toProject);
}

export async function getProjectById(id: string): Promise<Project | null> {
  const row = await queryOne<Record<string, unknown>>("SELECT * FROM projects WHERE id = $1", [id]);
  return row ? toProject(row) : null;
}

export async function updateProject(id: string, input: UpdateProjectInput): Promise<Project | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (input.name !== undefined) { sets.push(`name = $${i++}`); params.push(input.name); }
  if (input.description !== undefined) { sets.push(`description = $${i++}`); params.push(input.description); }
  if (sets.length === 0) return getProjectById(id);
  params.push(id);
  const row = await queryOne<Record<string, unknown>>(`UPDATE projects SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, params);
  return row ? toProject(row) : null;
}

export async function deleteProject(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>("DELETE FROM projects WHERE id = $1 RETURNING id", [id]);
  return rows.length > 0;
}
