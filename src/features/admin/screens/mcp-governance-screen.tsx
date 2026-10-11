"use client";
/**
 * Super-admin → Settings → MCP governance.
 *
 * Platform-level controls: global enablement (rollout), emergency
 * disablement, global security policy, optional platform catalog and
 * Clara-hosted MCP services. High-impact changes require typed confirmation.
 * Changing settings here never requires organisations to register their own
 * connections with the platform.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Loader2, AlertTriangle, ShieldAlert, Cable, Check, RefreshCw,
  Power, ShieldCheck, Store, Server, Info,
} from "lucide-react";

type SecurityPolicy = {
  requireHttps: boolean;
  blockPrivateNetworks: boolean;
  maxRedirects: number;
  requestTimeoutMs: number;
  tlsVerify: boolean;
};

type Settings = {
  mcpEnabled: boolean;
  emergencyDisabled: boolean;
  securityPolicy: SecurityPolicy;
  platformCatalogEnabled: boolean;
  claraHostedEnabled: boolean;
};

function ToggleRow({
  icon: Icon, title, description, checked, onChange, disabled, tone = "default",
}: {
  icon: typeof Power;
  title: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className={`shrink-0 rounded-xl p-2 ${tone === "danger" ? "bg-red-500/10 text-red-600" : "bg-muted text-muted-foreground"}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
          checked ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            checked ? "left-[1.4rem]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export default function McpGovernanceScreen() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/platform/mcp-settings", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load MCP settings");
      setSettings(data.settings);
      setUpdatedAt(data.updatedAt ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load MCP settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(next: Settings, confirmation?: string) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/platform/mcp-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...next, confirmation }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save MCP settings");
      setSettings(data.settings);
      setNotice("MCP settings saved. Changes take effect immediately for new operations.");
      setConfirmText("");
      setShowConfirm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save MCP settings");
    } finally {
      setSaving(false);
    }
  }

  function requestSave(next: Settings) {
    const needsConfirm =
      (!next.mcpEnabled && settings?.mcpEnabled) ||
      (next.emergencyDisabled && !settings?.emergencyDisabled);
    if (needsConfirm) {
      setSettings(next);
      setShowConfirm(true);
      return;
    }
    void save(next);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  const current = settings ?? {
    mcpEnabled: false,
    emergencyDisabled: false,
    securityPolicy: {
      requireHttps: true,
      blockPrivateNetworks: true,
      maxRedirects: 0,
      requestTimeoutMs: 15000,
      tlsVerify: true,
    },
    platformCatalogEnabled: false,
    claraHostedEnabled: false,
  };
  const pendingDisable = !current.mcpEnabled && current.mcpEnabled !== settings?.mcpEnabled;
  const pendingEmergency =
    current.emergencyDisabled && !settings?.emergencyDisabled;
  const expectedConfirmation = pendingEmergency ? "EMERGENCY-DISABLE" : "DISABLE-MCP";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">MCP governance</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Platform-wide MCP controls. Organizations own their connections; these
          switches govern availability, security policy and rollout.
        </p>
        {updatedAt && (
          <p className="mt-1 text-xs text-muted-foreground">
            Last updated {new Date(updatedAt).toLocaleString()}
          </p>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">{error}</div>
      )}
      {notice && (
        <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">{notice}</div>
      )}

      {/* Emergency banner */}
      {settings?.emergencyDisabled && (
        <div role="alert" className="rounded-2xl border border-red-600/30 bg-red-500/5 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-red-600">
            <ShieldAlert className="h-5 w-5" /> Emergency disablement is ACTIVE
          </p>
          <p className="mt-1 text-sm text-red-600/90">
            Every MCP operation across every organisation is blocked right now,
            regardless of plan entitlements. Re-enable below when the incident is resolved.
          </p>
        </div>
      )}

      {/* Confirmation dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="shrink-0 rounded-xl bg-red-500/10 p-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Confirm high-impact change</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {pendingEmergency
                    ? "Emergency disablement immediately blocks all MCP operations for every organisation. It overrides every plan entitlement."
                    : "Turning MCP off platform-wide immediately blocks new MCP operations for every organisation that uses them."}
                </p>
              </div>
            </div>
            <label className="mt-4 block space-y-1.5">
              <span className="text-sm font-medium">
                Type <span className="font-mono text-red-600">{expectedConfirmation}</span> to confirm
              </span>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-sm outline-none focus:ring-2 focus:ring-red-500/25"
                placeholder={expectedConfirmation}
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowConfirm(false);
                  setConfirmText("");
                  void load();
                }}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => void save(current, confirmText.trim().toUpperCase())}
                disabled={confirmText.trim().toUpperCase() !== expectedConfirmation || saving}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-600/90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rollout */}
      <section className="divide-y divide-border rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-2 p-4 pb-0 text-sm font-semibold">
          <Cable className="h-4 w-4 text-primary" /> Rollout
        </div>
        <ToggleRow
          icon={Power}
          title="MCP enabled platform-wide"
          description="Master availability switch. When off, no organisation can use MCP regardless of plan entitlements."
          checked={current.mcpEnabled}
          onChange={(next) => requestSave({ ...current, mcpEnabled: next })}
          disabled={saving || current.emergencyDisabled}
        />
        <ToggleRow
          icon={ShieldAlert}
          title="Emergency disablement"
          description="Incident kill switch. Overrides every plan-level grant immediately."
          checked={current.emergencyDisabled}
          onChange={(next) => requestSave({ ...current, emergencyDisabled: next })}
          disabled={saving}
          tone="danger"
        />
      </section>

      {/* Security policy */}
      <section className="divide-y divide-border rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-2 p-4 pb-0 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" /> Global security policy
        </div>
        <ToggleRow
          icon={ShieldCheck}
          title="Require HTTPS endpoints"
          description="MCP endpoints must use HTTPS. Applies to every organisation connection."
          checked={current.securityPolicy.requireHttps}
          onChange={(next) =>
            requestSave({
              ...current,
              securityPolicy: { ...current.securityPolicy, requireHttps: next },
            })
          }
          disabled={saving}
        />
        <ToggleRow
          icon={ShieldCheck}
          title="Block private networks"
          description="SSRF protection: loopback, link-local, private and metadata destinations are rejected, including via redirects and DNS."
          checked={current.securityPolicy.blockPrivateNetworks}
          onChange={(next) =>
            requestSave({
              ...current,
              securityPolicy: { ...current.securityPolicy, blockPrivateNetworks: next },
            })
          }
          disabled={saving}
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Maximum redirect hops</span>
            <input
              type="number"
              min={0}
              max={5}
              value={current.securityPolicy.maxRedirects}
              onChange={(e) => {
                const value = Math.max(0, Math.min(5, Number(e.target.value) || 0));
                requestSave({
                  ...current,
                  securityPolicy: { ...current.securityPolicy, maxRedirects: value },
                });
              }}
              disabled={saving}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/25"
            />
            <span className="block text-xs text-muted-foreground">0 means redirects are refused.</span>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Request timeout (ms)</span>
            <input
              type="number"
              min={1000}
              max={120000}
              step={1000}
              value={current.securityPolicy.requestTimeoutMs}
              onChange={(e) => {
                const value = Math.max(1000, Math.min(120000, Number(e.target.value) || 15000));
                requestSave({
                  ...current,
                  securityPolicy: { ...current.securityPolicy, requestTimeoutMs: value },
                });
              }}
              disabled={saving}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/25"
            />
            <span className="block text-xs text-muted-foreground">Bounded handshake and tool-call duration.</span>
          </label>
        </div>
        <div className="flex items-start gap-2 border-t border-border bg-muted/30 p-4 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          TLS certificate verification is always enforced and cannot be disabled.
        </div>
      </section>

      {/* Platform catalog */}
      <section className="divide-y divide-border rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-2 p-4 pb-0 text-sm font-semibold">
          <Store className="h-4 w-4 text-primary" /> Optional platform services
        </div>
        <ToggleRow
          icon={Store}
          title="Platform-provided MCP catalog"
          description="Optional catalog of platform-managed MCP servers organisations may use. Independent of organization-owned connections."
          checked={current.platformCatalogEnabled}
          onChange={(next) => requestSave({ ...current, platformCatalogEnabled: next })}
          disabled={saving}
        />
        <ToggleRow
          icon={Server}
          title="Clara-hosted MCP services"
          description="Optional MCP services hosted by the platform itself."
          checked={current.claraHostedEnabled}
          onChange={(next) => requestSave({ ...current, claraHostedEnabled: next })}
          disabled={saving}
        />
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={() => void load()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" /> Reload
        </button>
        {saving && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Saving…
          </span>
        )}
        {!saving && settings && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5 text-emerald-600" /> Settings in sync
          </span>
        )}
      </div>
    </div>
  );
}
