/**
 * src/modules/organisations/core/db.ts
 * All PostgreSQL queries for organisations and projects.
 */

import { query, queryOne, execute, withTransaction } from "@/lib/db";
import type {
  Organisation,
  Project,
  CreateOrgInput,
  UpdateOrgInput,
  CreateProjectInput,
  UpdateProjectInput,
} from "./models";

// ── Slug helper ───────────────────────────────────────────────────────────────

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "org";
}

/** Appends -2, -3 … until the slug is unique in the organisations table. */
async function uniqueSlug(base: string): Promise<string> {
  let candidate = base;
  let n = 2;
  while (true) {
    const existing = await queryOne<{ id: string }>(
      "SELECT id FROM organisations WHERE slug = $1",
      [candidate]
    );
    if (!existing) return candidate;
    candidate = `${base}-${n++}`;
  }
}

// ── Row → model mappers ───────────────────────────────────────────────────────

function toOrg(row: Record<string, unknown>): Organisation {
  return {
    id:        String(row.id),
    name:      String(row.name),
    slug:      String(row.slug),
    logoUrl:   row.logo_url != null ? String(row.logo_url) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toProject(row: Record<string, unknown>): Project {
  return {
    id:          String(row.id),
    orgId:       String(row.org_id),
    name:        String(row.name),
    description: row.description != null ? String(row.description) : null,
    createdAt:   String(row.created_at),
    updatedAt:   String(row.updated_at),
  };
}

// ── Organisation CRUD ─────────────────────────────────────────────────────────

export async function createOrganisation(input: CreateOrgInput): Promise<Organisation> {
  const base = input.slug ? slugify(input.slug) : slugify(input.name);
  const slug = await uniqueSlug(base);

  const rows = await query<Record<string, unknown>>(
    `INSERT INTO organisations (name, slug, logo_url)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [input.name, slug, input.logoUrl ?? null]
  );
  return toOrg(rows[0]!);
}

export async function listOrganisations(): Promise<Organisation[]> {
  const rows = await query<Record<string, unknown>>(
    "SELECT * FROM organisations ORDER BY name ASC"
  );
  return rows.map(toOrg);
}

export async function getOrganisationById(id: string): Promise<Organisation | null> {
  const row = await queryOne<Record<string, unknown>>(
    "SELECT * FROM organisations WHERE id = $1",
    [id]
  );
  return row ? toOrg(row) : null;
}

export async function getOrganisationBySlug(slug: string): Promise<Organisation | null> {
  const row = await queryOne<Record<string, unknown>>(
    "SELECT * FROM organisations WHERE slug = $1",
    [slug]
  );
  return row ? toOrg(row) : null;
}

export async function updateOrganisation(
  id: string,
  input: UpdateOrgInput
): Promise<Organisation | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (input.name      !== undefined) { sets.push(`name = $${i++}`);     params.push(input.name); }
  if (input.logoUrl   !== undefined) { sets.push(`logo_url = $${i++}`); params.push(input.logoUrl); }

  if (sets.length === 0) return getOrganisationById(id);

  params.push(id);
  const row = await queryOne<Record<string, unknown>>(
    `UPDATE organisations SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    params
  );
  return row ? toOrg(row) : null;
}

export async function deleteOrganisation(id: string): Promise<boolean> {
  // CASCADE deletes projects → knowledge_bases → assistant_configs automatically.
  // Qdrant collections must be deleted separately (handled in KB service).
  const rows = await query<{ id: string }>(
    "DELETE FROM organisations WHERE id = $1 RETURNING id",
    [id]
  );
  return rows.length > 0;
}

// ── Project CRUD ──────────────────────────────────────────────────────────────

export async function createProject(
  orgId: string,
  input: CreateProjectInput
): Promise<Project> {
  const rows = await query<Record<string, unknown>>(
    `INSERT INTO projects (org_id, name, description)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [orgId, input.name, input.description ?? null]
  );
  return toProject(rows[0]!);
}

export async function listProjects(orgId: string): Promise<Project[]> {
  const rows = await query<Record<string, unknown>>(
    "SELECT * FROM projects WHERE org_id = $1 ORDER BY name ASC",
    [orgId]
  );
  return rows.map(toProject);
}

export async function getProjectById(id: string): Promise<Project | null> {
  const row = await queryOne<Record<string, unknown>>(
    "SELECT * FROM projects WHERE id = $1",
    [id]
  );
  return row ? toProject(row) : null;
}

export async function updateProject(
  id: string,
  input: UpdateProjectInput
): Promise<Project | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (input.name        !== undefined) { sets.push(`name = $${i++}`);        params.push(input.name); }
  if (input.description !== undefined) { sets.push(`description = $${i++}`); params.push(input.description); }

  if (sets.length === 0) return getProjectById(id);

  params.push(id);
  const row = await queryOne<Record<string, unknown>>(
    `UPDATE projects SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    params
  );
  return row ? toProject(row) : null;
}

export async function deleteProject(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    "DELETE FROM projects WHERE id = $1 RETURNING id",
    [id]
  );
  return rows.length > 0;
}
