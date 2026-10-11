import { NextRequest, NextResponse } from "next/server";
import { query as dbQuery } from "@/lib/db";
import { getAuthContext } from "@/modules/auth/core/rbac";
import { getKbAccessContext } from "@/modules/auth/core/db";
import {
  createExecutionContext,
  getClaraToolRuntime,
  isAgentLoopEnabled,
  isProviderToolCallingEnabled,
} from "@/modules/ai-platform-core";

const ALLOWED_REALTIME_INTEGRATION_TOOLS = new Set([
  "integration_availability",
  "integration_action",
  // Organization MCP tools share the same Unified Tool Runtime authorization
  // path; they only execute while ENABLE_MCP is on (checked by the tool
  // itself, fail closed).
  "mcp_availability",
  "mcp_tool",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Executes a model-requested realtime integration tool through the same
 * Unified Tool Runtime used by provider chat. All identity is re-derived from
 * the authenticated request and KB relationship; body-supplied identity is
 * deliberately ignored.
 */
export async function postRealtimeTool(request: NextRequest): Promise<NextResponse> {
  if (!isAgentLoopEnabled() || !isProviderToolCallingEnabled()) {
    return NextResponse.json({ error: "Realtime integration tools are disabled." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
  }
  if (!isPlainObject(body)) {
    return NextResponse.json({ error: "A JSON object is required." }, { status: 400 });
  }

  const kbId = typeof body.kbId === "string" ? body.kbId.trim() : "";
  const toolName = typeof body.toolName === "string" ? body.toolName : "";
  const input = body.arguments;
  if (!kbId || kbId.length > 128 || !ALLOWED_REALTIME_INTEGRATION_TOOLS.has(toolName) || !isPlainObject(input)) {
    return NextResponse.json({ error: "Invalid realtime integration tool request." }, { status: 400 });
  }

  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (auth.user.isSuperAdmin) {
    return NextResponse.json({ error: "Platform administrators cannot invoke tenant integration tools." }, { status: 403 });
  }

  const [access] = await getKbAccessContext(kbId, auth.user.id);
  if (!access?.membership || !access.permissions.has("kb:read")) {
    return NextResponse.json({ error: "Knowledge base access denied." }, { status: 403 });
  }

  const agentRows = await dbQuery<{ agent_id: string }>(
    `SELECT a.id AS agent_id
       FROM agents a
       JOIN knowledge_bases kb ON kb.agent_id = a.id
      WHERE kb.id = $1 AND a.org_id = $2
      LIMIT 1`,
    [kbId, access.orgId],
  );
  const agentId = agentRows[0]?.agent_id;
  if (!agentId) return NextResponse.json({ error: "Knowledge base agent was not found." }, { status: 404 });

  const context = createExecutionContext({
    orgId: access.orgId,
    kbId,
    agentId,
    userId: auth.user.id,
    sessionId: auth.session.id,
    surface: "realtime",
  });
  const outcome = await getClaraToolRuntime().invoke(toolName, input, context);
  // The runtime returns typed success/failure envelopes. Keep this response
  // transport-neutral; the voice client passes the envelope back to the model.
  return NextResponse.json({ outcome });
}
