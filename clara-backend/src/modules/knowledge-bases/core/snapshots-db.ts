/**
 * src/modules/knowledge-bases/core/snapshots-db.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD for config_snapshots table.
 * Strategy: save current config before each edit, prune to 5 per KB.
 */

import { randomUUID } from "node:crypto";
import { query, queryOne, execute } from "@/lib/db";
import type { AssistantConfig } from "./models";

const MAX_SNAPSHOTS = 5;

export type ConfigSnapshot = {
  id:        string;
  kbId:      string;
  label:     string | null;
  snapshot:  AssistantConfig;
  createdBy: string | null;
  createdAt: string;
};

function toSnapshot(row: Record<string, unknown>): ConfigSnapshot {
  return {
    id:        String(row.id),
    kbId:      String(row.kb_id),
    label:     row.label != null ? String(row.label) : null,
    snapshot:  row.snapshot as AssistantConfig,
    createdBy: row.created_by != null ? String(row.created_by) : null,
    createdAt: String(row.created_at),
  };
}

/** Save current config as an immutable snapshot, then prune oldest if > MAX. */
export async function snapshotConfig(
  config: AssistantConfig,
  createdBy?: string,
  label?: string
): Promise<ConfigSnapshot> {
  const id = randomUUID();
  const row = await queryOne<Record<string, unknown>>(
    `INSERT INTO config_snapshots (id, kb_id, label, snapshot, created_by)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     RETURNING *`,
    [id, config.kbId, label ?? null, JSON.stringify(config), createdBy ?? null]
  );
  if (!row) throw new Error("Failed to create config snapshot");

  // Prune: keep only the newest MAX_SNAPSHOTS per KB
  await execute(
    `DELETE FROM config_snapshots
     WHERE kb_id = $1
       AND id NOT IN (
         SELECT id FROM config_snapshots
         WHERE kb_id = $1
         ORDER BY created_at DESC
         LIMIT $2
       )`,
    [config.kbId, MAX_SNAPSHOTS]
  );

  return toSnapshot(row);
}

/** List the last MAX_SNAPSHOTS snapshots for a KB, newest first. */
export async function listSnapshots(kbId: string): Promise<ConfigSnapshot[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM config_snapshots
     WHERE kb_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [kbId, MAX_SNAPSHOTS]
  );
  return rows.map(toSnapshot);
}

/** Get a specific snapshot by id (validates it belongs to kbId). */
export async function getSnapshot(id: string, kbId: string): Promise<ConfigSnapshot | null> {
  const row = await queryOne<Record<string, unknown>>(
    "SELECT * FROM config_snapshots WHERE id = $1 AND kb_id = $2",
    [id, kbId]
  );
  return row ? toSnapshot(row) : null;
}
