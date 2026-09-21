import { queryOne } from "@/lib/db";
import { getElevenLabsApiKey } from "./model-catalog";

/**
 * Server-only provider availability checks. The database registry is the
 * platform-wide enable/disable switch; credentials are configuration only.
 */
export async function isElevenLabsEnabled(): Promise<boolean> {
  const row = await queryOne<{ enabled: boolean }>(
    "SELECT enabled FROM platform_ai_providers WHERE provider_id = $1 LIMIT 1",
    ["elevenlabs"],
  );
  return Boolean(row?.enabled) && Boolean(getElevenLabsApiKey());
}

export async function isElevenLabsRealtimeEnabled(): Promise<boolean> {
  return (await isElevenLabsEnabled())
    && (process.env.ELEVENLABS_REALTIME_ENABLED ?? "false").toLowerCase() === "true";
}
