"use client";

/**
 * src/components/admin/ai-platform/ProvidersWorkspace.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform Admin → AI Platform → Providers & Models.
 *
 * Top level: capability tabs (Chat / Voice Chat / Realtime Voice — §3.1).
 * Provider cards show health, configuration state, capability summary and
 * model counts (§3.2). Opening a provider launches the half-canvas detail
 * workspace with Connection / Capabilities / Models / Health / Usage (§3.3).
 *
 * Credentials are WRITE-ONLY: the drawer shows a masked hint and never
 * receives a usable secret. Connection tests run server-side.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAIProviders,
  fetchProviderUsage,
  fetchProviderWorkspace,
  patchProvider,
  patchProviderModel,
  putCapabilityDefault,
  putProviderCredential,
  testProvider,
  type AICapability,
  type CapabilityDefaultDTO,
  type PlatformAIProviderDTO,
  type ProviderModelDTO,
  type ProviderUsageReportDTO,
} from "@/modules/admin-ui/ai-platform-api";
import {
  ContextDrawer,
  HealthDot,
  WorkspaceButton,
  WorkspaceTabs,
  healthLabel,
  timeAgo,
  VersionBadge,
} from "./shared";
import { cn } from "@/lib/utils";

const CAPABILITY_META: Record<AICapability, { label: string; blurb: string }> = {
  chat: {
    label: "Chat",
    blurb: "Text assistants: chat models, embeddings and RAG generation.",
  },
  voice_chat: {
    label: "Voice Chat",
    blurb: "Turn-based speech: STT → Clara turn → LLM/RAG → TTS.",
  },
  realtime_voice: {
    label: "Realtime Voice",
    blurb: "Continuous low-latency conversation with native realtime adapters.",
  },
};

const CAPABILITIES: AICapability[] = ["chat", "voice_chat", "realtime_voice"];

export function ProvidersWorkspace() {
  const [capability, setCapability] = useState<AICapability>("chat");
  const [providers, setProviders] = useState<PlatformAIProviderDTO[]>([]);
  const [defaults, setDefaults] = useState<CapabilityDefaultDTO[]>([]);
  const [usage, setUsage] = useState<ProviderUsageReportDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openProvider, setOpenProvider] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [registry, usageResult] = await Promise.all([fetchAIProviders(), fetchProviderUsage().catch(() => ({ reports: [] as ProviderUsageReportDTO[] }))]);
      setProviders(registry.providers);
      setDefaults(registry.defaults);
      setUsage(usageResult.reports);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () =>
      providers
        .map((p) => ({
          provider: p,
          supported: p.capabilities.find((c) => c.capability === capability)?.supported ?? false,
        }))
        // Each tab shows providers configured+enabled for that capability;
        // unsupported providers are surfaced collapsed with their state so the
        // admin still sees the full infrastructure picture (§3.1).
        .sort((a, b) => Number(b.supported) - Number(a.supported)),
    [providers, capability],
  );

  const detail = openProvider
    ? providers.find((p) => p.providerId === openProvider) ?? null
    : null;

  return (
    <div className="space-y-5">
      <WorkspaceTabs
        tabs={CAPABILITIES.map((c) => ({ id: c, label: CAPABILITY_META[c].label }))}
        active={capability}
        onChange={setCapability}
      />

      <p className="text-sm text-muted-foreground">{CAPABILITY_META[capability].blurb}</p>

      {loading && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-40 animate-pulse rounded-2xl bg-muted/60" />
          <div className="h-40 animate-pulse rounded-2xl bg-muted/60" />
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}

      {!loading && !error && (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map(({ provider, supported }) => {
            const capabilityDefault = defaults.find((d) => d.capability === capability);
            const isDefault = capabilityDefault?.providerId === provider.providerId;
            const usageReport = usage.find((u) => u.providerId === provider.providerId);
            return (
              <article
                key={provider.providerId}
                className={cn(
                  "rounded-2xl border bg-card p-5 shadow-sm transition-colors",
                  supported ? "border-border hover:border-primary/25" : "border-dashed border-border/70 opacity-80",
                )}
              >
                <header className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{provider.displayName}</h3>
                      {isDefault && supported && <VersionBadge tone="primary">Platform default</VersionBadge>}
                      {!provider.enabled && (
                        <VersionBadge tone="warning">
                          {provider.disabledReason === "kill_switch" ? "Disabled — operational flag off" : "Disabled"}
                        </VersionBadge>
                      )}
                      {!provider.configured && <VersionBadge tone="muted">Not configured</VersionBadge>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/70">{provider.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    <HealthDot status={provider.health?.status ?? "unknown"} />
                    {healthLabel(provider.health?.status ?? "unknown")}
                  </div>
                </header>

                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground/60">Capabilities</dt>
                    <dd className="mt-0.5 text-foreground/80">
                      {provider.capabilities.filter((c) => c.supported).map((c) => CAPABILITY_META[c.capability].label).join(" · ") || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground/60">{CAPABILITY_META[capability].label} models</dt>
                    <dd className="mt-0.5 text-foreground/80">{provider.modelCounts[capability] ?? 0} available</dd>
                  </div>
                  {usageReport && usageReport.monthlyBudgetUsd != null && (
                    <div className="col-span-2">
                      <dt className="text-muted-foreground/60">Usage this month</dt>
                      <dd className="mt-0.5 flex items-center gap-2 text-foreground/80">
                        {usageReport.usagePct ?? 0}%
                        {usageReport.rechargeWarning && (
                          <VersionBadge tone="warning">Recharge recommended</VersionBadge>
                        )}
                      </dd>
                    </div>
                  )}
                </dl>

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground/60">
                    {provider.credential?.configured
                      ? `Key ${provider.credential.maskedHint ?? "••••••"}`
                      : "No API key"}
                  </span>
                  <WorkspaceButton onClick={() => setOpenProvider(provider.providerId)} variant={supported ? "secondary" : "ghost"}>
                    {supported ? "Open provider" : "Configure"}
                  </WorkspaceButton>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {detail && (
        <ProviderDetailDrawer
          provider={detail}
          capability={capability}
          onClose={() => setOpenProvider(null)}
          onChanged={() => {
            void load();
          }}
          defaults={defaults}
          onDefaultChange={async (capabilityId, providerId, modelId) => {
            const result = await putCapabilityDefault(capabilityId, providerId, modelId);
            setDefaults(result.defaults);
          }}
        />
      )}
    </div>
  );
}

// ─── Provider detail drawer (Connection / Capabilities / Models / Health / Usage) ──

type DrawerSection = "connection" | "capabilities" | "models" | "health" | "usage";

function ProviderDetailDrawer({
  provider,
  capability,
  onClose,
  onChanged,
  defaults,
  onDefaultChange,
}: {
  provider: PlatformAIProviderDTO;
  capability: AICapability;
  onClose: () => void;
  onChanged: () => void;
  defaults: CapabilityDefaultDTO[];
  onDefaultChange: (capability: AICapability, providerId: string | null, modelId: string | null) => Promise<void>;
}) {
  const [section, setSection] = useState<DrawerSection>("connection");
  const [models, setModels] = useState<ProviderModelDTO[]>([]);
  const [usage, setUsage] = useState<ProviderUsageReportDTO | null>(null);
  const [healthHistory, setHealthHistory] = useState<Array<{ status: string; latencyMs: number | null; errorMessage: string | null; checkedAt: string }>>([]);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [enabled, setEnabled] = useState(provider.enabled);
  const [budget, setBudget] = useState(provider.monthlyBudgetUsd?.toString() ?? "");

  useEffect(() => {
    setEnabled(provider.enabled);
    setBudget(provider.monthlyBudgetUsd?.toString() ?? "");
  }, [provider]);

  const loadDetail = useCallback(async () => {
    try {
      const workspace = await fetchProviderWorkspace(provider.providerId);
      setModels(workspace.models);
      setUsage(workspace.usage);
      setHealthHistory(workspace.healthHistory);
    } catch {
      // detail load failures surface in the sections themselves
    }
  }, [provider.providerId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const capabilityModels = models.filter((m) => m.capability === capability);

  const saveCredential = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await putProviderCredential(provider.providerId, {
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(provider.credential?.baseUrlEnvKey && baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
      });
      setApiKey("");
      setBaseUrl("");
      setMessage("Credential saved.");
      onChanged();
      void loadDetail();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const result = await testProvider(provider.providerId);
      setMessage(
        result.health.status === "healthy"
          ? `Connection healthy (${result.health.latencyMs ?? "?"} ms).`
          : result.health.errorMessage ?? "Connection failed.",
      );
      onChanged();
      void loadDetail();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const toggleEnabled = async () => {
    setBusy(true);
    try {
      await patchProvider(provider.providerId, { enabled: !enabled });
      setEnabled(!enabled);
      onChanged();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveBudget = async () => {
    setBusy(true);
    try {
      const parsed = budget.trim() === "" ? null : Number(budget);
      await patchProvider(provider.providerId, { monthlyBudgetUsd: parsed });
      setMessage("Usage governance saved.");
      onChanged();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleModel = async (model: ProviderModelDTO) => {
    setBusy(true);
    try {
      await patchProviderModel(provider.providerId, {
        capability: model.capability,
        kind: model.kind,
        modelId: model.modelId,
        enabled: !model.enabled,
      });
      void loadDetail();
      onChanged();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setModelDefault = async (model: ProviderModelDTO) => {
    setBusy(true);
    try {
      await patchProviderModel(provider.providerId, {
        capability: model.capability,
        kind: model.kind,
        modelId: model.modelId,
        isDefault: true,
      });
      void loadDetail();
      onChanged();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const makePlatformDefault = async () => {
    setBusy(true);
    try {
      await onDefaultChange(capability, provider.providerId, null);
      setMessage(`Platform default for ${CAPABILITY_META[capability].label} set to ${provider.displayName}.`);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const isPlatformDefault = defaults.find((d) => d.capability === capability)?.providerId === provider.providerId;

  return (
    <ContextDrawer
      open
      onClose={onClose}
      width="sm:w-[32rem]"
      title={
        <span className="flex items-center gap-2.5">
          {provider.displayName}
          <HealthDot status={provider.health?.status ?? "unknown"} />
          <span className="text-xs font-normal text-muted-foreground">{healthLabel(provider.health?.status ?? "unknown")}</span>
        </span>
      }
      subtitle={
        provider.health?.checkedAt
          ? `Last checked ${timeAgo(provider.health.checkedAt)} · ${provider.health.errorMessage ?? ""}`.trim()
          : "Run a connection test to record health."
      }
      footer={
        <div className="flex items-center justify-between gap-3">
          <WorkspaceButton variant={enabled ? "danger" : "primary"} onClick={toggleEnabled} disabled={busy}>
            {enabled ? "Disable provider" : "Enable provider"}
          </WorkspaceButton>
          {message && <p className="flex-1 truncate text-xs text-muted-foreground" title={message}>{message}</p>}
        </div>
      }
    >
      <WorkspaceTabs
        tabs={[
          { id: "connection" as const, label: "Connection" },
          { id: "capabilities" as const, label: "Capabilities" },
          { id: "models" as const, label: "Models", count: capabilityModels.length },
          { id: "health" as const, label: "Health" },
          { id: "usage" as const, label: "Usage" },
        ]}
        active={section}
        onChange={setSection}
      />

      <div className="mt-5 space-y-4">
        {section === "connection" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs">
              <p className="font-medium text-foreground/90">
                {provider.credential?.configured ? "Configured" : "Not configured"}
              </p>
              <p className="mt-1 text-muted-foreground/70">
                API key {provider.credential?.maskedHint ?? "—"}
                {provider.credential?.updatedAt ? ` · updated ${timeAgo(provider.credential.updatedAt)}` : ""}
              </p>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-foreground/90">Update API key</span>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-…"
                autoComplete="off"
                className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40"
              />
              <span className="mt-1 block text-[11px] text-muted-foreground/60">
                Stored server-side only — the browser never receives the value back.
              </span>
            </label>
            {provider.credential?.baseUrlEnvKey && (
              <label className="block">
                <span className="text-xs font-medium text-foreground/90">Base URL ({provider.credential.baseUrlEnvKey})</span>
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.vendor.ai"
                  className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40"
                />
              </label>
            )}
            <div className="flex items-center gap-2.5">
              <WorkspaceButton variant="primary" onClick={saveCredential} disabled={busy || (!apiKey.trim() && !baseUrl.trim())}>
                Save credential
              </WorkspaceButton>
              <WorkspaceButton onClick={runTest} disabled={testing}>
                {testing ? "Testing…" : "Test connection"}
              </WorkspaceButton>
            </div>
          </div>
        )}

        {section === "capabilities" && (
          <ul className="space-y-2.5">
            {provider.capabilities.map((cap) => (
              <li key={cap.capability} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{CAPABILITY_META[cap.capability].label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground/70">{CAPABILITY_META[cap.capability].blurb}</p>
                </div>
                <VersionBadge tone={cap.supported ? "success" : "muted"}>
                  {cap.supported ? "Supported" : "Not supported"}
                </VersionBadge>
              </li>
            ))}
            <li className="rounded-xl border border-dashed border-border/70 px-4 py-3 text-xs text-muted-foreground/70">
              Capability support reflects the DEPLOYED adapters. A provider is only
              selectable by agents for capabilities its adapter actually implements.
            </li>
          </ul>
        )}

        {section === "models" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {capabilityModels.length} models for {CAPABILITY_META[capability].label}
              </p>
              {!isPlatformDefault && (
                <WorkspaceButton variant="ghost" onClick={makePlatformDefault} disabled={busy}>
                  Make platform default
                </WorkspaceButton>
              )}
              {isPlatformDefault && <VersionBadge tone="primary">Platform default</VersionBadge>}
            </div>
            {capabilityModels.length === 0 && (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground/70">
                No models for this capability — the provider does not implement it.
              </p>
            )}
            <ul className="divide-y divide-border/60 rounded-xl border border-border bg-card">
              {capabilityModels.map((model) => (
                <li key={model.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground/90">
                      {model.displayName}
                      {model.isDefault && <VersionBadge tone="primary" >Default</VersionBadge>}
                    </p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground/60">
                      {model.kind} · {model.modelId}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <WorkspaceButton variant="ghost" onClick={() => void setModelDefault(model)} disabled={busy || model.isDefault}>
                      Set default
                    </WorkspaceButton>
                    <button
                      type="button"
                      onClick={() => void toggleModel(model)}
                      disabled={busy}
                      aria-label={model.enabled ? "Disable model" : "Enable model"}
                      className={cn(
                        "relative h-5 w-9 rounded-full transition-colors disabled:opacity-50",
                        model.enabled ? "bg-primary" : "bg-muted",
                      )}
                    >
                      <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", model.enabled ? "left-[1.15rem]" : "left-0.5")} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {section === "health" && (
          <div className="space-y-3">
            <WorkspaceButton onClick={runTest} disabled={testing}>
              {testing ? "Testing…" : "Run connection test"}
            </WorkspaceButton>
            {healthHistory.length === 0 && (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground/70">
                No health checks recorded yet.
              </p>
            )}
            <ul className="divide-y divide-border/60 rounded-xl border border-border bg-card">
              {healthHistory.map((h, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                  <span className="flex items-center gap-2 text-foreground/80">
                    <HealthDot status={h.status as "healthy" | "degraded" | "down" | "unknown"} />
                    {healthLabel(h.status as "healthy" | "degraded" | "down" | "unknown")}
                  </span>
                  <span className="text-muted-foreground/70">
                    {h.latencyMs != null ? `${h.latencyMs} ms · ` : ""}
                    {timeAgo(h.checkedAt)}
                  </span>
                </li>
              ))}
            </ul>
            {provider.health?.errorMessage && (
              <p className="rounded-xl border border-amber-600/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-700">
                {provider.health.errorMessage}
              </p>
            )}
          </div>
        )}

        {section === "usage" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground/70">Current billing period · since {usage?.periodStart ?? "—"}</p>
              <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground/60">Requests</p>
                  <p className="mt-1 font-medium text-foreground">{(usage?.requests ?? 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground/60">Cost</p>
                  <p className="mt-1 font-medium text-foreground">${(usage?.costUsd ?? 0).toFixed(2)}</p>
                </div>
              </div>
              {usage?.monthlyBudgetUsd != null && (
                <>
                  <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", usage.rechargeWarning ? "bg-amber-500" : "bg-primary")}
                      style={{ width: `${Math.min(100, usage.usagePct ?? 0)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground/70">
                    {usage.usagePct ?? 0}% of ${usage.monthlyBudgetUsd} monthly budget
                    {usage.rechargeWarning && " · recharge recommended"}
                  </p>
                </>
              )}
            </div>
            <label className="block">
              <span className="text-xs font-medium text-foreground/90">Monthly budget (USD)</span>
              <input
                type="number"
                min="0"
                step="1"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="No budget"
                className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40"
              />
              <span className="mt-1 block text-[11px] text-muted-foreground/60">
                Warnings appear at {provider.warningThresholdPct}% of the budget.
              </span>
            </label>
            <WorkspaceButton variant="primary" onClick={saveBudget} disabled={busy}>
              Save usage governance
            </WorkspaceButton>
          </div>
        )}
      </div>
    </ContextDrawer>
  );
}
