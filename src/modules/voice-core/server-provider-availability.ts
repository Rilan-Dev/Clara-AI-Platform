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
  if (!(await isElevenLabsEnabled())) return false;
  // Realtime enablement is an operator setting, not a deployment-time env gate.
  // platform_env_settings is runtime-loaded and can be changed from the
  // Platform Admin → AI Platform → ElevenLabs half-canvas without redeploying.
  const row = await queryOne<{ value: string }>(
    "SELECT value FROM platform_env_settings WHERE key = $1 LIMIT 1",
    ["ELEVENLABS_REALTIME_ENABLED"],
  );
  return (row?.value ?? "").trim().toLowerCase() === "true";
}
