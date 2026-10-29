"use client";

/**
 * src/components/admin/ai-platform/ProvidersWorkspace.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform Admin → AI Platform → Providers & Models.
 *
 * Top level: capability tabs (Chat / Voice Chat / Realtime Voice — §3.1). Each
 * tab lists ONLY the providers that actually implement that capability (e.g.
 * ElevenLabs never shows under Chat). Platform-default switching lives right
 * on the listing cards so providers can be switched without opening a drawer.
 *
 * Opening a provider launches the half-canvas detail workspace with
 * Connection / Capabilities / Models / Voices (speech tabs only) / Health /
 * Usage (§3.3). Models and voices are never mixed: each capability lists only
 * its applicable model kinds, and voices get their own section which only
 * exists in the Voice Chat and Realtime Voice tabs.
 *
 * Credentials are WRITE-ONLY: the drawer shows a masked hint and never
 * receives a usable secret. Connection tests run server-side.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAIProviders,
  fetchEmbeddingDefault,
  putEmbeddingDefault,
  fetchProviderUsage,
  fetchProviderWorkspace,
  patchProvider,
  patchProviderModel,
  putCapabilityDefault,
  putProviderCredential,
  testProvider,
  type AICapability,
  type EmbeddingDefaultDTO,
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

// Models a picker on that surface can actually SELECT. Embedding models are
// deliberately NOT applicable to the chat surface: they cannot generate text,
// so they must never appear in a chat model list (the operator saw
// "107 applicable models for Chat" = 104 chat + 3 embedding and rightly
// flagged it). Embeddings are managed in the dedicated Embeddings workspace.
// The speech surfaces legitimately mix kinds — each picker field on those
// surfaces is kind-scoped (STT/TTS/realtime/voice pick their own kinds).
const APPLICABLE_MODEL_KINDS: Record<AICapability, string[]> = {
  chat: ["chat"],
  voice_chat: ["tts", "stt", "transcription"],
  realtime_voice: ["realtime", "stt", "tts", "transcription", "sts"],
};

const KIND_LABELS: Record<string, string> = {
  chat: "Chat",
  embedding: "Embedding",
  realtime: "Realtime",
  transcription: "Transcription",
  tts: "Text-to-speech",
  stt: "Speech-to-text",
  voice: "Voice",
  sts: "Speech-to-speech realtime",
};

// The Base URL field's example value per env key. The OLD generic placeholder
// ("https://api.vendor.ai") was a dead domain that looked like a plausible
// vendor endpoint — it leaked into live SARVAM_BASE_URL configs twice and
// silently broke every Sarvam call with connect timeouts. Show the OFFICIAL
// endpoint per provider instead, and never suggest a URL that does not exist.
const BASE_URL_PLACEHOLDERS: Record<string, string> = {
  SARVAM_BASE_URL: "https://api.sarvam.ai",
  ELEVENLABS_BASE_URL: "https://api.elevenlabs.io",
  ELEVENLABS_API_BASE_URL: "https://api.elevenlabs.io",
};

export function ProvidersWorkspace() {
  const [area, setArea] = useState<AICapability | "embeddings">("chat");
  const capability: AICapability = area === "embeddings" ? "chat" : area;
  const [providers, setProviders] = useState<PlatformAIProviderDTO[]>([]);
  const [defaults, setDefaults] = useState<CapabilityDefaultDTO[]>([]);
  const [usage, setUsage] = useState<ProviderUsageReportDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openProvider, setOpenProvider] = useState<string | null>(null);
  const [defaultBusy, setDefaultBusy] = useState<string | null>(null);

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

  // Only providers that actually implement the selected capability are
  // listed (§3.1) — e.g. ElevenLabs never appears in the Chat tab. The full
  // capability matrix stays visible inside each provider drawer.
  const capabilityDefault = defaults.find((d) => d.capability === capability) ?? null;

  const visible = useMemo(
    () =>
      providers
        .filter((p) => p.capabilities.find((c) => c.capability === capability)?.supported ?? false)
        .sort((a, b) => {
          const aDefault = capabilityDefault?.providerId === a.providerId ? 0 : 1;
          const bDefault = capabilityDefault?.providerId === b.providerId ? 0 : 1;
          if (aDefault !== bDefault) return aDefault - bDefault;
          return a.displayName.localeCompare(b.displayName);
        }),
    [providers, capability, capabilityDefault],
  );

  const setPlatformDefault = async (providerId: string) => {
    const provider = providers.find((item) => item.providerId === providerId);
    if (!provider?.enabled) {
      setError("Enable the provider before making it a platform default.");
      return;
    }
    setDefaultBusy(providerId);
    setError(null);
    try {
      const result = await putCapabilityDefault(capability, providerId, null);
      setDefaults(result.defaults);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDefaultBusy(null);
    }
  };

  const detail = openProvider
    ? providers.find((p) => p.providerId === openProvider) ?? null
    : null;

  return (
    <div className="space-y-5">
      <WorkspaceTabs
        tabs={[
          { id: "chat" as const, label: "Chat" },
          { id: "embeddings" as const, label: "Embeddings" },
          { id: "voice_chat" as const, label: "Voice Chat" },
          { id: "realtime_voice" as const, label: "Realtime Voice" },
        ]}
        active={area}
        onChange={setArea}
      />

      {area === "embeddings" ? (
        <EmbeddingsWorkspace />
      ) : (
        <>
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
          {visible.map((provider) => {
            const isDefault = capabilityDefault?.providerId === provider.providerId;
            const usageReport = usage.find((u) => u.providerId === provider.providerId);
            return (
              <article
                key={provider.providerId}
                className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/25"
              >
                <header className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{provider.displayName}</h3>
                      {isDefault && <VersionBadge tone="primary">Platform default</VersionBadge>}
                      {!provider.enabled && (
                        <VersionBadge tone="warning">
                          Disabled platform-wide
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
                    <dt className="text-muted-foreground/80">Capabilities</dt>
                    <dd className="mt-0.5 text-foreground/80">
                      {provider.capabilities.filter((c) => c.supported).map((c) => CAPABILITY_META[c.capability].label).join(" · ") || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground/80">{CAPABILITY_META[capability].label} models</dt>
                    <dd className="mt-0.5 text-foreground/80">{provider.modelCounts[capability] ?? 0} available</dd>
                  </div>
                  {usageReport && usageReport.monthlyBudgetUsd != null && (
                    <div className="col-span-2">
                      <dt className="text-muted-foreground/80">Usage this month</dt>
                      <dd className="mt-0.5 flex items-center gap-2 text-foreground/80">
                        {usageReport.usagePct ?? 0}%
                        {usageReport.rechargeWarning && (
                          <VersionBadge tone="warning">Recharge recommended</VersionBadge>
                        )}
                      </dd>
                    </div>
                  )}
                </dl>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <span className="text-[11px] text-muted-foreground/80">
                    {provider.credential?.configured
                      ? `Key ${provider.credential.maskedHint ?? "••••••"}`
                      : "No API key"}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Platform-default switching lives on the listing (not in
                        the drawer) so providers can be switched quickly. */}
                    {!isDefault && (
                      <WorkspaceButton
                        variant="ghost"
                        onClick={() => void setPlatformDefault(provider.providerId)}
                        disabled={defaultBusy != null || !provider.enabled}
                      >
                        {defaultBusy === provider.providerId ? "Setting…" : `Set as ${CAPABILITY_META[capability].label.toLowerCase()} default`}
                      </WorkspaceButton>
                    )}
                    <WorkspaceButton onClick={() => setOpenProvider(provider.providerId)}>
                      Open provider
                    </WorkspaceButton>
                  </div>
                </div>
              </article>
            );
          })}
          {visible.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground/70 md:col-span-2">
              No providers support {CAPABILITY_META[capability].label} — the platform deploys no adapter for this capability yet.
            </p>
          )}
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
        />
      )}
        </>
      )}
    </div>
  );
}

function EmbeddingsWorkspace() {
  const [embeddingDefault, setEmbeddingDefault] = useState<EmbeddingDefaultDTO | null>(null);
  const [options, setOptions] = useState<Array<{
    providerId: "openai" | "gemini" | "qwen";
    displayName: string;
    configured: boolean;
    enabled: boolean;
    models: ProviderModelDTO[];
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [registry, current] = await Promise.all([
        fetchAIProviders(),
        fetchEmbeddingDefault(),
      ]);
      setEmbeddingDefault(current.embeddingDefault ?? registry.embeddingDefault ?? null);
      const supported = registry.providers.filter(
        (provider): provider is PlatformAIProviderDTO & { providerId: "openai" | "gemini" | "qwen" } =>
          provider.providerId === "openai" || provider.providerId === "gemini" || provider.providerId === "qwen",
      );
      const workspaces = await Promise.all(
        supported.map(async (provider) => {
          const workspace = await fetchProviderWorkspace(provider.providerId);
          return {
            providerId: provider.providerId,
            displayName: provider.displayName,
            configured: provider.configured,
            enabled: provider.enabled,
            models: workspace.models.filter((model) => model.capability === "chat" && model.kind === "embedding" && model.enabled),
          };
        }),
      );
      setOptions(workspaces);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (providerId: "openai" | "gemini" | "qwen", modelId: string) => {
    setBusy(providerId + ":" + modelId);
    setMessage(null);
    try {
      const result = await putEmbeddingDefault(providerId, modelId);
      setEmbeddingDefault(result.embeddingDefault);
      setMessage(`Embedding model set to ${modelId}. New document ingestion will use this backbone.`);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const result = await apiFetchEmbeddingTest();
      setMessage(`Embedding test passed: ${result.modelId} returned ${result.dimension} dimensions in ${result.latencyMs} ms.`);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div className="h-56 animate-pulse rounded-2xl bg-muted/60" />;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground">Document Embeddings</h3>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Dedicated embedding configuration for PDF uploads, web scraping and document re-indexing. This is independent from the chat and realtime model selections.
            </p>
          </div>
          <WorkspaceButton onClick={test} disabled={testing || !embeddingDefault}>
            {testing ? "Testing…" : "Test embedding"}
          </WorkspaceButton>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <VersionBadge tone="primary">Active</VersionBadge>
          <span className="text-muted-foreground">Provider: <strong className="text-foreground">{embeddingDefault?.providerId ?? "—"}</strong></span>
          <span className="text-muted-foreground">Model: <strong className="font-mono text-foreground">{embeddingDefault?.modelId ?? "—"}</strong></span>
        </div>
        {message && <p className="mt-4 rounded-xl border border-border bg-card px-3 py-2.5 text-xs text-foreground/80">{message}</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {options.map((provider) => (
          <article key={provider.providerId} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-foreground">{provider.displayName}</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  {provider.configured ? "API credentials configured" : "API credentials not configured"}
                  {!provider.enabled && " · provider disabled"}
                </p>
              </div>
              {embeddingDefault?.providerId === provider.providerId && <VersionBadge tone="primary">Embedding provider</VersionBadge>}
            </div>
            <div className="mt-4 space-y-2">
              {provider.models.map((model) => {
                const active = embeddingDefault?.providerId === provider.providerId && embeddingDefault.modelId === model.modelId;
                const key = provider.providerId + ":" + model.modelId;
                const dims = model.modelId === "text-embedding-3-large" ? 3072 : model.modelId === "text-embedding-3-small" || model.modelId === "text-embedding-ada-002" ? 1536 : "provider-defined";
                return (
                  <div key={model.id} className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3.5 py-3", active ? "border-primary/30 bg-primary/5" : "border-border bg-card")}>
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-foreground">{model.displayName}</p>
                      <p className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground/70">{model.modelId} · {dims} dims</p>
                    </div>
                    <WorkspaceButton variant={active ? "ghost" : "primary"} onClick={() => void save(provider.providerId, model.modelId)} disabled={busy != null || !provider.configured || !provider.enabled}>
                      {busy === key ? "Saving…" : active ? "Active" : "Use for documents"}
                    </WorkspaceButton>
                  </div>
                );
              })}
              {provider.models.length === 0 && <p className="rounded-xl border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">No enabled embedding models.</p>}
            </div>
          </article>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        Changing this setting does not rewrite existing Qdrant vectors automatically. Existing documents remain on their current vector space until you explicitly reprocess them. New uploads and scrapes use the active setting.
      </div>
    </div>
  );
}

async function apiFetchEmbeddingTest(): Promise<{ providerId: string; modelId: string; dimension: number; latencyMs: number }> {
  const response = await fetch("/api/platform/ai/embedding-default/test", { method: "POST", headers: { "Content-Type": "application/json" } });
  const body = (await response.json().catch(() => ({}))) as { error?: string; providerId?: string; modelId?: string; dimension?: number; latencyMs?: number };
  if (!response.ok) throw new Error(body.error ?? "Embedding test failed");
  return { providerId: body.providerId ?? "", modelId: body.modelId ?? "", dimension: body.dimension ?? 0, latencyMs: body.latencyMs ?? 0 };
}

// ─── Provider detail drawer (Connection / Capabilities / Models / Voices / Health / Usage) ──

type DrawerSection = "connection" | "capabilities" | "models" | "voices" | "health" | "usage";

function ProviderDetailDrawer({
  provider,
  capability,
  onClose,
  onChanged,
  defaults,
}: {
  provider: PlatformAIProviderDTO;
  capability: AICapability;
  onClose: () => void;
  onChanged: () => void;
  defaults: CapabilityDefaultDTO[];
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
  const [realtimeEnabled, setRealtimeEnabled] = useState(provider.realtimeEnabled);
  const [budget, setBudget] = useState(provider.monthlyBudgetUsd?.toString() ?? "");

  useEffect(() => {
    setEnabled(provider.enabled);
    setRealtimeEnabled(provider.realtimeEnabled);
    setBudget(provider.monthlyBudgetUsd?.toString() ?? "");
  }, [provider]);

  // A different provider opens a fresh drawer — always land on Connection
  // (also guards a stale "voices" section when the capability changes).
  useEffect(() => {
    setSection("connection");
  }, [provider.providerId]);

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

  // Applicable models for the active capability only (voices separated into
  // their own section — never mixed into the model list).
  const capabilityModels = useMemo(
    () =>
      models
        .filter(
          (m) =>
            m.capability === capability &&
            m.kind !== "voice" &&
            APPLICABLE_MODEL_KINDS[capability].includes(m.kind),
        )
        .sort(
          (a, b) =>
            Number(b.isDefault) - Number(a.isDefault) ||
            a.kind.localeCompare(b.kind) ||
            a.displayName.localeCompare(b.displayName),
        ),
    [models, capability],
  );
  const voiceModels = useMemo(
    () =>
      models
        .filter((m) => m.capability === capability && m.kind === "voice")
        .sort(
          (a, b) =>
            Number(b.isDefault) - Number(a.isDefault) || a.displayName.localeCompare(b.displayName),
        ),
    [models, capability],
  );
  // Voices only exist for the speech capabilities and only surface in those
  // tabs' half-canvas (never in Chat).
  const showVoices = capability !== "chat";

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

  const toggleRealtimeEnabled = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const next = !realtimeEnabled;
      await patchProvider(provider.providerId, { realtimeEnabled: next });
      setRealtimeEnabled(next);
      setMessage(next ? "ElevenLabs realtime voice enabled." : "ElevenLabs realtime voice disabled.");
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

  const isPlatformDefault = defaults.find((d) => d.capability === capability)?.providerId === provider.providerId;

  const drawerSections: Array<{ id: DrawerSection; label: string; count?: number }> = [
    { id: "connection", label: "Connection" },
    { id: "capabilities", label: "Capabilities" },
    { id: "models", label: "Models", count: capabilityModels.length },
    ...(showVoices ? [{ id: "voices" as const, label: "Voices", count: voiceModels.length }] : []),
    { id: "health", label: "Health" },
    { id: "usage", label: "Usage" },
  ];

  return (
    <ContextDrawer
      open
      onClose={onClose}
      width="sm:w-[32rem]"
      title={
        <span className="flex flex-wrap items-center gap-2.5">
          {provider.displayName}
          {isPlatformDefault && <VersionBadge tone="primary">Platform default</VersionBadge>}
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
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <WorkspaceButton variant={enabled ? "danger" : "primary"} onClick={toggleEnabled} disabled={busy}>
            {enabled ? "Disable provider" : "Enable provider"}
          </WorkspaceButton>
          {message && <p className="min-w-0 flex-1 basis-full truncate text-xs text-muted-foreground sm:basis-auto" title={message}>{message}</p>}
        </div>
      }
    >
      <WorkspaceTabs tabs={drawerSections} active={section} onChange={setSection} />

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
                className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/80 focus:border-primary/40"
              />
              <span className="mt-1 block text-[11px] text-muted-foreground/80">
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
                  placeholder={BASE_URL_PLACEHOLDERS[provider.credential.baseUrlEnvKey] ?? "https://api.example.com"}
                  className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/80 focus:border-primary/40"
                />
                <span className="mt-1 block text-[11px] text-muted-foreground/80">
                  Leave empty to use the provider's official endpoint. Only set a proxy you know is reachable — never the placeholder example.
                </span>
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
            {provider.providerId === "elevenlabs" && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Clara Realtime Voice</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground/80">
                      Controls the Clara-controlled ElevenLabs realtime transport independently from Voice Chat.
                      Uses Scribe v2 Realtime for STT and Flash v2.5 streaming TTS; Clara keeps the LLM, RAG,
                      memory and tools.
                    </p>
                  </div>
                  <WorkspaceButton
                    variant={realtimeEnabled ? "danger" : "primary"}
                    onClick={toggleRealtimeEnabled}
                    disabled={busy || !provider.configured || !enabled}
                  >
                    {realtimeEnabled ? "Disable realtime" : "Enable realtime"}
                  </WorkspaceButton>
                </div>
                {!provider.configured && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Configure the ElevenLabs API key before enabling realtime voice.
                  </p>
                )}
              </div>
            )}
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
            <p className="text-xs text-muted-foreground">
              {capabilityModels.length} applicable {capabilityModels.length === 1 ? "model" : "models"} for {CAPABILITY_META[capability].label}
              {voiceModels.length > 0 && ` — voices are listed separately`}
            </p>
            {capabilityModels.length === 0 && (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground/70">
                No applicable models for this capability.
              </p>
            )}
            {capabilityModels.length > 0 && (
              <ul className="divide-y divide-border/60 rounded-xl border border-border bg-card">
                {capabilityModels.map((model) => (
                  <CatalogueRow
                    key={model.id}
                    model={model}
                    busy={busy}
                    onToggle={toggleModel}
                    onSetDefault={setModelDefault}
                  />
                ))}
              </ul>
            )}
          </div>
        )}

        {section === "voices" && showVoices && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {voiceModels.length} {voiceModels.length === 1 ? "voice" : "voices"} for {CAPABILITY_META[capability].label} — live vendor voices are synced when the provider exposes a voice catalogue; otherwise the provider contract catalogue is used. The default
              voice is used when an agent doesn’t pin one.
            </p>
            {voiceModels.length === 0 && (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground/70">
                No voices catalogued for this capability — this provider manages voice selection through its own settings.
              </p>
            )}
            {voiceModels.length > 0 && (
              <ul className="divide-y divide-border/60 rounded-xl border border-border bg-card">
                {voiceModels.map((model) => (
                  <CatalogueRow
                    key={model.id}
                    model={model}
                    busy={busy}
                    onToggle={toggleModel}
                    onSetDefault={setModelDefault}
                  />
                ))}
              </ul>
            )}
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
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">Requests</p>
                  <p className="mt-1 font-medium text-foreground">{(usage?.requests ?? 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">Cost</p>
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
                className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/80 focus:border-primary/40"
              />
              <span className="mt-1 block text-[11px] text-muted-foreground/80">
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

// ─── Catalogue row (models + voices) ──────────────────────────────────────────
// Full names are always visible: no truncation, the kind/model ids wrap, and
// the row stacks vertically on narrow (mobile) widths instead of squeezing.

function CatalogueRow({
  model,
  busy,
  onToggle,
  onSetDefault,
}: {
  model: ProviderModelDTO;
  busy: boolean;
  onToggle: (model: ProviderModelDTO) => void;
  onSetDefault: (model: ProviderModelDTO) => void;
}) {
  return (
    <li className="flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="min-w-0 sm:flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="break-words text-sm font-medium text-foreground/90">{model.displayName}</span>
          {model.isDefault && <VersionBadge tone="primary">Default</VersionBadge>}
          {model.metadata?.catalogSource === "vendor_live" && <VersionBadge tone="success">Live</VersionBadge>}
          {model.metadata?.catalogSource !== "vendor_live" && <VersionBadge tone="muted">Vendor catalog</VersionBadge>}
        </div>
        <p className="mt-1 break-all font-mono text-[11px] leading-relaxed text-muted-foreground/80">
          {KIND_LABELS[model.kind] ?? model.kind} · {model.modelId}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-center">
        <WorkspaceButton variant="ghost" onClick={() => void onSetDefault(model)} disabled={busy || model.isDefault}>
          Set default
        </WorkspaceButton>
        <button
          type="button"
          onClick={() => void onToggle(model)}
          disabled={busy}
          aria-label={model.enabled ? "Disable" : "Enable"}
          className={cn(
            "relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50",
            model.enabled ? "bg-primary" : "bg-muted",
          )}
        >
          <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", model.enabled ? "left-[1.15rem]" : "left-0.5")} />
        </button>
      </div>
    </li>
  );
}
