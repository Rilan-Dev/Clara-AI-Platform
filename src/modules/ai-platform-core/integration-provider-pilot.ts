/**
 * Integrations Framework I-5 — first-provider pilot.
 *
 * The pilot is intentionally narrow and default-off. Firecrawl search is a
 * read-only provider action chosen as the first bounded integration exercise.
 * Connection lifecycle remains the existing I-2 organisation integration API;
 * execution is delegated to the I-4 Unified Tool Runtime bridge.
 */
import type { PlatformExecutionContext } from "./contracts";
import type { ToolDefinition } from "./tool-contracts";
import {
  buildIntegrationToolDefinition,
  integrationToolName,
} from "./integrations/integration-tool-bridge";
import { getIntegrationActions } from "@/modules/integrations/runtime/runner-core";
import { getClaraToolRuntime } from "./clara-tools";

export const INTEGRATION_PROVIDER_PILOT_FLAG = "ENABLE_INTEGRATION_PROVIDER_PILOT";
export const FIRST_PROVIDER_INTEGRATION_ID = "firecrawl";
export const FIRST_PROVIDER_ACTION = "search";

export function isIntegrationProviderPilotEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return ["1", "true", "yes", "on"].includes(
    (env[INTEGRATION_PROVIDER_PILOT_FLAG] ?? "").trim().toLowerCase(),
  );
}

export function isFirstProviderPilotAction(
  integrationId: string,
  actionName: string,
): boolean {
  return (
    integrationId === FIRST_PROVIDER_INTEGRATION_ID &&
    actionName === FIRST_PROVIDER_ACTION
  );
}

export async function buildFirstProviderPilotTool(
  context: PlatformExecutionContext,
): Promise<ToolDefinition | null> {
  if (!isIntegrationProviderPilotEnabled()) return null;
  if (!context.userId || !context.agentId) return null;

  const actions = await getIntegrationActions(FIRST_PROVIDER_INTEGRATION_ID);
  const action = actions.find((candidate) =>
    isFirstProviderPilotAction(FIRST_PROVIDER_INTEGRATION_ID, candidate.name),
  );
  if (!action) return null;

  return buildIntegrationToolDefinition({
    integrationId: FIRST_PROVIDER_INTEGRATION_ID,
    name: action.name,
    displayName: action.displayName,
    description: action.description || "Search the web through the connected Firecrawl integration.",
    inputSchema: action.props
      ? (buildIntegrationToolDefinition({
          integrationId: FIRST_PROVIDER_INTEGRATION_ID,
          name: action.name,
          displayName: action.displayName,
          description: action.description,
          inputSchema: undefined as never,
          allowedSurfaces: ["chat", "realtime", "embed"],
          requiresConnection: true,
        }) as never)
      : undefined as never,
    allowedSurfaces: ["chat", "realtime", "embed"],
    requiresConnection: true,
  } as never);
}

/**
 * Registers the pilot action only when the owner-controlled flag is enabled.
 * Registration itself does not expose credentials and does not create a
 * second execution path; the definition delegates to the I-4 bridge runner.
 */
export async function registerFirstProviderPilotTool(
  context: PlatformExecutionContext,
): Promise<string | null> {
  if (!isIntegrationProviderPilotEnabled()) return null;
  if (!isFirstProviderPilotAction(FIRST_PROVIDER_INTEGRATION_ID, FIRST_PROVIDER_ACTION)) return null;

  const tool = await buildFirstProviderPilotTool(context);
  if (!tool) return null;

  const runtime = getClaraToolRuntime();
  if (!runtime.hasTool(tool.name)) runtime.registerTool(tool);
  return integrationToolName(FIRST_PROVIDER_INTEGRATION_ID, FIRST_PROVIDER_ACTION);
}
