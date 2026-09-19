import { queryOne, execute } from "@/lib/db";

/**
 * Get the current embed API key
 */
export async function getEmbedApiKey(): Promise<string | null> {
  const row = await queryOne<{ key: string }>(
    "SELECT key FROM embed_api_key ORDER BY updated_at DESC LIMIT 1"
  );
  return row?.key ?? null;
}

/** Where the resolved landing-demo embed credential came from. */
export type LandingEmbedKeySource = "platform_setting" | "env" | "legacy_key";

/**
 * Resolve the public embed credential the landing-page demo uses.
 *
 * Priority:
 *   1. NEXT_PUBLIC_LANDING_EMBED_API_KEY platform setting (Settings → Embed —
 *      what the platform admin configures; rows are hot-applied to process.env
 *      on save, so changes take effect without a restart)
 *   2. NEXT_PUBLIC_LANDING_EMBED_API_KEY deployment env var
 *   3. the legacy single-key embed_api_key row (production seed / legacy
 *      deployments) — last resort so the demo still functions
 *
 * The key identifies the KB the demo renders: when the admin points the
 * setting at one organisation's embed key, the landing demo serves THAT
 * organisation's KB (persona, design, documents) — never static demo data.
 */
export async function resolveLandingEmbedKey(): Promise<{
  key: string;
  source: LandingEmbedKeySource | null;
}> {
  let setting: string | undefined;
  try {
    const row = await queryOne<{ value: string }>(
      `SELECT value FROM platform_env_settings WHERE key = 'NEXT_PUBLIC_LANDING_EMBED_API_KEY' LIMIT 1`,
    );
    setting = row?.value?.trim() || undefined;
  } catch {
    // platform_env_settings not migrated yet (first boot) — fall through.
  }
  if (setting) return { key: setting, source: "platform_setting" };

  const envKey = process.env.NEXT_PUBLIC_LANDING_EMBED_API_KEY?.trim();
  if (envKey) return { key: envKey, source: "env" };

  const legacy = await getEmbedApiKey();
  if (legacy) return { key: legacy, source: "legacy_key" };

  return { key: "", source: null };
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
