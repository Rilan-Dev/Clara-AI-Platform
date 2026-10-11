"use client";
/**
 * Plan editor — MCP entitlements configuration section.
 *
 * Platform admins configure which MCP capabilities a plan includes and the
 * enforced limits. All values round-trip through the centralized validation
 * schema on the server; this form only collects intent and shows the
 * capability summary. Only implemented auth methods/transports are offered.
 */
import { Cable, Info, ShieldAlert } from "lucide-react";

export type PlanMcpEntitlements = {
  enabled: boolean;
  customEndpoints: boolean;
  maxConnections: number;
  maxToolsPerConnection: number;
  maxAgentAssignments: number;
  toolCallsPerPeriod: number;
  toolCallsPerMinute: number;
  allowedAuthMethods: string[];
  allowedTransports: string[];
  platformCatalog: boolean;
  privateNetwork: boolean;
  usagePolicy: string;
  notes: string;
};

export const PLAN_MCP_DISABLED: PlanMcpEntitlements = {
  enabled: false,
  customEndpoints: false,
  maxConnections: 0,
  maxToolsPerConnection: 0,
  maxAgentAssignments: 0,
  toolCallsPerPeriod: 0,
  toolCallsPerMinute: 0,
  allowedAuthMethods: ["none"],
  allowedTransports: ["streamable_http"],
  platformCatalog: false,
  privateNetwork: false,
  usagePolicy: "deny",
  notes: "",
};

const AUTH_METHODS: Array<{ value: string; label: string; hint: string }> = [
  { value: "none", label: "None", hint: "Open endpoint" },
  { value: "bearer_token", label: "Bearer token", hint: "Authorization: Bearer" },
  { value: "basic_auth", label: "Basic auth", hint: "Username + password" },
  { value: "api_key_header", label: "API key header", hint: "Custom header" },
];

const NUMERIC_LIMITS: Array<{
  key: keyof PlanMcpEntitlements;
  label: string;
  hint: string;
  max: number;
}> = [
  {
    key: "maxConnections",
    label: "Max connections",
    hint: "Per organisation. -1 = unlimited.",
    max: 500,
  },
  {
    key: "maxToolsPerConnection",
    label: "Max tools per connection",
    hint: "Approved/discovered tools per connection. -1 = unlimited.",
    max: 500,
  },
  {
    key: "maxAgentAssignments",
    label: "Max agent assignments",
    hint: "Active agent-to-tool grants per organisation. -1 = unlimited.",
    max: 10000,
  },
  {
    key: "toolCallsPerPeriod",
    label: "Tool calls per billing period",
    hint: "Metered invocations. -1 = unlimited (not combinable with metered overage).",
    max: 10000000,
  },
  {
    key: "toolCallsPerMinute",
    label: "Tool calls per minute",
    hint: "Hard rate limit. -1 = unlimited.",
    max: 10000,
  },
];

function limitSummary(value: number): string {
  return value === -1 ? "Unlimited" : value === 0 ? "Disabled" : value.toLocaleString();
}

export function PlanMcpEntitlementsEditor({
  value,
  onChange,
}: {
  value: PlanMcpEntitlements;
  onChange: (next: PlanMcpEntitlements) => void;
}) {
  const patch = (partial: Partial<PlanMcpEntitlements>) =>
    onChange({ ...value, ...partial });

  const toggleAuthMethod = (method: string, checked: boolean) => {
    const next = checked
      ? [...value.allowedAuthMethods, method]
      : value.allowedAuthMethods.filter((m) => m !== method);
    if (next.length === 0) return; // At least one method must remain permitted.
    patch({ allowedAuthMethods: next });
  };

  return (
    <section className="rounded-2xl border border-border bg-muted/20 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Cable className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <h3 className="text-sm font-semibold">MCP capabilities</h3>
            <p className="text-xs text-muted-foreground">
              Organization-owned MCP tool servers, quotas and security-relevant limits.
            </p>
          </div>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) =>
              patch(
                e.target.checked
                  ? {
                      enabled: true,
                      customEndpoints: true,
                      maxConnections: Math.max(value.maxConnections, 2),
                      maxToolsPerConnection: Math.max(value.maxToolsPerConnection, 25),
                      maxAgentAssignments: Math.max(value.maxAgentAssignments, 50),
                      toolCallsPerPeriod: Math.max(value.toolCallsPerPeriod, 5000),
                      toolCallsPerMinute: Math.max(value.toolCallsPerMinute, 30),
                    }
                  : { ...PLAN_MCP_DISABLED, notes: value.notes },
              )
            }
            className="rounded border-border text-primary focus:ring-primary/20"
          />
          <span className="text-sm text-muted-foreground">Enable MCP for this plan</span>
        </label>
      </div>

      {value.enabled ? (
        <>
          {/* Capability switches */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
              <input
                type="checkbox"
                checked={value.customEndpoints}
                onChange={(e) => patch({ customEndpoints: e.target.checked })}
                className="rounded border-border text-primary focus:ring-primary/20"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">Custom MCP endpoints</span>
                <span className="block text-[11px] text-muted-foreground">
                  Allow organization-owned endpoint URLs
                </span>
              </span>
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
              <input
                type="checkbox"
                checked={value.platformCatalog}
                onChange={(e) => patch({ platformCatalog: e.target.checked })}
                className="rounded border-border text-primary focus:ring-primary/20"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">Platform catalog access</span>
                <span className="block text-[11px] text-muted-foreground">
                  Optional platform-provided MCP servers
                </span>
              </span>
            </label>
          </div>

          {/* Numeric limits */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {NUMERIC_LIMITS.map(({ key, label, hint, max }) => (
              <label key={key} className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
                <input
                  type="number"
                  min={-1}
                  max={max}
                  value={String(value[key])}
                  onChange={(e) => {
                    const raw = Number(e.target.value);
                    const safe = Number.isNaN(raw) ? -1 : Math.max(-1, Math.min(max, Math.trunc(raw)));
                    patch({ [key]: safe } as Partial<PlanMcpEntitlements>);
                  }}
                  className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                />
                <span className="block text-[11px] text-muted-foreground">{hint}</span>
              </label>
            ))}
          </div>

          {/* Auth methods */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Allowed authentication methods</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {AUTH_METHODS.map((method) => {
                const checked = value.allowedAuthMethods.includes(method.value);
                return (
                  <label
                    key={method.value}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-xs transition-colors ${
                      checked ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:bg-muted/50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleAuthMethod(method.value, e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary/20"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">{method.label}</span>
                      <span className="block text-[10px] text-muted-foreground">{method.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Usage policy + transports */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Usage / overage policy</span>
              <select
                value={value.usagePolicy}
                onChange={(e) => patch({ usagePolicy: e.target.value })}
                className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
              >
                <option value="deny">Deny — block calls when the quota is exhausted</option>
                <option value="meter">Meter — record over-quota calls, never block</option>
              </select>
              <span className="block text-[11px] text-muted-foreground">
                Overage billing is not implemented; metered usage is surfaced in usage reports.
              </span>
            </label>
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Supported transports</span>
              <div className="rounded-lg border border-border bg-card p-2.5 text-xs">
                <span className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={value.allowedTransports.includes("streamable_http")}
                    readOnly
                    disabled
                    className="rounded border-border text-primary"
                  />
                  Streamable HTTP (HTTPS)
                  <span className="ml-auto text-[10px] text-muted-foreground">Only implemented transport</span>
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Plan-specific notes <span className="opacity-70">(internal administration)</span>
            </span>
            <textarea
              value={value.notes}
              onChange={(e) => patch({ notes: e.target.value.slice(0, 2000) })}
              rows={2}
              placeholder="Optional context for other platform admins…"
              className="w-full resize-none rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
            />
          </label>

          {/* Capability summary */}
          <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Resulting plan capabilities</p>
            <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
              <li>Connections: {limitSummary(value.maxConnections)} per organisation</li>
              <li>Tools: {limitSummary(value.maxToolsPerConnection)} per connection</li>
              <li>Agent assignments: {limitSummary(value.maxAgentAssignments)}</li>
              <li>
                Tool calls: {limitSummary(value.toolCallsPerPeriod)} per period ·{" "}
                {limitSummary(value.toolCallsPerMinute)}/min
              </li>
              <li>
                Auth:{" "}
                {value.allowedAuthMethods
                  .map((m) => AUTH_METHODS.find((a) => a.value === m)?.label ?? m)
                  .join(", ")}
              </li>
              <li>
                Over-quota behavior: {value.usagePolicy === "deny" ? "Blocked" : "Metered"} ·
                Catalog: {value.platformCatalog ? "included" : "excluded"}
              </li>
            </ul>
            <p className="mt-2 flex items-start gap-1.5 text-[11px]">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              Private-network connectivity requires an approved gateway architecture that this
              deployment does not have — it is not configurable.
            </p>
          </div>

          {value.usagePolicy === "meter" && value.toolCallsPerPeriod === -1 && (
            <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-red-500/5 p-2.5 text-xs text-red-600">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Metered overage requires a finite per-period quota to meter against.
            </p>
          )}
        </>
      ) : (
        <p className="rounded-xl border border-dashed border-border bg-card p-3 text-xs text-muted-foreground">
          MCP is disabled for this plan. Organizations on this tier cannot create
          MCP connections, and existing ones stop new operations immediately.
        </p>
      )}
    </section>
  );
}
