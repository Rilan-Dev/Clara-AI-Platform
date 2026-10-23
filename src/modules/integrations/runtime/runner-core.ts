import { getIntegration } from "../registry/index";
import { isPlatformFeatureEnabled } from "@/lib/feature-availability";
import { credentialVault } from "./credential-vault";
import { buildActionContext } from "./context-builder";
import type { RunActionParams, RunActionResult } from "./types.js";
import { xray } from "./xray";
import { fetchCtx, createTracedFetch, redactText, redactValue, type HttpTraceEntry } from "./runner-fetch";
import { validateActionProps } from "./action-input-validation";
import { integrationError, normalizeIntegrationError } from "./error-normalization";
import { assertIntegrationExecutionAuthorized } from "./execution-authorization";
import {
  customActions,
  pieceCache,
  loadPiece,
  resolveAuth,
  ensureTokenFresh,
  logUsage,
} from "./runner-helpers";

// ─── actionName resolution (normalize model-written names) ────────────
//
// The generating AI sometimes calls `useIntegration(integrationId, actionName)`
// / `doable.integrations.run(...)` with a name derived from the chat-tool name
// (underscored, integration-prefix stripped) rather than the exact registry
// action id — e.g. it writes `text_to_speech` when the real action is
// `elevenlabs-text-to-speech`. Rejecting that at runtime forces a redeploy or a
// manual code edit, both lossy. Instead we resolve the requested name to a real
// registered action BEFORE any lookup runs — generically, for EVERY integration,
// with no hand-maintained table: fold case + separators and allow an optional
// integration-id prefix, matching against the actions the registry/customActions
// actually expose. A tiny semantic map covers pure abbreviations (`tts`, `stt`)
// that normalization alone cannot derive.

const SEMANTIC_ALIASES: Record<string, Record<string, string>> = {
  elevenlabs: {
    tts: "elevenlabs-text-to-speech",
    speak: "elevenlabs-text-to-speech",
    stt: "elevenlabs-speech-to-text",
    transcribe: "elevenlabs-speech-to-text",
  },
};

/** Fold a name to a comparison key: lowercase, strip every non-alphanumeric. */
function foldName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** All real action names known for an integration (custom actions + registry). */
type ActionShape = {
  name?: string;
  displayName?: string;
  description?: string;
  props?: Record<string, unknown>;
  run?: (context: ReturnType<typeof buildActionContext>) => Promise<unknown>;
};

function asActionShape(value: unknown): ActionShape {
  return value && typeof value === "object" ? value as ActionShape : {};
}

function asActionRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}


function failureResult(error: unknown): RunActionResult {
  const normalized = normalizeIntegrationError(error);
  return {
    success: false,
    output: null,
    error: normalized.message,
    errorCode: normalized.code,
    retryable: normalized.retryable,
  };
}

function collectSecretValues(value: unknown): string[] {
  const found = new Set<string>();
  const walk = (item: unknown): void => {
    if (typeof item === "string") {
      if (item.length >= 8) found.add(item);
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(walk);
      return;
    }
    if (item && typeof item === "object") {
      Object.values(item).forEach(walk);
    }
  };
  walk(value);
  return [...found];
}

function knownActionNames(integrationId: string): string[] {
  // The Clara registry is the authoritative action allowlist. Never derive
  // executable capability from every action currently shipped by an external
  // Activepieces package because package upgrades can add actions that Clara
  // has not reviewed or exposed.
  const custom = Object.keys(customActions[integrationId] ?? {});
  const allowed = getIntegration(integrationId)?.actions ?? [];
  return Array.from(new Set([...custom, ...allowed]));
}

/**
 * Resolve a model-written actionName to a real registered action.
 * Exact match wins; else a normalized match (case/separator-insensitive, with an
 * optional integration-id prefix); else a small semantic-alias map. Returns the
 * original name unchanged when nothing matches, so the caller's "not found"
 * error still fires with the real Available list.
 */
function resolveActionAlias(integrationId: string, actionName: string): string {
  const known = knownActionNames(integrationId);
  if (known.includes(actionName)) return actionName;

  const byFold = new Map(known.map((n) => [foldName(n), n]));
  const hit = byFold.get(foldName(actionName)) ?? byFold.get(foldName(`${integrationId}${actionName}`));
  if (hit && hit !== actionName) {
    console.warn(`[Integration] actionName-normalize ${integrationId}: '${actionName}' → '${hit}'`);
    return hit;
  }

  const sem = SEMANTIC_ALIASES[integrationId]?.[actionName.toLowerCase()];
  if (sem && known.includes(sem) && sem !== actionName) {
    console.warn(`[Integration] actionName-alias ${integrationId}: '${actionName}' → '${sem}'`);
    return sem;
  }
  return actionName;
}

// ─── Main Runner ─────────────────────────────────────────

export async function runAction(params: RunActionParams): Promise<RunActionResult> {
  if (!isPlatformFeatureEnabled("integrations")) {
    return failureResult(integrationError("ACTION_NOT_ALLOWED", "Integrations are not enabled in this environment."));
  }
  const startTime = Date.now();
  const def = getIntegration(params.integrationId);

  if (!def) {
    return failureResult(integrationError("UNKNOWN_INTEGRATION", `Unknown integration: ${params.integrationId}`));
  }

  // Rewrite hallucinated actionNames onto the canonical registry ids before
  // any lookup runs. Keeps runtime forgiving while the model's naming drifts.
  params.actionName = resolveActionAlias(params.integrationId, params.actionName);

  // Enforce the Clara registry action allowlist before loading or executing
  // any external piece action. Custom Clara-owned actions are independently
  // registered and remain valid even when absent from def.actions.
  const customAction = customActions[params.integrationId]?.[params.actionName];
  if (!customAction && !def.actions.includes(params.actionName)) {
    const available = Array.from(new Set([
      ...def.actions,
      ...Object.keys(customActions[params.integrationId] ?? {}),
    ]));
    // XRay is initialized below for the normal execution path. This early
    // capability rejection must not reference that later const before initialization.
    return failureResult(
      integrationError(
        "ACTION_NOT_ALLOWED",
        `Action '${params.actionName}' is not allowed for ${params.integrationId}. Available: ${available.length > 0 ? available.join(", ") : "unknown"}`,
      ),
    );
  }

  // Keep resolved credential values available to the final error boundary so provider
  // error text cannot bypass value-based redaction when it uses a non-sensitive
  // field name (for example, echoing a token in a generic `message` field).
  let knownSecretValues: string[] = [];
  // Preserve the per-run HTTP trace collection across both success and failure
  // paths so deterministic runner results can return the same redacted trace
  // evidence regardless of where execution fails.
  const httpTraces: HttpTraceEntry[] = [];

  const xr = xray.start({
    kind: "integration",
    integrationId: params.integrationId,
    actionName: params.actionName,
    projectId: params.projectId,
    userId: params.userId,
    args: params.props,
  });

  try {
    // Authorize again at the execution boundary. The AI tool performs the same
    // checks for capability discovery, but grants/plan state can change between
    // tool authorization and runner execution; the runtime must fail closed too.
    await assertIntegrationExecutionAuthorized(params);

    // 0. Check for custom (non-piece) action first
    const customAction = customActions[params.integrationId]?.[params.actionName];
    if (customAction) {
      const inputErrors = validateActionProps(customAction.props, params.props, true);
      if (inputErrors.length > 0) {
        xr.end("error", `Invalid action input: ${inputErrors.join("; ")}`);
        return failureResult(integrationError("INVALID_INPUT", `Invalid action input: ${inputErrors.join("; ")}`));
      }
      xr.phase("credential_lookup");
      const connection = await credentialVault.get(params.userId, params.integrationId, params.workspaceId, params.agentId);
      const auth = connection ? resolveAuth(def.authType, connection.credentials) : undefined;
      knownSecretValues = collectSecretValues(auth);

      console.log(`[Integration] RUN custom ${params.integrationId}/${params.actionName}`);
      xr.phase("action_run");
      const output = await fetchCtx.run(
        { tracedFetch: createTracedFetch(httpTraces, params.projectId, xr, undefined, collectSecretValues(auth)), xrayHandle: xr, supabaseApiKey: null },
        () => customAction.run(params, auth),
      );
      const safeOutput = redactValue(output, collectSecretValues(auth));

      const durationMs = Date.now() - startTime;
      xr.end("success");
      logUsage({ orgId: params.workspaceId, agentId: params.agentId, userId: params.userId, integrationId: params.integrationId, actionName: params.actionName, success: true, durationMs });

      return { success: true, output: safeOutput, httpTraces: httpTraces.length > 0 ? httpTraces : undefined };
    }

    // 1. Load the piece
    xr.phase("piece_load");
    const piece = await loadPiece(params.integrationId);

    // 2. Get the action
    xr.phase("action_lookup");
    const resolvedActions = typeof piece.actions === "function" ? piece.actions() : piece.actions;
    const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
    const sanitizedActionName = sanitize(params.actionName);
    const findAction = (name: string, acts: unknown): unknown => {
      if (Array.isArray(acts)) {
        return acts.find((a: unknown) => {
          const candidate = asActionShape(a);
          return candidate.name === name || (typeof candidate.name === "string" && sanitize(candidate.name) === sanitize(name));
        });
      }
      if (!acts || typeof acts !== "object") return undefined;
      const record = acts as Record<string, unknown>;
      return record[name] ?? Object.values(record).find((a: unknown) => {
        const candidate = asActionShape(a);
        return typeof candidate.name === "string" && sanitize(candidate.name) === sanitize(name);
      });
    };
    const actionCandidate = typeof piece.getAction === "function"
      ? (piece.getAction(params.actionName) ?? piece.getAction(def.actions?.find((n: string) => sanitize(n) === sanitizedActionName) ?? params.actionName))
      : findAction(params.actionName, resolvedActions);

    if (!actionCandidate) {
      xr.end("error", `Action '${params.actionName}' not found`);
      // Include custom (Doable-owned) actions in the "Available" list too —
      // otherwise the error message hides Doable-custom actions like
      // `elevenlabs-speech-to-text` that are ONLY in customActions.
      const pieceNames = Array.isArray(resolvedActions)
        ? resolvedActions.map((a: unknown) => asActionShape(a).name).filter((name): name is string => Boolean(name))
        : resolvedActions && typeof resolvedActions === "object"
          ? Object.keys(resolvedActions)
          : [];
      const customNames = Object.keys(customActions[params.integrationId] ?? {});
      const available = Array.from(new Set([...pieceNames, ...customNames]));
      return failureResult(
        integrationError(
          "ACTION_NOT_ALLOWED",
          `Action '${params.actionName}' not found in ${params.integrationId}. Available: ${
            available.length > 0 ? available.join(", ") : "unknown"
          }`,
        ),
      );
    }

    const action = asActionShape(actionCandidate) as ActionShape & { run: (context: ReturnType<typeof buildActionContext>) => Promise<unknown> };

    const inputErrors = validateActionProps(action.props, params.props, true);
    if (inputErrors.length > 0) {
      xr.end("error", `Invalid action input: ${inputErrors.join("; ")}`);
      return failureResult(integrationError("INVALID_INPUT", `Invalid action input: ${inputErrors.join("; ")}`));
    }

    // 3. Load credentials
    xr.phase("credential_lookup");
    const connection = await credentialVault.get(params.userId, params.integrationId, params.workspaceId, params.agentId);

    let auth: unknown = undefined;
    if (def.authType !== "none") {
      if (!connection) {
        xr.end("error", "Not connected");
        return failureResult(integrationError("NOT_CONNECTED", "Not connected"));
      }

      xr.phase("token_refresh_check");
      // The registry definition is authoritative for auth behavior. Never
      // let a caller-controlled/stored connection auth_type suppress OAuth
      // refresh or otherwise change the credential interpretation.
      await ensureTokenFresh(connection.id, params.workspaceId, def.authType, def.oauth2Config?.tokenUrl, params.userId, params.agentId);

      xr.phase("credential_refetch");
      const freshConnection = await credentialVault.get(params.userId, params.integrationId, params.workspaceId, params.agentId);
      if (!freshConnection) {
        throw new Error(`Integration connection ${params.integrationId} is no longer active`);
      }
      auth = resolveAuth(def.authType, freshConnection.credentials);
      knownSecretValues = collectSecretValues(auth);
    }

    // 4. Build ActionContext
    xr.phase("context_build");
    const context = buildActionContext({ auth, props: params.props, userId: params.userId, workspaceId: params.workspaceId, agentId: params.agentId, projectId: params.projectId });

    // 5. Execute the action with per-call isolated HTTP tracing
    console.log(`[Integration] RUN ${params.integrationId}/${params.actionName}`);

    const supabaseApiKey = (params.integrationId === "supabase" && auth && typeof auth === "object" && "apiKey" in auth)
      ? (auth as Record<string, unknown>).apiKey as string
      : null;

    xr.phase("action_run");
    const output = await fetchCtx.run(
      { tracedFetch: createTracedFetch(httpTraces, params.projectId, xr, undefined, collectSecretValues(auth)), xrayHandle: xr, supabaseApiKey },
      () => action.run(context),
    );
    const safeOutput = redactValue(output, collectSecretValues(auth));

    const durationMs = Date.now() - startTime;

    xr.end("success");
    logUsage({ orgId: params.workspaceId, agentId: params.agentId, userId: params.userId, integrationId: params.integrationId, actionName: params.actionName, success: true, durationMs });

    console.log(`[Integration] DONE ${params.integrationId}/${params.actionName} ${durationMs}ms httpCalls=${httpTraces.length}`);

    return { success: true, output: safeOutput, httpTraces: httpTraces.length > 0 ? httpTraces : undefined };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const normalized = normalizeIntegrationError(err);
    const errorMsg = redactText(redactValue(normalized.message, knownSecretValues) as string) ?? "Integration action failed";
    console.error(`[Integration] FAILED ${params.integrationId}/${params.actionName} ${durationMs}ms code=${normalized.code} retryable=${normalized.retryable}: ${errorMsg}`);
    xr.end("error", errorMsg);

    logUsage({ orgId: params.workspaceId, agentId: params.agentId, userId: params.userId, integrationId: params.integrationId, actionName: params.actionName, success: false, durationMs, errorMessage: errorMsg });

    return {
      success: false,
      output: null,
      error: errorMsg,
      errorCode: normalized.code,
      retryable: normalized.retryable,
      httpTraces: httpTraces.length > 0 ? httpTraces : undefined,
    };
  }
}

/**
 * Get available actions for an integration.
 */
export async function getIntegrationActions(integrationId: string): Promise<Array<{
  name: string;
  displayName: string;
  description: string;
  props: Record<string, unknown>;
}>> {
  if (!isPlatformFeatureEnabled("integrations")) return [];
  // A caller-controlled unknown integration must never cause package loading,
  // metadata execution or external work before Clara's curated registry has
  // established that the integration exists.
  const def = getIntegration(integrationId);
  if (!def) return [];
  const piece = await loadPiece(integrationId);

  const actions: Array<{ name: string; displayName: string; description: string; props: Record<string, unknown> }> = [];

  const pieceActions: Record<string, unknown> = typeof piece.actions === "function"
    ? asActionRecord(piece.actions())
    : Array.isArray(piece.actions)
      ? Object.fromEntries(piece.actions.map((a: unknown) => { const candidate = asActionShape(a); return [candidate.name ?? "", a]; }))
      : asActionRecord(piece.actions);

  let matchedAny = false;
  for (const actionName of def.actions) {
    const actionCandidate = typeof piece.getAction === "function"
      ? piece.getAction(actionName)
      : pieceActions[actionName];

    if (!actionCandidate) continue;
    const action = asActionShape(actionCandidate);
    matchedAny = true;

    if (def.actionOverrides?.[actionName]?.hidden) continue;

    actions.push({
      name: actionName,
      displayName: action.displayName ?? actionName.replace(/_/g, " "),
      description: def.actionOverrides?.[actionName]?.description ?? action.description ?? "",
      props: action.props ?? {},
    });
  }

  // The Clara registry is the authoritative capability surface. Never fall
  // back to enumerating every action shipped by an external Activepieces
  // package: an upstream package update must not silently advertise actions
  // that the registry has not reviewed or approved. Missing package actions
  // remain absent rather than expanding the public capability surface.

  // Append custom actions
  const customs = customActions[integrationId];
  if (customs) {
    for (const [actionName, ca] of Object.entries(customs)) {
      if (!actions.some((a) => a.name === actionName)) {
        actions.push({
          name: actionName,
          displayName: ca.displayName,
          description: ca.description,
          props: ca.props,
        });
      }
    }
  }

  return actions;
}

/** Clear the piece cache (useful for testing or hot reload) */
export function clearPieceCache(): void {
  pieceCache.clear();
}
