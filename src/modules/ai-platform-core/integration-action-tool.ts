import { z } from "zod";
import { isPlatformFeatureEnabled } from "@/lib/feature-availability";
import { runAction } from "@/modules/integrations/runtime/runner-core";
import { assertIntegrationCapability } from "./integrations/integration-policy";
import { ToolExecutionError } from "./tool-contracts";
import type { PlatformExecutionContext } from "./contracts";
import type { ToolDefinition } from "./tool-contracts";

const inputSchema = z.object({
  integrationId: z.string().min(1),
  actionName: z.string().min(1),
  props: z.record(z.string(), z.unknown()).default({}),
}).strip();

export function buildIntegrationActionTool(): ToolDefinition {
  return {
    name: "integration_action",
    description: "Execute an action on an organisation integration that this agent is explicitly allowed to use. Use integration_availability first when you need to discover available actions.",
    inputSchema: inputSchema,
    authorization: {
      allowedSurfaces: ["chat", "realtime", "embed"],
      requiredPermission: null,
      requiredCapability: null,
      requireUserId: true,
      requireSessionId: false,
    },
    async execute(raw, context: PlatformExecutionContext) {
      if (!isPlatformFeatureEnabled("integrations")) {
        throw new ToolExecutionError("UNKNOWN_TOOL", "Integrations are not enabled in this environment.");
      }
      const input = raw as { integrationId:string; actionName:string; props:Record<string,unknown> };
      await assertIntegrationCapability(context, input.integrationId);

      const result = await runAction({
        workspaceId: context.tenantId,
        agentId: context.agentId,
        userId: context.userId!,
        integrationId: input.integrationId,
        actionName: input.actionName,
        props: input.props,
      });
      if (!result.success) {
        throw new ToolExecutionError(
          "EXECUTION_FAILED",
          result.error ?? `Integration action failed: ${input.actionName}`,
          {
            integrationId: input.integrationId,
            actionName: input.actionName,
            ...(result.errorCode ? { runnerErrorCode: result.errorCode } : {}),
            ...(result.retryable !== undefined ? { retryable: result.retryable } : {}),
          },
        );
      }
      return result.output;
    },
  };
}
