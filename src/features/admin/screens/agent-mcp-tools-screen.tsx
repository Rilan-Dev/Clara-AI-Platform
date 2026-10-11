"use client";
/**
 * Agent editor → MCP tools.
 *
 * Lists the organisation's approved MCP tools (grouped by connection) with
 * grant/revoke switches and explicit unavailability reasons. Granting is
 * re-authorized and limited server-side; this UI only reflects real state.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Loader2, AlertCircle, Wrench, Server, Ban, CheckCircle2, ExternalLink,
} from "lucide-react";

type AgentMcpTool = {
  connectionId: string;
  connectionName: string;
  connectionStatus: string;
  toolId: string;
  toolName: string;
  title: string | null;
  description: string;
  approved: boolean;
  toolStatus: string;
  granted: boolean;
  grantRevokedAt: string | null;
};

type Response = {
  available: boolean;
  denialReason: string | null;
  entitlements?: { maxAgentAssignments: number };
  tools: AgentMcpTool[];
};

export default function AgentMcpToolsScreen() {
  const { id = "", agentId = "" } = useParams<{ id: string; agentId: string }>();
  const router = useRouter();
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`/api/orgs/${id}/agents/${agentId}/mcp-tools`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not load MCP tools");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load MCP tools");
    } finally {
      setLoading(false);
    }
  }, [id, agentId]);

  useEffect(() => {
    if (id && agentId) void load();
  }, [id, agentId, load]);

  async function toggle(tool: AgentMcpTool) {
    setBusy(tool.toolId);
    setError(null);
    try {
      const response = await fetch(`/api/orgs/${id}/agents/${agentId}/mcp-tools`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toolId: tool.toolId, enabled: !tool.granted }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not update the grant");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the grant");
    } finally {
      setBusy(null);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, { connectionName: string; connectionStatus: string; tools: AgentMcpTool[] }>();
    for (const tool of data?.tools ?? []) {
      const entry = map.get(tool.connectionId) ?? {
        connectionName: tool.connectionName,
        connectionStatus: tool.connectionStatus,
        tools: [],
      };
      entry.tools.push(tool);
      map.set(tool.connectionId, entry);
    }
    return [...map.values()];
  }, [data]);

  const grantedCount = (data?.tools ?? []).filter((t) => t.granted).length;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-muted" />
        <div className="h-40 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">MCP tools</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Grant this agent access to organisation-approved MCP tools. Every
            invocation re-checks the grant, connection health and plan entitlement.
          </p>
        </div>
        {data?.available && (
          <span className="shrink-0 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
            {grantedCount} granted
            {data.entitlements && data.entitlements.maxAgentAssignments !== -1
              ? ` · limit ${data.entitlements.maxAgentAssignments} per organisation`
              : ""}
          </span>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {!data?.available ? (
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className="rounded-2xl bg-muted p-3">
              <Ban className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold">MCP tools are not available on your plan</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {data?.denialReason === "EMERGENCY_DISABLED"
                  ? "MCP access is temporarily disabled by the platform administrator."
                  : "Organisation-approved MCP tool servers require a plan that includes MCP."}
              </p>
            </div>
            <button
              onClick={() => router.push(`/orgs/${id}/billing`)}
              className="shrink-0 rounded-xl border border-border bg-muted/40 px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              View plans
            </button>
          </div>
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <Wrench className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No approved MCP tools yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Add an MCP server and approve its tools in Organisation → Integrations;
            approved tools appear here for agent assignment.
          </p>
          <button
            onClick={() => router.push(`/orgs/${id}/integrations`)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            <Server className="h-4 w-4" /> Open integrations
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <section key={group.connectionName} className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                  <Server className="h-4 w-4 text-primary" />
                  {group.connectionName}
                </h2>
                {group.connectionStatus !== "active" && (
                  <span className="rounded-full border border-amber-600/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600">
                    Connection {group.connectionStatus} — tools cannot run
                  </span>
                )}
                <button
                  onClick={() => router.push(`/orgs/${id}/integrations`)}
                  className="ml-auto inline-flex items-center gap-1 text-xs text-primary underline"
                >
                  Manage <ExternalLink className="h-3 w-3" />
                </button>
              </div>
              <ul className="grid gap-2 md:grid-cols-2">
                {group.tools.map((tool) => {
                  const blocked = group.connectionStatus !== "active";
                  return (
                    <li
                      key={tool.toolId}
                      className={`rounded-2xl border bg-card p-4 ${blocked ? "border-dashed border-border opacity-75" : "border-border"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-semibold">
                            {tool.title ?? tool.toolName}
                          </h3>
                          <p className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">
                            {tool.toolName}
                          </p>
                          {tool.description && (
                            <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                              {tool.description}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => void toggle(tool)}
                          disabled={busy !== null}
                          role="switch"
                          aria-checked={tool.granted}
                          aria-label={`Toggle ${tool.title ?? tool.toolName}`}
                          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                            tool.granted ? "bg-primary" : "bg-muted"
                          }`}
                        >
                          {busy === tool.toolId ? (
                            <Loader2 className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 animate-spin" />
                          ) : (
                            <span
                              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                                tool.granted ? "left-[1.4rem]" : "left-0.5"
                              }`}
                            />
                          )}
                        </button>
                      </div>
                      {blocked && (
                        <p className="mt-2 flex items-center gap-1 text-[11px] text-amber-600">
                          <AlertCircle className="h-3 w-3" />
                          {group.connectionStatus === "disabled"
                            ? "Connection disabled — enable it in Integrations."
                            : "Connection error — fix it in Integrations."}
                        </p>
                      )}
                      {!blocked && tool.granted && (
                        <p className="mt-2 flex items-center gap-1 text-[11px] text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" /> Available in Chat and Voice
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
