"use client";
/**
 * Platform admin — per-organisation MCP entitlement panel (billing drawer tab).
 *
 * Shows the subscription's plan, effective MCP entitlements (with sources:
 * plan default vs override), real usage, and applies/removes organization
 * overrides (limit-only, reason + optional expiry, audited server-side).
 */
import { useCallback, useEffect, useState } from "react";
import { Cable, Loader2, RefreshCw, Trash2, ShieldCheck, Ban } from "lucide-react";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";
import { usePlatformFeatures } from "@/features/admin/use-platform-features";

type Entitlements = {
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

type Payload = {
  planId: string;
  planName: string;
  subscriptionStatus: string;
  available: boolean;
  denialReason: string | null;
  entitlements: Entitlements;
  sources: Record<string, string>;
  periodStart: string;
  usage: {
    connections: number;
    toolsApproved: number;
    agentAssignments: number;
    toolCallsThisPeriod: number;
  };
  override: {
    entitlements: Record<string, unknown>;
    reason: string;
    expiresAt: string | null;
    createdAt: string;
    createdBy: string | null;
    active: boolean;
    expired: boolean;
  } | null;
  overridableKeys: string[];
};

const LIMIT_LABELS: Record<string, string> = {
  maxConnections: "Max connections",
  maxToolsPerConnection: "Max tools / connection",
  maxAgentAssignments: "Max agent assignments",
  toolCallsPerPeriod: "Tool calls / period",
  toolCallsPerMinute: "Tool calls / minute",
};

function fmt(limit: unknown): string {
  return limit === -1 ? "Unlimited" : Number(limit ?? 0).toLocaleString();
}

export function PlatformOrgMcpEntitlementsPanel({ orgId }: { orgId: string }) {
  const { integrations: integrationsEnabled } = usePlatformFeatures();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [overrideValues, setOverrideValues] = useState<Record<string, string>>({});
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideExpiry, setOverrideExpiry] = useState("");

  const load = useCallback(async () => {
    if (!integrationsEnabled) return;
    setError(null);
    try {
      const response = await fetch(apiUrl(`/api/platform/orgs/${orgId}/mcp-override`), {
        headers: withAuthHeaders({}),
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not load MCP entitlements");
      setData(payload);
      const initial: Record<string, string> = {};
      for (const key of payload.overridableKeys ?? []) {
        if (key === "platformCatalog") continue;
        initial[key] = String((payload.entitlements as Record<string, unknown>)[key] ?? 0);
      }
      setOverrideValues(initial);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load MCP entitlements");
    } finally {
      setLoading(false);
    }
  }, [orgId, integrationsEnabled]);

  useEffect(() => {
    if (integrationsEnabled) void load();
    else { setData(null); setLoading(true); }
  }, [load, integrationsEnabled]);

  async function applyOverride() {
    if (!integrationsEnabled) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const entitlements: Record<string, unknown> = {};
      for (const [key, raw] of Object.entries(overrideValues)) {
        const value = Number(raw);
        if (Number.isFinite(value)) entitlements[key] = Math.trunc(value);
      }
      const response = await fetch(apiUrl(`/api/platform/orgs/${orgId}/mcp-override`), {
        method: "PUT",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          entitlements,
          reason: overrideReason,
          expiresAt: overrideExpiry || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        const issues = Array.isArray(payload.issues) ? `: ${payload.issues.join("; ")}` : "";
        throw new Error((payload.error ?? "Could not apply override") + issues);
      }
      setNotice("Override applied. It takes effect immediately.");
      setOverrideReason("");
      setOverrideExpiry("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply override");
    } finally {
      setBusy(false);
    }
  }

  async function removeOverride() {
    if (!integrationsEnabled) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(apiUrl(`/api/platform/orgs/${orgId}/mcp-override`), {
        method: "DELETE",
        headers: withAuthHeaders({}),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not remove override");
      setNotice("Override removed — plan defaults apply again.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove override");
    } finally {
      setBusy(false);
    }
  }

  if (!integrationsEnabled) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" /> Loading MCP entitlements…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted">
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    );
  }

  const e = data?.entitlements;
  const sources = data?.sources ?? {};

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {error && <p role="alert" className="rounded-lg bg-red-500/5 p-2.5 text-xs text-red-600">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-500/5 p-2.5 text-xs text-emerald-700">{notice}</p>}

      {/* Effective state */}
      <section className="rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <Cable className="h-4 w-4 text-primary" /> Effective MCP entitlement
          </h4>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
              data?.available
                ? "border-emerald-600/20 bg-emerald-500/10 text-emerald-600"
                : "border-border bg-muted text-muted-foreground"
            }`}
          >
            {data?.available ? "Available" : (data?.denialReason ?? "Unavailable")}
          </span>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Plan {data?.planName} ({data?.subscriptionStatus}) · billing period from{" "}
          {data ? new Date(data.periodStart).toLocaleDateString() : "—"}
        </p>
        {e && (
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">MCP feature</dt>
              <dd className="font-medium">{e.enabled ? "Enabled" : "Disabled"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Custom endpoints</dt>
              <dd className="font-medium">{e.customEndpoints ? "Allowed" : "Denied"}</dd>
            </div>
            {Object.entries(LIMIT_LABELS).map(([key, label]) => (
              <div key={key} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">
                  {label}
                  {sources[key] === "override" && (
                    <span className="ml-1 rounded bg-primary/10 px-1 py-px text-[10px] text-primary">override</span>
                  )}
                </dt>
                <dd className="font-medium tabular-nums">{fmt((e as unknown as Record<string, unknown>)[key])}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Platform catalog</dt>
              <dd className="font-medium">{e.platformCatalog ? "Included" : "Excluded"}</dd>
            </div>
          </dl>
        )}
      </section>

      {/* Usage */}
      {data && (
        <section className="rounded-xl border border-border p-4">
          <h4 className="text-sm font-semibold">Current usage (real)</h4>
          <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Connections</dt>
              <dd className="font-medium tabular-nums">
                {data.usage.connections} / {e ? fmt(e.maxConnections) : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Approved tools</dt>
              <dd className="font-medium tabular-nums">{data.usage.toolsApproved}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Agent assignments</dt>
              <dd className="font-medium tabular-nums">
                {data.usage.agentAssignments} / {e ? fmt(e.maxAgentAssignments) : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Tool calls (period)</dt>
              <dd className="font-medium tabular-nums">
                {data.usage.toolCallsThisPeriod} / {e ? fmt(e.toolCallsPerPeriod) : "—"}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {/* Override state */}
      {data?.override && (
        <section className={`rounded-xl border p-4 ${data.override.expired ? "border-dashed border-border opacity-70" : "border-primary/30 bg-primary/[0.03]"}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Organization override {data.override.expired ? "(expired)" : data.override.active ? "(active)" : ""}
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">{data.override.reason}</p>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {JSON.stringify(data.override.entitlements)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Applied {new Date(data.override.createdAt).toLocaleString()}
                {data.override.expiresAt && ` · expires ${new Date(data.override.expiresAt).toLocaleString()}`}
              </p>
            </div>
            <button
              onClick={() => void removeOverride()}
              disabled={busy}
              className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50"
            >
              <Trash2 className="mr-1 inline h-3.5 w-3.5" /> Remove
            </button>
          </div>
        </section>
      )}

      {/* Apply override */}
      <section className="rounded-xl border border-border p-4">
        <h4 className="text-sm font-semibold">{data?.override ? "Replace override" : "Apply organization override"}</h4>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Adjust numeric limits for this organisation only — capability switches stay
          plan-controlled. Overrides require a reason, can expire, and are audited.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {Object.entries(LIMIT_LABELS).map(([key, label]) => (
            <label key={key} className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{label} (-1 = unlimited)</span>
              <input
                type="number"
                min={-1}
                value={overrideValues[key] ?? ""}
                onChange={(ev) => setOverrideValues((prev) => ({ ...prev, [key]: ev.target.value }))}
                className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
              />
            </label>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Reason (required)</span>
            <input
              type="text"
              value={overrideReason}
              onChange={(ev) => setOverrideReason(ev.target.value)}
              maxLength={500}
              placeholder="e.g. Enterprise pilot extension"
              className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Expires at (optional)</span>
            <input
              type="datetime-local"
              value={overrideExpiry}
              onChange={(ev) => setOverrideExpiry(ev.target.value)}
              className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
            />
          </label>
        </div>
        <button
          onClick={() => void applyOverride()}
          disabled={busy || !overrideReason.trim() || Object.values(overrideValues).every((v) => v === "")}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {data?.override ? "Replace override" : "Apply override"}
        </button>
      </section>

      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Ban className="mt-0.5 h-3 w-3 shrink-0" />
        Overrides never bypass the global security policy, plan capability switches, or
        the system safety maxima. Entitlement changes take effect immediately for new
        operations; existing data is preserved.
      </p>
    </div>
  );
}