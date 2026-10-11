"use client";
/**
 * Organisation → Integrations → MCP connection detail.
 *
 * Tabs: Overview · Tools · Agent access · Activity · Settings.
 * Every action calls a real backend route; entitlement denials, loading,
 * empty and error states are explicit.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, RefreshCw, Loader2, AlertCircle, Server, Wrench, Users,
  History, Settings2, FlaskConical, Power, Trash2, CheckCircle2,
  KeyRound, Ban, ExternalLink, ChevronDown,
} from "lucide-react";

type ToolRow = {
  id: string;
  toolName: string;
  title: string | null;
  description: string;
  approved: boolean;
  status: "discovered" | "approved" | "revoked" | "stale";
  approvedAt: string | null;
  agentGrantCount: number;
  lastSeenAt: string | null;
};

type Connection = {
  id: string;
  name: string;
  description: string;
  endpointUrl: string;
  status: "active" | "disabled" | "error" | "expired" | "testing";
  lastError: string | null;
  lastCheckedAt: string | null;
  serverName: string | null;
  serverVersion: string | null;
  protocolVersion: string | null;
  toolCount: number;
  approvedToolCount: number;
  agentGrantCount: number;
  tools: ToolRow[];
  usage: { callsLast24h: number; callsThisPeriod: number; failedCallsThisPeriod: number };
};

type AgentAccess = {
  agents: Array<{
    id: string;
    name: string;
    status: string;
    grantedCount: number;
    tools: Array<{ toolId: string; toolName: string; granted: boolean }>;
  }>;
  toolCount: number;
};

type AuditEntry = {
  id: string;
  action: string;
  entity_type: string;
  details: Record<string, unknown>;
  created_at: string;
  actor: { name: string | null; email: string | null };
};

const TABS = [
  { id: "overview", label: "Overview", icon: Server },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "agents", label: "Agent access", icon: Users },
  { id: "activity", label: "Activity", icon: History },
  { id: "settings", label: "Settings", icon: Settings2 },
] as const;
type TabId = (typeof TABS)[number]["id"];

const AUTH_METHODS = [
  { value: "none", label: "None" },
  { value: "bearer_token", label: "Bearer token" },
  { value: "basic_auth", label: "Basic auth" },
  { value: "api_key_header", label: "API key header" },
] as const;

const CREDENTIAL_FIELDS: Record<string, Array<{ name: string; label: string; secret: boolean }>> = {
  bearer_token: [{ name: "token", label: "Bearer token", secret: true }],
  basic_auth: [
    { name: "username", label: "Username", secret: false },
    { name: "password", label: "Password", secret: true },
  ],
  api_key_header: [
    { name: "headerName", label: "Header name", secret: false },
    { name: "headerValue", label: "Header value", secret: true },
  ],
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function statusBadge(status: Connection["status"]) {
  const map: Record<string, string> = {
    active: "border-emerald-600/20 bg-emerald-500/10 text-emerald-600",
    disabled: "border-border bg-muted text-muted-foreground",
    error: "border-red-600/20 bg-red-500/10 text-red-600",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${map[status] ?? "border-amber-600/20 bg-amber-500/10 text-amber-600"}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function endpointHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export default function OrgMcpConnectionDetailScreen() {
  const { id = "", connectionId = "" } = useParams<{ id: string; connectionId: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("overview");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentAccess | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editEndpoint, setEditEndpoint] = useState("");
  const [rotating, setRotating] = useState(false);
  const [rotateAuth, setRotateAuth] = useState("bearer_token");
  const [rotateCreds, setRotateCreds] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`/api/orgs/${id}/mcp/connections/${connectionId}`, { cache: "no-store" });
      const data = await response.json();
      if (response.status === 404) {
        setNotFound(true);
        return;
      }
      if (!response.ok) throw new Error(data.error ?? "Could not load connection");
      setConnection(data.connection);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load connection");
    } finally {
      setLoading(false);
    }
  }, [id, connectionId]);

  useEffect(() => {
    if (id && connectionId) void load();
  }, [id, connectionId, load]);

  const loadAgents = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/orgs/${id}/mcp/connections/${connectionId}/agents`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (response.ok) setAgents(data);
    } catch {
      // Agent list failure surfaces on next interaction.
    }
  }, [id, connectionId]);

  const loadAudit = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/orgs/${id}/mcp/connections/${connectionId}/activity`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (response.ok) setAudit(data.entries ?? []);
    } catch {
      // Audit failure surfaces as empty state.
    }
  }, [id, connectionId]);

  useEffect(() => {
    if (tab === "agents" && !agents) void loadAgents();
    if (tab === "activity" && !audit) void loadAudit();
  }, [tab, agents, audit, loadAgents, loadAudit]);

  async function action<T = unknown>(
    key: string,
    url: string,
    init: RequestInit,
    successNotice: string,
    reload: () => Promise<void> = load,
  ): Promise<T | null> {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(url, init);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Action failed");
      setNotice(successNotice);
      await reload();
      return data as T;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    const result = await action<{ ok: boolean; serverName: string | null; discoveredTools: number | null; error: string | null }>(
      "test",
      `/api/orgs/${id}/mcp/connections/${connectionId}/test`,
      { method: "POST" },
      "Connection tested.",
    );
    if (result && !result.ok) {
      setNotice(null);
      setError(`Test failed: ${result.error ?? "unknown error"}`);
    }
  }

  async function toggleStatus(enabled: boolean) {
    await action(
      "toggle",
      `/api/orgs/${id}/mcp/connections/${connectionId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      },
      enabled ? "Connection enabled." : "Connection disabled.",
    );
  }

  async function deleteConnection() {
    if (
      !window.confirm(
        `Delete "${connection?.name}"? Its tools and agent permissions are removed. Usage history is kept for billing.`,
      )
    ) {
      return;
    }
    setBusy("delete");
    try {
      const response = await fetch(`/api/orgs/${id}/mcp/connections/${connectionId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not delete");
      router.push(`/orgs/${id}/integrations`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
      setBusy(null);
    }
  }

  async function rediscover() {
    await action<{ added: number; removed: number }>(
      "rediscover",
      `/api/orgs/${id}/mcp/connections/${connectionId}/tools`,
      { method: "POST" },
      "Tool discovery refreshed.",
    );
  }

  async function setToolApproval(tool: ToolRow, approved: boolean) {
    await action(
      `tool:${tool.id}`,
      `/api/orgs/${id}/mcp/connections/${connectionId}/tools`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toolName: tool.toolName, approved }),
      },
      approved ? `"${tool.title ?? tool.toolName}" approved.` : `"${tool.title ?? tool.toolName}" revoked.`,
    );
  }

  async function setAgentGrant(agentId: string, toolId: string, toolName: string, enabled: boolean) {
    await action(
      `grant:${agentId}:${toolId}`,
      `/api/orgs/${id}/mcp/connections/${connectionId}/agents`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId, toolId, enabled }),
      },
      enabled ? `"${toolName}" granted.` : `"${toolName}" revoked.`,
      async () => {
        await loadAgents();
        await load();
      },
    );
  }

  async function saveEdit() {
    const ok = await action(
      "saveEdit",
      `/api/orgs/${id}/mcp/connections/${connectionId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: editName,
          description: editDescription,
          endpointUrl: editEndpoint,
        }),
      },
      "Connection updated.",
    );
    if (ok) setEditing(false);
  }

  async function rotateCredentials() {
    const fields = CREDENTIAL_FIELDS[rotateAuth] ?? [];
    const missing = fields.filter((f) => !rotateCreds[f.name]?.trim());
    if (missing.length) {
      setError(`Complete the required fields: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }
    const ok = await action(
      "rotate",
      `/api/orgs/${id}/mcp/connections/${connectionId}/credentials`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ authType: rotateAuth, credentials: rotateCreds }),
      },
      "Credentials rotated and verified with a live handshake.",
    );
    if (ok) {
      setRotating(false);
      setRotateCreds({});
    }
  }

  const sortedTools = useMemo(() => {
    if (!connection) return [];
    return [...connection.tools].sort((a, b) => {
      if (a.approved !== b.approved) return a.approved ? -1 : 1;
      return a.toolName.localeCompare(b.toolName);
    });
  }, [connection]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <Ban className="mx-auto h-8 w-8 text-muted-foreground" />
        <h1 className="mt-3 text-lg font-semibold">Connection not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This MCP connection does not exist or belongs to another organisation.
        </p>
        <button
          onClick={() => router.push(`/orgs/${id}/integrations`)}
          className="mt-4 rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Back to integrations
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <button
            onClick={() => router.push(`/orgs/${id}/integrations`)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border hover:bg-muted"
            aria-label="Back to integrations"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold">{connection?.name}</h1>
              {connection && statusBadge(connection.status)}
            </div>
            <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted-foreground">
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              {endpointHost(connection?.endpointUrl ?? "")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void testConnection()}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            Test
          </button>
          <button
            onClick={() => void toggleStatus(connection?.status !== "disabled")}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {busy === "toggle" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
            {connection?.status === "disabled" ? "Enable" : "Disable"}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">{error}</div>
      )}
      {notice && (
        <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">{notice}</div>
      )}

      {/* Tabs */}
      <div className="overflow-x-auto border-b border-border" role="tablist" aria-label="Connection sections">
        <nav className="flex min-w-max gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Overview tab */}
      {tab === "overview" && connection && (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="space-y-4 lg:col-span-2">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-muted-foreground">Server</h2>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Server name</dt>
                  <dd className="mt-0.5 text-sm font-medium">{connection.serverName ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Server version</dt>
                  <dd className="mt-0.5 text-sm font-medium">{connection.serverVersion ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Protocol</dt>
                  <dd className="mt-0.5 text-sm font-medium">{connection.protocolVersion ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Transport</dt>
                  <dd className="mt-0.5 text-sm font-medium">Streamable HTTP</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Endpoint</dt>
                  <dd className="mt-0.5 break-all font-mono text-xs">{connection.endpointUrl}</dd>
                </div>
              </dl>
              {connection.description && (
                <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
                  {connection.description}
                </p>
              )}
            </div>

            {connection.status === "error" && connection.lastError && (
              <div role="alert" className="rounded-2xl border border-red-600/20 bg-red-500/5 p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-red-600">
                  <AlertCircle className="h-4 w-4" /> Last test failed
                </p>
                <p className="mt-1 text-sm text-red-600/90">{connection.lastError}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Checked {formatDateTime(connection.lastCheckedAt)} — rotate credentials in Settings if the failure is authentication-related.
                </p>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-muted-foreground">Health</h2>
              <p className="mt-3 flex items-center gap-2 text-sm">
                <CheckCircle2 className={`h-4 w-4 ${connection.lastCheckedAt ? "text-emerald-600" : "text-muted-foreground"}`} />
                Last checked {formatDateTime(connection.lastCheckedAt)}
              </p>
              <button
                onClick={() => void testConnection()}
                disabled={busy !== null}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Test now
              </button>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-muted-foreground">Usage</h2>
              <dl className="mt-3 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Calls (24h)</dt>
                  <dd className="font-semibold tabular-nums">{connection.usage.callsLast24h}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Calls (period)</dt>
                  <dd className="font-semibold tabular-nums">{connection.usage.callsThisPeriod}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Failed (period)</dt>
                  <dd className="font-semibold tabular-nums">{connection.usage.failedCallsThisPeriod}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Agent grants</dt>
                  <dd className="font-semibold tabular-nums">{connection.agentGrantCount}</dd>
                </div>
              </dl>
            </div>
          </section>
        </div>
      )}

      {/* Tools tab */}
      {tab === "tools" && connection && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {connection.approvedToolCount} approved of {connection.toolCount} discovered tools.
              Only approved tools can be granted to agents.
            </p>
            <button
              onClick={() => void rediscover()}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {busy === "rediscover" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Rediscover tools
            </button>
          </div>

          {sortedTools.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <Wrench className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">No tools discovered yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Run discovery to list the tools this server exposes.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {sortedTools.map((tool) => (
                <li
                  key={tool.id}
                  className={`rounded-2xl border bg-card p-4 ${
                    tool.status === "stale" ? "border-dashed border-border opacity-70" : "border-border"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">{tool.title ?? tool.toolName}</h3>
                        {tool.status === "stale" && (
                          <span className="rounded-full border border-amber-600/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600">
                            Stale — no longer offered
                          </span>
                        )}
                        {tool.approved && tool.status === "approved" && (
                          <span className="rounded-full border border-emerald-600/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                            Approved
                          </span>
                        )}
                        {tool.agentGrantCount > 0 && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {tool.agentGrantCount} agent{tool.agentGrantCount === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">{tool.toolName}</p>
                      {tool.description && (
                        <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{tool.description}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {tool.status !== "stale" && (
                        <button
                          onClick={() => void setToolApproval(tool, !tool.approved)}
                          disabled={busy !== null}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                            tool.approved
                              ? "border border-border hover:bg-muted"
                              : "bg-primary text-primary-foreground hover:bg-primary/90"
                          }`}
                        >
                          {busy === `tool:${tool.id}` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          {tool.approved ? "Revoke approval" : "Approve"}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Agent access tab */}
      {tab === "agents" && (
        <section className="space-y-4">
          {!agents ? (
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-6 text-sm">
              <Loader2 className="h-5 w-5 animate-spin text-primary" /> Loading agents…
            </div>
          ) : agents.agents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <Users className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">No agents yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create an agent first, then grant it approved tools here.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Grant or revoke approved tools per agent. Grants take effect on the
                next Chat or Voice session and are re-checked at every invocation.
              </p>
              <ul className="space-y-2">
                {agents.agents.map((agent) => (
                  <li key={agent.id} className="rounded-2xl border border-border bg-card">
                    <button
                      onClick={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
                      aria-expanded={expandedAgent === agent.id}
                      className="flex w-full items-center justify-between gap-3 p-4 text-left"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-semibold">{agent.name}</span>
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {agent.grantedCount}/{agents.toolCount} tools
                        </span>
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 transition-transform ${expandedAgent === agent.id ? "rotate-180" : ""}`}
                      />
                    </button>
                    {expandedAgent === agent.id && (
                      <div className="border-t border-border p-4">
                        {agents.toolCount === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No approved tools on this connection yet. Approve tools in the Tools tab first.
                          </p>
                        ) : (
                          <ul className="space-y-1.5">
                            {agent.tools.map((tool) => (
                              <li
                                key={tool.toolId}
                                className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"
                              >
                                <span className="min-w-0 truncate font-mono text-xs">{tool.toolName}</span>
                                <button
                                  onClick={() => void setAgentGrant(agent.id, tool.toolId, tool.toolName, !tool.granted)}
                                  disabled={busy !== null}
                                  role="switch"
                                  aria-checked={tool.granted}
                                  aria-label={`Toggle ${tool.toolName} for ${agent.name}`}
                                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                                    tool.granted ? "bg-primary" : "bg-muted"
                                  }`}
                                >
                                  <span
                                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                                      tool.granted ? "left-[1.4rem]" : "left-0.5"
                                    }`}
                                  />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* Activity tab */}
      {tab === "activity" && (
        <section className="space-y-4">
          {!audit ? (
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-6 text-sm">
              <Loader2 className="h-5 w-5 animate-spin text-primary" /> Loading activity…
            </div>
          ) : audit.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <History className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">No activity recorded yet</p>
            </div>
          ) : (
            <ol className="space-y-2">
              {audit.map((entry) => (
                <li key={entry.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-[11px]">{entry.action}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(entry.created_at)}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {entry.actor.name ?? entry.actor.email ?? "System"}
                    {Object.keys(entry.details).length > 0 && (
                      <span className="ml-2 font-mono text-[10px] opacity-70">
                        {JSON.stringify(entry.details)}
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {/* Settings tab */}
      {tab === "settings" && connection && (
        <section className="space-y-4">
          {editing ? (
            <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
              <h2 className="text-base font-semibold">Edit connection</h2>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Name</span>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={120}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/25"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Description</span>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  maxLength={500}
                  rows={2}
                  className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/25"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Endpoint URL</span>
                <input
                  value={editEndpoint}
                  onChange={(e) => setEditEndpoint(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-xs outline-none focus:ring-2 focus:ring-primary/25"
                />
                <span className="block text-xs text-muted-foreground">
                  Changes are re-validated against the platform security policy.
                </span>
              </label>
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditing(false)} className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
                  Cancel
                </button>
                <button
                  onClick={() => void saveEdit()}
                  disabled={busy !== null}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {busy === "saveEdit" ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">Connection details</h2>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{connection.description || "No description"}</p>
                </div>
                <button
                  onClick={() => {
                    setEditName(connection.name);
                    setEditDescription(connection.description);
                    setEditEndpoint(connection.endpointUrl);
                    setEditing(true);
                  }}
                  className="shrink-0 rounded-xl border border-border px-3.5 py-2 text-sm font-medium hover:bg-muted"
                >
                  Edit
                </button>
              </div>
            </div>
          )}

          {/* Credential rotation */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <KeyRound className="h-4 w-4" /> Credentials
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Stored encrypted. Rotate to replace them — new values are verified
                  with a live handshake before saving.
                </p>
              </div>
              <button
                onClick={() => setRotating(!rotating)}
                className="shrink-0 rounded-xl border border-border px-3.5 py-2 text-sm font-medium hover:bg-muted"
              >
                {rotating ? "Cancel" : "Rotate"}
              </button>
            </div>
            {rotating && (
              <div className="mt-4 space-y-4 border-t border-border pt-4">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">Authentication method</span>
                  <select
                    value={rotateAuth}
                    onChange={(e) => {
                      setRotateAuth(e.target.value);
                      setRotateCreds({});
                    }}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/25 sm:w-64"
                  >
                    {AUTH_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  {(CREDENTIAL_FIELDS[rotateAuth] ?? []).map((field) => (
                    <label key={field.name} className="block space-y-1.5">
                      <span className="text-sm font-medium">{field.label}</span>
                      <input
                        type={field.secret ? "password" : "text"}
                        autoComplete={field.secret ? "new-password" : "off"}
                        value={rotateCreds[field.name] ?? ""}
                        onChange={(e) => setRotateCreds((prev) => ({ ...prev, [field.name]: e.target.value }))}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/25"
                      />
                    </label>
                  ))}
                </div>
                <button
                  onClick={() => void rotateCredentials()}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {busy === "rotate" && <Loader2 className="h-4 w-4 animate-spin" />}
                  Verify and save
                </button>
              </div>
            )}
          </div>

          {/* Danger zone */}
          <div className="rounded-2xl border border-red-600/20 bg-red-500/[0.02] p-5">
            <h2 className="text-base font-semibold text-red-600">Danger zone</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Deleting removes this connection, its tools and agent permissions.
              Usage history is preserved for billing.
            </p>
            <button
              onClick={() => void deleteConnection()}
              disabled={busy !== null}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-red-600/30 bg-red-500/5 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50"
            >
              {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete connection
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
