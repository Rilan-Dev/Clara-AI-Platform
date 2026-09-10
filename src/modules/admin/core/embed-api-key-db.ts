import { query, queryOne, execute } from "@/lib/db";

/**
 * Get the current embed API key
 */
export async function getEmbedApiKey(): Promise<string | null> {
  const row = await queryOne<{ key: string }>(
    "SELECT key FROM embed_api_key ORDER BY updated_at DESC LIMIT 1"
  );
  return row?.key ?? null;
}

/**
 * Update the embed API key
 */
export async function updateEmbedApiKey(key: string): Promise<string> {
  const row = await queryOne<{ key: string }>(
    `INSERT INTO embed_api_key (key)
     VALUES ($1)
     ON CONFLICT (key) DO UPDATE SET updated_at = NOW()
     RETURNING key`,
    [key.trim()]
  );
  if (!row) throw new Error("Failed to update embed API key");
  return row.key;
}

/**
 * Delete the embed API key
 */
export async function deleteEmbedApiKey(): Promise<void> {
  await execute("DELETE FROM embed_api_key");
}
