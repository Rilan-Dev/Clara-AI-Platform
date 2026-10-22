import type { AgentVersionConfig } from "./types";

/**
 * A disabled widget cannot be reconfigured indirectly through a shared agent
 * draft endpoint. Compare effective values, not nullable legacy snapshots:
 * null runtime inherits the historical enabled=true preference.
 *
 * This does not affect the deployment-level feature gate, which remains OFF.
 */
export function changesPublicEmbedPreference(
  current: AgentVersionConfig,
  incoming: AgentVersionConfig,
): boolean {
  return (current.runtime?.enablePublicEmbed ?? true) !==
    (incoming.runtime?.enablePublicEmbed ?? true);
}
