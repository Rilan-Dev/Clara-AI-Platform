"use client";
/**
 * Organisation → Integrations — MCP connections hub.
 *
 * Layout: entitlement overview (real usage vs effective limits) + MCP
 * connection cards with search / status filter / sort + add-server CTA.
 * A collapsed "Platform integrations" section keeps the existing catalog
 * connection flow reachable without exposing platform-admin state.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PlugZap, Plus, Search, RefreshCw, Server, Wrench, Users,
  Activity, ChevronDown, ChevronRight, ExternalLink, Trash2,
  Power, FlaskConical, AlertCircle, CheckCircle2, Clock, Ban, Loader2,
} from "lucide-react";
import { useParams } from "next/navigation";

type McpEntitlements = {
  enabled: boolean;
  customEndpoints: boolean;
  maxConnections: number;
  maxToolsPerConnection: number;
  maxAgentAssignments: number;
  toolCallsPerPeriod: number;
  toolCallsPerMinute: number;
  platformCatalog: boolean;
  usagePolicy: string;
};

type McpConnection = {
  id: string;
  name: string;
  description: string;
  endpointUrl: string;
  status: "active" | "disabled" | "error" | "expired" | "testing";
  lastError: string | null;
  lastCheckedAt: string | null;
  serverName: string | null;
  serverVersion: string | null;
  toolCount: number;
  approvedToolCount: number;
  agentGrantCount: number;
  updatedAt: string;
};

type Overview = {
  available: boolean;
  denialReason: string | null;
  entitlements: McpEntitlements;
  planId: string;
  planName: string;
  usage: {
    connections: number;
    activeConnections: number;
    toolsApproved: number;
    agentAssignments: number;
    toolCallsThisPeriod: number;
    toolCallsLast24h: number;
    failedCallsThisPeriod: number;
  };
  connections: McpConnection[];
};

type CredentialField = {
  name: string;
  displayName: string;
  description?: string;
  type: "text" | "secret" | "dropdown";
  required: boolean;
  options?: Array<{ label: string; value: string }>;
};

type CatalogItem = {
  id: string;
  displayName: string;
  description: string;
  logoUrl: string;
  category: string;
  authType: string;
  organisationEnabled: boolean;
  connected: boolean;
  connectionStatus?: "connected" | "expired" | "error" | "revoked" | "disconnected";
  actions: string[];
  customAuthFields?: CredentialField[];
};

const STATUS_FILTERS = ["all", "active", "disabled", "error"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function formatLimit(limit: number): string {
  return limit === -1 ? "Unlimited" : String(limit);
}

function formatRelative(iso: string | null): string {
  if (!iso) return "Never checked";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function statusBadge(status: McpConnection["status"]) {
  switch (status) {
    case "active":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
        </span>
      );
    case "disabled":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" /> Disabled
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-600/20 bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-600">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Error
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-600/20 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> {status}
        </span>
      );
  }
}

function endpointHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function QuotaStat({
  icon: Icon, label, used, limit, hint,
}: {
  icon: typeof Server;
  label: string;
  used: number;
  limit: number;
  hint?: string;
}) {
  const capped = limit !== -1 && used > limit;
  const nearLimit = limit !== -1 && !capped && limit > 0 && used / limit >= 0.8;
  const pct = limit === -1 ? 0 : limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 text-xl font-semibold tabular-nums text-foreground sm:text-2xl">
        {used.toLocaleString()}
        <span className="ml-1 text-sm font-normal text-muted-foreground">
          / {formatLimit(limit)}
        </span>
      </p>
      {limit !== -1 && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${
              capped ? "bg-red-500" : nearLimit ? "bg-amber-500" : "bg-emerald-500"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {hint && <p className="mt-2 text-[11px] leading-tight text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function OrgIntegrationsScreen() {
  const { id = "" } = useParams<{ id: string }>();
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<"recent" | "name" | "tools">("recent");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<{ id: string; maxIntegrations: number } | null>(null);
  const callbackUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/integrations/oauth/callback`
      : "/api/integrations/oauth/callback";

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`/api/orgs/${id}/mcp/overview`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load integrations");
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load integrations");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) void load();
  }, [id, load]);

  // OAuth provider callbacks redirect back here with a status param — show
  // the outcome banner and clean the URL (preserves the existing flow).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get("oauth");
    if (!oauth) return;
    const integrationId = params.get("integrationId");
    if (oauth === "connected") {
      setNotice(`OAuth connection completed for ${integrationId ?? "integration"}.`);
    } else if (oauth === "cancelled") {
      setActionError("The provider authorization was cancelled.");
    } else if (oauth === "error") {
      setActionError(
        "The OAuth connection could not be completed. Check the platform OAuth configuration and try again.",
      );
    }
    params.delete("oauth");
    params.delete("integrationId");
    const suffix = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (suffix ? `?${suffix}` : ""));
    setCatalogOpen(true);
    void loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCatalog = useCallback(async () => {
    try {
      const response = await fetch(`/api/orgs/${id}/integrations`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) return;
      if (data.plan) setPlan(data.plan);
      // Org-relevant projection: hide platform-disabled / plan-excluded items
      // entirely instead of showing platform-admin state.
      const items: CatalogItem[] = (data.integrations ?? [])
        .filter(
          (i: {
            platformEnabled: boolean;
            planAllowed: boolean;
            organisationEnabled: boolean;
            connected: boolean;
          }) =>
            (i.platformEnabled && i.planAllowed) ||
            i.organisationEnabled ||
            i.connected,
        )
        .map(
          (i: {
            id: string; displayName: string; description: string; logoUrl: string;
            category: string; authType: string; organisationEnabled: boolean;
            connected: boolean; connectionStatus?: CatalogItem["connectionStatus"];
            actions: string[]; customAuthFields?: CredentialField[];
          }) => ({
            id: i.id,
            displayName: i.displayName,
            description: i.description,
            logoUrl: i.logoUrl,
            category: i.category,
            authType: i.authType,
            organisationEnabled: i.organisationEnabled,
            connected: i.connected,
            connectionStatus: i.connectionStatus,
            actions: i.actions,
            customAuthFields: i.customAuthFields,
          }),
        );
      setCatalog(items);
    } catch {
      // Catalog summary is secondary; silent failure keeps MCP hub usable.
    }
  }, [id]);

  useEffect(() => {
    if (id && catalogOpen && catalog.length === 0) void loadCatalog();
  }, [catalogOpen, id, catalog.length, loadCatalog]);

  function catalogCredentialFields(item: CatalogItem): CredentialField[] {
    if (item.customAuthFields?.length) return item.customAuthFields;
    if (item.authType === "none") return [];
    if (item.authType === "secret_text")
      return [{ name: "api_key", displayName: "API key / access token", type: "secret", required: true }];
    if (item.authType === "basic_auth")
      return [
        { name: "username", displayName: "Username", type: "text", required: true },
        { name: "password", displayName: "Password", type: "secret", required: true },
      ];
    return [
      { name: "api_key", displayName: "API key", type: "secret", required: true },
      { name: "base_url", displayName: "Base URL (optional)", type: "text", required: false },
    ];
  }

  async function catalogAccess(item: CatalogItem, enabled: boolean) {
    setBusyAction(`catalog:${item.id}`);
    setActionError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/orgs/${id}/integrations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ integrationId: item.id, action: enabled ? "enable" : "disable" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not update integration access");
      await loadCatalog();
      setNotice(
        enabled
          ? `${item.displayName} enabled for the organisation.`
          : `${item.displayName} disabled for the organisation.`,
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update integration access");
    } finally {
      setBusyAction(null);
    }
  }

  async function catalogStartOAuth(item: CatalogItem) {
    setBusyAction(`catalog:${item.id}`);
    setActionError(null);
    try {
      const response = await fetch(`/api/orgs/${id}/integrations/${item.id}/oauth/start`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || typeof data.authorizationUrl !== "string") {
        throw new Error(data.error ?? "Could not start OAuth connection");
      }
      window.location.assign(data.authorizationUrl);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not start OAuth connection");
      setBusyAction(null);
    }
  }

  async function catalogDisconnect(item: CatalogItem) {
    if (
      !window.confirm(
        `Disconnect ${item.displayName}? Agents using this connection will no longer be able to run its actions.`,
      )
    ) {
      return;
    }
    setBusyAction(`catalog:${item.id}`);
    setActionError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/orgs/${id}/integrations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ integrationId: item.id, action: "disconnect" }),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not disconnect integration");
      await loadCatalog();
      setNotice(`${item.displayName} disconnected.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not disconnect integration");
    } finally {
      setBusyAction(null);
    }
  }

  async function catalogConnect() {
    if (!selected) return;
    const fields = catalogCredentialFields(selected);
    const missing = fields.filter((f) => f.required && !values[f.name]?.trim());
    if (missing.length) {
      setActionError(`Complete the required fields: ${missing.map((f) => f.displayName).join(", ")}`);
      return;
    }
    const credentials = Object.fromEntries(
      Object.entries(values)
        .filter(([, v]) => v.trim())
        .map(([k, v]) => [k, v.trim()]),
    );
    setBusyAction(`catalog:${selected.id}`);
    setActionError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/orgs/${id}/integrations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          integrationId: selected.id,
          action: "connect",
          credentials,
          displayName: selected.displayName,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save integration credentials");
      const name = selected.displayName;
      setSelected(null);
      setValues({});
      await loadCatalog();
      setNotice(`${name} credentials saved. You can now grant it to individual agents.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not save integration credentials");
    } finally {
      setBusyAction(null);
    }
  }

  const filtered = useMemo(() => {
    const list = overview?.connections ?? [];
    const query = search.trim().toLowerCase();
    return list
      .filter((conn) => {
        if (statusFilter !== "all" && conn.status !== statusFilter) return false;
        if (!query) return true;
        return (
          conn.name.toLowerCase().includes(query) ||
          endpointHost(conn.endpointUrl).toLowerCase().includes(query) ||
          (conn.serverName ?? "").toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        if (sortBy === "name") return a.name.localeCompare(b.name);
        if (sortBy === "tools") return b.approvedToolCount - a.approvedToolCount;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [overview, search, statusFilter, sortBy]);

  async function runConnectionAction(
    connection: McpConnection,
    action: "test" | "disable" | "enable" | "delete",
  ) {
    setBusyAction(`${action}:${connection.id}`);
    setActionError(null);
    setNotice(null);
    try {
      if (action === "delete") {
        if (
          !window.confirm(
            `Delete "${connection.name}"? Its tools and agent permissions are removed. Usage history is kept for billing.`,
          )
        ) {
          return;
        }
        const response = await fetch(
          `/api/orgs/${id}/mcp/connections/${connection.id}`,
          { method: "DELETE" },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not delete connection");
        setNotice(`"${connection.name}" deleted.`);
      } else if (action === "test") {
        const response = await fetch(
          `/api/orgs/${id}/mcp/connections/${connection.id}/test`,
          { method: "POST" },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not test connection");
        if (data.ok) {
          setNotice(
            `Connection healthy — ${data.serverName ?? "server"} (${data.discoveredTools ?? "?"} tools).`,
          );
        } else {
          setActionError(`Connection test failed: ${data.error ?? "unknown error"}`);
        }
      } else {
        const response = await fetch(
          `/api/orgs/${id}/mcp/connections/${connection.id}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ enabled: action === "enable" }),
          },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not update connection");
        setNotice(`"${connection.name}" ${action === "enable" ? "enabled" : "disabled"}.`);
      }
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyAction(null);
    }
  }

  const available = overview?.available ?? false;
  const usage = overview?.usage;
  const entitlements = overview?.entitlements;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Integrations</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Connect your own MCP tool servers. Approved tools can be granted to individual
            agents for Chat and Voice.
          </p>
        </div>
        <button
          onClick={() => router.push(`/orgs/${id}/integrations/mcp/new`)}
          disabled={!available || !entitlements?.customEndpoints}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add MCP server
        </button>
      </div>

      {/* Error / notice banners */}
      {error && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{error}</span>
          <button onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-lg border border-red-600/30 px-2.5 py-1 text-xs font-medium hover:bg-red-500/10">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}
      {actionError && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">{actionError}</div>
      )}
      {notice && (
        <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">{notice}</div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : !available ? (
        /* Plan / global denial state */
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className="rounded-2xl bg-muted p-3">
              <Ban className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold">MCP servers are not available on your plan</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {overview?.denialReason === "EMERGENCY_DISABLED"
                  ? "MCP access is temporarily disabled by the platform administrator."
                  : `The ${overview?.planName ?? "current"} plan does not include custom MCP servers.`}
              </p>
            </div>
            <button
              onClick={() => router.push(`/orgs/${id}/billing`)}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              View plans
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Usage overview — real backend counters only */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <QuotaStat
              icon={Server}
              label="MCP connections"
              used={usage?.connections ?? 0}
              limit={entitlements?.maxConnections ?? 0}
              hint={`${usage?.activeConnections ?? 0} active`}
            />
            <QuotaStat
              icon={Wrench}
              label="Approved tools"
              used={usage?.toolsApproved ?? 0}
              limit={-1}
              hint={`Per connection: ${formatLimit(entitlements?.maxToolsPerConnection ?? 0)}`}
            />
            <QuotaStat
              icon={Users}
              label="Agent assignments"
              used={usage?.agentAssignments ?? 0}
              limit={entitlements?.maxAgentAssignments ?? 0}
            />
            <QuotaStat
              icon={Activity}
              label="Tool calls this period"
              used={usage?.toolCallsThisPeriod ?? 0}
              limit={entitlements?.toolCallsPerPeriod ?? 0}
              hint={
                entitlements?.usagePolicy === "meter"
                  ? "Over-quota calls are metered, not blocked"
                  : `${entitlements?.toolCallsPerMinute ?? 0} calls/min rate limit`
              }
            />
          </div>

          {/* Toolbar */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or endpoint…"
                aria-label="Search MCP connections"
                className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/25"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex overflow-hidden rounded-xl border border-border" role="group" aria-label="Filter by status">
                {STATUS_FILTERS.map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setStatusFilter(filter)}
                    className={`px-3 py-2 text-xs font-medium capitalize transition-colors ${
                      statusFilter === filter
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                aria-label="Sort connections"
                className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium outline-none focus:border-primary/50"
              >
                <option value="recent">Recently updated</option>
                <option value="name">Name A–Z</option>
                <option value="tools">Most tools</option>
              </select>
            </div>
          </div>

          {/* Connection cards */}
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center sm:p-12">
              <div className="mx-auto w-fit rounded-2xl bg-muted p-3">
                <Server className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-base font-semibold">
                {(search || statusFilter !== "all")
                  ? "No connections match your filters"
                  : "No MCP servers yet"}
              </h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {search || statusFilter !== "all"
                  ? "Try clearing the search or status filter."
                  : "Add your first MCP server to discover and approve tools for your agents."}
              </p>
              {!search && statusFilter === "all" && entitlements?.customEndpoints && (
                <button
                  onClick={() => router.push(`/orgs/${id}/integrations/mcp/new`)}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" /> Add MCP server
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((conn) => (
                <article
                  key={conn.id}
                  className="flex flex-col rounded-2xl border border-border bg-card p-5 transition-shadow hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      onClick={() => router.push(`/orgs/${id}/integrations/mcp/${conn.id}`)}
                      className="group min-w-0 flex-1 text-left"
                    >
                      <h2 className="truncate font-semibold group-hover:underline">{conn.name}</h2>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        {endpointHost(conn.endpointUrl)}
                      </p>
                    </button>
                    {statusBadge(conn.status)}
                  </div>

                  <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4 text-center">
                    <div>
                      <dt className="text-[11px] text-muted-foreground">Tools</dt>
                      <dd className="text-sm font-semibold tabular-nums">
                        {conn.approvedToolCount}
                        <span className="text-muted-foreground">/{conn.toolCount}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-muted-foreground">Agents</dt>
                      <dd className="text-sm font-semibold tabular-nums">{conn.agentGrantCount}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-muted-foreground">Checked</dt>
                      <dd className="text-sm font-medium" title={conn.lastCheckedAt ?? ""}>
                        {formatRelative(conn.lastCheckedAt)}
                      </dd>
                    </div>
                  </dl>

                  {conn.status === "error" && conn.lastError && (
                    <p role="status" className="mt-3 line-clamp-2 rounded-lg bg-red-500/5 px-2.5 py-1.5 text-[11px] text-red-600">
                      {conn.lastError}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                    <button
                      onClick={() => void runConnectionAction(conn, "test")}
                      disabled={busyAction !== null}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                    >
                      {busyAction === `test:${conn.id}` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FlaskConical className="h-3.5 w-3.5" />
                      )}
                      Test
                    </button>
                    <button
                      onClick={() => router.push(`/orgs/${id}/integrations/mcp/${conn.id}`)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Open
                    </button>
                    <button
                      onClick={() => void runConnectionAction(conn, conn.status === "disabled" ? "enable" : "disable")}
                      disabled={busyAction !== null}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                    >
                      <Power className="h-3.5 w-3.5" />
                      {conn.status === "disabled" ? "Enable" : "Disable"}
                    </button>
                    <button
                      onClick={() => void runConnectionAction(conn, "delete")}
                      disabled={busyAction !== null}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50"
                    >
                      {busyAction === `delete:${conn.id}` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {/* Platform catalog integrations — org-relevant projection only */}
      <section className="rounded-2xl border border-border bg-card">
        <button
          onClick={() => setCatalogOpen((open) => !open)}
          aria-expanded={catalogOpen}
          className="flex w-full items-center justify-between gap-3 p-4 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <PlugZap className="h-4 w-4 text-primary" />
            Platform integrations
            {catalog.length > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {catalog.length} available
              </span>
            )}
          </span>
          {catalogOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {catalogOpen && (
          <div className="border-t border-border p-4">
            {plan && (
              <p className="mb-3 text-xs text-muted-foreground">
                {plan.id} plan · up to{" "}
                {plan.maxIntegrations === -1 ? "unlimited" : plan.maxIntegrations} enabled
                integrations
              </p>
            )}
            {catalog.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No integrations are available for your plan. Grant integrations to
                individual agents from each agent&apos;s Integrations screen.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {catalog.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-border bg-background p-4">
                    <div className="flex gap-3">
                      {item.logoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.logoUrl} className="h-10 w-10 shrink-0 object-contain" alt="" />
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold">{item.displayName}</h3>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.category} · {item.actions.length} actions
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        disabled={busyAction !== null}
                        onClick={() => void catalogAccess(item, !item.organisationEnabled)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                          item.organisationEnabled
                            ? "border border-border hover:bg-muted"
                            : "bg-primary text-primary-foreground hover:bg-primary/90"
                        }`}
                      >
                        {busyAction === `catalog:${item.id}` ? "Saving…" : item.organisationEnabled ? "Disable" : "Enable"}
                      </button>
                      {item.organisationEnabled && item.authType !== "none" && (
                        <button
                          disabled={busyAction !== null}
                          onClick={() =>
                            item.authType === "oauth2"
                              ? void catalogStartOAuth(item)
                              : (() => {
                                  setSelected(item);
                                  setValues({});
                                })()
                          }
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                        >
                          {busyAction === `catalog:${item.id}`
                            ? "Connecting…"
                            : item.authType === "oauth2"
                              ? item.connectionStatus === "expired"
                                ? "Reconnect expired account"
                                : item.connected
                                  ? "Reconnect account"
                                  : "Connect account"
                              : item.connected
                                ? "Update credentials"
                                : "Configure / connect"}
                        </button>
                      )}
                      {item.connected && (
                        <button
                          disabled={busyAction !== null}
                          onClick={() => void catalogDisconnect(item)}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50"
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                    {item.connected && (
                      <p className="mt-2 flex items-center gap-1 text-[11px] text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" /> Connected
                      </p>
                    )}
                    {!item.connected && item.connectionStatus === "expired" && (
                      <p role="status" className="mt-2 text-[11px] text-amber-600">
                        Connection expired. Reconnect to restore agent access.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Credential connect dialog — responsive contract: bounded height,
          scrollable, overflow-safe wrapping for long values. */}
      {selected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="integration-connection-title"
            className="my-auto max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl [overflow-wrap:anywhere] sm:p-6"
          >
            <div className="flex min-w-0 items-start gap-3">
              <div className="shrink-0 rounded-xl bg-primary/10 p-2">
                <PlugZap className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 id="integration-connection-title" className="text-lg font-semibold">
                  Configure {selected.displayName}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enter the credential values required by the provider. Secrets are
                  encrypted server-side and are not shown again after saving.
                </p>
              </div>
            </div>
            {selected.authType === "oauth2" && (
              <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-sm">
                <p className="font-medium">OAuth setup reference</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Register the callback URL with the provider if its OAuth app requires
                  one. This form saves credentials for a connection; it does not start
                  an interactive OAuth consent flow.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-words [overflow-wrap:anywhere] text-xs">{callbackUrl}</code>
                  <button
                    type="button"
                    className="rounded-md border border-border p-1.5"
                    aria-label="Copy callback URL"
                    onClick={() => void navigator.clipboard?.writeText(callbackUrl)}
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {catalogCredentialFields(selected).map((field) => (
                <label key={field.name} className="block space-y-1.5">
                  <span className="text-sm font-medium">
                    {field.displayName}
                    {field.required && <span className="text-red-500"> *</span>}
                  </span>
                  {field.type === "dropdown" ? (
                    <select
                      value={values[field.name] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                      required={field.required}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                    >
                      <option value="">Select…</option>
                      {field.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type === "secret" ? "password" : "text"}
                      autoComplete={field.type === "secret" ? "new-password" : "off"}
                      value={values[field.name] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                      required={field.required}
                      placeholder={field.type === "secret" ? "Enter value securely" : field.name}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  )}
                  {field.description && (
                    <span className="block text-xs text-muted-foreground">{field.description}</span>
                  )}
                </label>
              ))}
            </div>
            {catalogCredentialFields(selected).length === 0 && (
              <p className="mt-4 text-sm text-muted-foreground">
                This integration does not require credentials.
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => {
                  setSelected(null);
                  setValues({});
                  setActionError(null);
                }}
                className="rounded-lg border border-border px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => void catalogConnect()}
                disabled={
                  busyAction !== null ||
                  catalogCredentialFields(selected).some((f) => f.required && !values[f.name]?.trim())
                }
                className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
              >
                {busyAction === `catalog:${selected.id}` ? "Saving…" : "Save encrypted credentials"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}