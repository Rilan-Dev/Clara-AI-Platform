/**
 * Phase 7-C — bounded provider tool-calling consumer pilot.
 *
 * This module is intentionally transport-neutral. It is the only bridge from
 * a normalized provider tool-call payload into Clara's Unified Tool Runtime.
 * The pilot is default-off and therefore cannot change incumbent routes unless
 * an explicitly-enabled caller opts into it.
 */

import type { PlatformExecutionContext } from "./contracts";
import { assertExecutionContext } from "./execution-context";
import type { ToolInvocationOutcome, ToolRuntime } from "./tool-registry";

export const PROVIDER_TOOL_CALLING_FLAG = "ENABLE_AI_PLATFORM_TOOL_CALLING";

export interface ProviderToolCall {
  readonly id: string;
  readonly name: string;
  /** Provider payload may arrive as a JSON string or an already-decoded object. */
  readonly arguments: string | Record<string, unknown>;
}

export type ProviderToolCallPilotResult =
  | {
      readonly enabled: false;
      readonly callId: string;
      readonly outcome: null;
      readonly error: { readonly code: "PILOT_DISABLED"; readonly message: string };
    }
  | {
      readonly enabled: true;
      readonly callId: string;
      readonly outcome: ToolInvocationOutcome;
      readonly error: null;
    }
  | {
      readonly enabled: true;
      readonly callId: string;
      readonly outcome: null;
      readonly error: {
        readonly code: "MALFORMED_TOOL_CALL" | "INVALID_CONTEXT";
        readonly message: string;
      };
    };

function parseArguments(
  value: ProviderToolCall["arguments"],
): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function isProviderToolCallingEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return ["1", "true", "yes", "on"].includes(
    (env[PROVIDER_TOOL_CALLING_FLAG] ?? "").trim().toLowerCase(),
  );
}

export async function consumeProviderToolCall(
  call: ProviderToolCall,
  context: PlatformExecutionContext,
  runtime: ToolRuntime,
  options?: { readonly enabled?: boolean },
): Promise<ProviderToolCallPilotResult> {
  const enabled = options?.enabled ?? isProviderToolCallingEnabled();

  if (!enabled) {
    return {
      enabled: false,
      callId: call.id,
      outcome: null,
      error: {
        code: "PILOT_DISABLED",
        message: "The AI Platform provider tool-calling pilot is disabled.",
      },
    };
  }

  try {
    assertExecutionContext(context);
  } catch (error) {
    return {
      enabled: true,
      callId: call.id ?? "",
      outcome: null,
      error: {
        code: "INVALID_CONTEXT",
        message: (error as Error)?.message ?? "Invalid execution context.",
      },
    };
  }

  if (!call.id || !call.name) {
    return {
      enabled: true,
      callId: call.id ?? "",
      outcome: null,
      error: {
        code: "MALFORMED_TOOL_CALL",
        message: "Provider tool calls require a non-empty id and tool name.",
      },
    };
  }

  const input = parseArguments(call.arguments);
  if (input === null) {
    return {
      enabled: true,
      callId: call.id,
      outcome: null,
      error: {
        code: "MALFORMED_TOOL_CALL",
        message: `Provider tool call "${call.id}" contained invalid JSON/object arguments.`,
      },
    };
  }

  // The runtime is the sole execution boundary. No provider payload is
  // allowed to call Clara tools directly or bypass provenance/authorization.
  const outcome = await runtime.invoke(call.name, input, context);
  return { enabled: true, callId: call.id, outcome, error: null };
}
