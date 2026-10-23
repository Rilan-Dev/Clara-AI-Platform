"use client";
/**
 * Organisation billing — MCP usage & entitlement section.
 *
 * Shows real server-side counters against the effective MCP entitlements
 * (plan ∩ global policy ∩ override), the billing-period anchor, and why a
 * capability is unavailable when it is denied. No projected numbers.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Cable, Ban, Loader2, RefreshCw } from "lucide-react";
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

type Overview = {
  available: boolean;
  denialReason: string | null;
  planName: string;
  subscriptionStatus: string;
  periodStart: string;
  entitlements: Entitlements;
  usage: {
    connections: number;
    activeConnections: number;
    toolsApproved: number;
    agentAssignments: number;
    toolCallsThisPeriod: number;
    failedCallsThisPeriod: number;
  };
};

function fmt(limit: number): string {
  return limit === -1 ? "Unlimited" : limit.toLocaleString();
}

function Row({ label, used, limit }: { label: string; used: number; limit: number }) {
  const capped = limit !== -1 && used > limit;
  const near = limit !== -1 && !capped && limit > 0 && used / limit >= 0.8;
  const pct = limit === -1 ? 0 : limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-semibold tabular-nums ${capped ? "text-red-600" : "text-foreground"}`}>
          {used.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">/ {fmt(limit)}</span>
        </span>
      </div>
      {limit !== -1 && (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${capped ? "bg-red-500" : near ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function OrgMcpUsageCard({ orgId }: { orgId: string }) {
  const router = useRouter();
  const { integrations: integrationsEnabled } = usePlatformFeatures();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(false);

  useEffect(() => {
    if (!integrationsEnabled) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/orgs/${orgId}/mcp/overview`, { cache: "no-store" });
        const payload = await response.json();
        if (!cancelled && response.ok) setData(payload);
      } catch {
        // Error surfaces as the retry state below.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, retry, integrationsEnabled]);

  if (!integrationsEnabled) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" /> Loading MCP usage…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">MCP usage could not be loaded.</p>
        <button
          onClick={() => setRetry((r) => !r)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    );
  }

  const e = data.entitlements;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <Cable className="h-4 w-4 text-primary" /> MCP tool servers
          </h3>
          <p className="mt-1 text-sm text-muted-foreground/70">
            {data.available
              ? `Included in the ${data.planName} plan · period from ${new Date(data.periodStart).toLocaleDateString()}`
              : "Not included in your current plan"}
          </p>
        </div>
        {data.available && (
          <button
            onClick={() => router.push(`/orgs/${orgId}/integrations`)}
            className="shrink-0 rounded-xl border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Manage
          </button>
        )}
      </div>

      {!data.available ? (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Ban className="mt-0.5 h-4 w-4 shrink-0" />
            {data.denialReason === "EMERGENCY_DISABLED"
              ? "MCP access is temporarily disabled by the platform administrator."
              : data.denialReason === "GLOBAL_DISABLED"
                ? "MCP is not currently enabled on this platform."
                : "Your plan does not include custom MCP tool servers."}
          </p>
          <button
            onClick={() => router.push(`/orgs/${orgId}/billing#plans`)}
            className="shrink-0 rounded-xl bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            View plans
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <Row label="MCP connections" used={data.usage.connections} limit={e.maxConnections} />
          <Row label="Agent assignments" used={data.usage.agentAssignments} limit={e.maxAgentAssignments} />
          <Row label="Tool calls this period" used={data.usage.toolCallsThisPeriod} limit={e.toolCallsPerPeriod} />
          <div className="grid gap-2 border-t border-border pt-4 text-xs text-muted-foreground sm:grid-cols-2">
            <p>Approved tools: {data.usage.toolsApproved.toLocaleString()} · per connection: {fmt(e.maxToolsPerConnection)}</p>
            <p>Rate limit: {fmt(e.toolCallsPerMinute)} calls/minute</p>
            <p>Over-quota behavior: {e.usagePolicy === "deny" ? "Calls are blocked" : "Calls are metered"}</p>
            <p>
              Platform catalog: {e.platformCatalog ? "included" : "not included"}
              {e.usagePolicy === "meter" && " · overage billing not applied"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}