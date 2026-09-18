"use client";

/**
 * src/components/admin/OrgAIConfigEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The AI provider / model / voice configuration editor for an organisation.
 *
 * This restores the provider-switching surface that was lost in the admin
 * console redesign, extended with the ElevenLabs voice-provider axis:
 *
 *   🧠 Brain provider  — which LLM powers chat + embeddings + RAG
 *                         (OpenAI / Gemini; per-provider default models)
 *   🎙️ Voice provider — who speaks & listens
 *                         (Follow brain / OpenAI Realtime / Gemini Live /
 *                          ElevenLabs hybrid pipeline)
 *   ⚙️ Limits & features — token caps, temperature cap, feature flags
 *
 * Every dropdown draws from the canonical model catalogues
 * (src/modules/ai-core/model-catalog.ts + voice-core/model-catalog.ts),
 * so the WS-0.4 "chat model in the embedding field" class of defect is
 * blocked at entry here too.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Sparkles, Volume2, SlidersHorizontal, Mic, AudioLines } from "lucide-react";
import type { OrgAISettings, AIProvider, VoiceProvider } from "@/modules/admin-ui/api";
import {
  OPENAI_CHAT_MODELS,
  OPENAI_EMBEDDING_MODELS,
  GEMINI_CHAT_MODELS,
  GEMINI_EMBEDDING_MODELS,
} from "@/modules/ai-core/model-catalog";
import { ELEVENLABS_TTS_MODELS } from "@/modules/voice-core/model-catalog";
import { apiUrl } from "@/lib/runtime";
import { withAuthHeaders } from "@/lib/client-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";

// ─── Model option lists (labels carry pricing context) ───────────────────────

const OPENAI_REALTIME_MODELS = ["gpt-realtime-2.1-mini", "gpt-realtime-2.1", "gpt-4o-realtime-preview"];
const OPENAI_TRANSCRIPTION_MODELS = ["gpt-4o-mini-transcribe", "gpt-4o-transcribe", "whisper-1"];
const GEMINI_REALTIME_MODELS = ["gemini-2.5-flash-native-audio", "gemini-2.0-flash-live"];
const GEMINI_TRANSCRIPTION_MODELS = ["gemini-2.5-flash"];

type Props = {
  orgId: string;
  settings: OrgAISettings | null;
  onSave: (
    data: Partial<Omit<OrgAISettings, "id" | "orgId" | "createdAt" | "updatedAt">>,
  ) => Promise<OrgAISettings>;
};

type Draft = {
  defaultProvider: AIProvider | null;
  allowedProviders: AIProvider[];
  voiceProvider: VoiceProvider | null;
  allowedVoiceProviders: VoiceProvider[];
  elevenlabsTtsModel: string;
  elevenlabsSttModel: string;
  defaultElevenlabsVoice: string;
  defaultChatModel: string;
  defaultEmbeddingModel: string;
  defaultRealtimeModel: string;
  defaultTranscriptionModel: string;
  maxChatTokens: string;
  maxRealtimeTokens: string;
  maxTemperature: string;
  enableVoice: boolean;
  enableRealtime: boolean;
  enablePublicEmbed: boolean;
};

const BRAIN_PROVIDERS: { id: AIProvider; label: string; blurb: string }[] = [
  { id: "openai", label: "OpenAI", blurb: "GPT models — chat, embeddings, realtime" },
  { id: "gemini", label: "Google Gemini", blurb: "Gemini models — chat, embeddings, Live API" },
];

const VOICE_PROVIDER_OPTIONS: { id: VoiceProvider | "inherit"; label: string; blurb: string }[] = [
  { id: "inherit",     label: "Follow brain provider", blurb: "Same provider as chat (OpenAI Realtime / Gemini Live)" },
  { id: "elevenlabs",  label: "ElevenLabs (hybrid)",   blurb: "Best-in-class voices. Documents & KBs stay inside Clara." },
  { id: "openai",      label: "OpenAI Realtime",       blurb: "Force OpenAI Realtime even if chat uses Gemini" },
  { id: "gemini",      label: "Gemini Live",           blurb: "Force Gemini Live even if chat uses OpenAI" },
];

function toDraft(settings: OrgAISettings | null): Draft {
  return {
    defaultProvider: settings?.defaultProvider ?? null,
    allowedProviders: settings?.allowedProviders ?? ["openai", "gemini"],
    voiceProvider: settings?.voiceProvider ?? null,
    allowedVoiceProviders: settings?.allowedVoiceProviders ?? ["openai", "gemini", "elevenlabs"],
    elevenlabsTtsModel: settings?.elevenlabsTtsModel ?? "",
    elevenlabsSttModel: settings?.elevenlabsSttModel ?? "",
    defaultElevenlabsVoice: settings?.defaultElevenlabsVoice ?? "",
    defaultChatModel: settings?.defaultChatModel ?? "",
    defaultEmbeddingModel: settings?.defaultEmbeddingModel ?? "",
    defaultRealtimeModel: settings?.defaultRealtimeModel ?? "",
    defaultTranscriptionModel: settings?.defaultTranscriptionModel ?? "",
    maxChatTokens: settings?.maxChatTokens != null ? String(settings.maxChatTokens) : "",
    maxRealtimeTokens: settings?.maxRealtimeTokens != null ? String(settings.maxRealtimeTokens) : "",
    maxTemperature: settings?.maxTemperature != null ? String(settings.maxTemperature) : "",
    enableVoice: settings?.enableVoice ?? true,
    enableRealtime: settings?.enableRealtime ?? true,
    enablePublicEmbed: settings?.enablePublicEmbed ?? true,
  };
}

function optionalNumber(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function OrgAIConfigEditor({ orgId, settings, onSave }: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(settings));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ElevenLabs voice catalog (org-scoped) for the default-voice picker.
  const [elVoices, setElVoices] = useState<{ voiceId: string; name: string }[]>([]);
  const [elSyncing, setElSyncing] = useState(false);
  const [elEnabled, setElEnabled] = useState<boolean | null>(null);

  useEffect(() => { setDraft(toDraft(settings)); }, [settings]);

  const loadVoices = useCallback(async () => {
    try {
      const res = await fetch(apiUrl(`/api/voice/elevenlabs/voices?orgId=${encodeURIComponent(orgId)}`), {
        headers: withAuthHeaders(),
      });
      const data = await res.json().catch(() => ({})) as {
        voices?: { voiceId: string; name: string }[];
        enabled?: boolean;
        error?: string;
      };
      if (res.ok) {
        setElVoices(data.voices ?? []);
        setElEnabled(data.enabled ?? null);
      }
    } catch { /* catalog is optional — the picker falls back to manual id */ }
  }, [orgId]);

  useEffect(() => { void loadVoices(); }, [loadVoices]);

  const syncVoices = useCallback(async () => {
    setElSyncing(true);
    try {
      const res = await fetch(apiUrl("/api/voice/elevenlabs/voices/sync"), {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ orgId }),
      });
      const data = await res.json().catch(() => ({})) as { synced?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Sync failed (HTTP ${res.status})`);
      toast.success("ElevenLabs voices synced", {
        description: `${data.synced ?? 0} voices are now available to this organisation.`,
      });
      await loadVoices();
    } catch (e) {
      toast.error("Could not sync ElevenLabs voices", { description: (e as Error).message });
    } finally {
      setElSyncing(false);
    }
  }, [orgId, loadVoices]);

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleProvider(list: AIProvider[], provider: AIProvider): AIProvider[] {
    return list.includes(provider)
      ? list.filter((item) => item !== provider)
      : [...list, provider];
  }

  function toggleVoiceProvider(list: VoiceProvider[], provider: VoiceProvider): VoiceProvider[] {
    return list.includes(provider)
      ? list.filter((item) => item !== provider)
      : [...list, provider];
  }

  const chatModelOptions = useMemo(
    () => (draft.defaultProvider === "gemini" ? GEMINI_CHAT_MODELS : OPENAI_CHAT_MODELS),
    [draft.defaultProvider],
  );
  const embeddingModelOptions = useMemo(
    () => (draft.defaultProvider === "gemini" ? GEMINI_EMBEDDING_MODELS : OPENAI_EMBEDDING_MODELS),
    [draft.defaultProvider],
  );
  const realtimeModelOptions = useMemo(
    () => (draft.defaultProvider === "gemini" ? GEMINI_REALTIME_MODELS : OPENAI_REALTIME_MODELS),
    [draft.defaultProvider],
  );
  const transcriptionModelOptions = useMemo(
    () => (draft.defaultProvider === "gemini" ? GEMINI_TRANSCRIPTION_MODELS : OPENAI_TRANSCRIPTION_MODELS),
    [draft.defaultProvider],
  );

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const maxChatTokens = optionalNumber(draft.maxChatTokens);
      if (maxChatTokens === undefined) throw new Error("Max chat tokens must be a number.");
      const maxRealtimeTokens = optionalNumber(draft.maxRealtimeTokens);
      if (maxRealtimeTokens === undefined) throw new Error("Max realtime tokens must be a number.");
      const maxTemperature = optionalNumber(draft.maxTemperature);
      if (maxTemperature === undefined) throw new Error("Max temperature must be a number.");
      if (maxTemperature != null && (maxTemperature < 0 || maxTemperature > 2)) {
        throw new Error("Max temperature must be between 0 and 2.");
      }

      if (draft.defaultProvider && !draft.allowedProviders.includes(draft.defaultProvider)) {
        throw new Error("The default brain provider must be in the allowed providers list.");
      }
      if (draft.voiceProvider && !draft.allowedVoiceProviders.includes(draft.voiceProvider)) {
        throw new Error("The default voice provider must be in the allowed voice providers list.");
      }

      await onSave({
        defaultProvider: draft.defaultProvider,
        allowedProviders: draft.allowedProviders.length > 0 ? draft.allowedProviders : ["openai", "gemini"],
        voiceProvider: draft.voiceProvider,
        allowedVoiceProviders:
          draft.allowedVoiceProviders.length > 0
            ? draft.allowedVoiceProviders
            : ["openai", "gemini", "elevenlabs"],
        elevenlabsTtsModel: draft.elevenlabsTtsModel.trim() || null,
        elevenlabsSttModel: draft.elevenlabsSttModel.trim() || null,
        defaultElevenlabsVoice: draft.defaultElevenlabsVoice.trim() || null,
        defaultChatModel: draft.defaultChatModel.trim() || null,
        defaultEmbeddingModel: draft.defaultEmbeddingModel.trim() || null,
        defaultRealtimeModel: draft.defaultRealtimeModel.trim() || null,
        defaultTranscriptionModel: draft.defaultTranscriptionModel.trim() || null,
        maxChatTokens,
        maxRealtimeTokens,
        maxTemperature,
        enableVoice: draft.enableVoice,
        enableRealtime: draft.enableRealtime,
        enablePublicEmbed: draft.enablePublicEmbed,
      });

      toast.success("AI configuration saved", {
        description: "Provider, models, voices and limits apply to future requests immediately.",
      });
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      toast.error("Could not save AI configuration", { description: message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-border shadow-soft">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="w-5 h-5 text-primary" />
          AI Providers &amp; Models
        </CardTitle>
        <CardDescription>
          Which AI powers this organisation&apos;s thinking (chat, document understanding, retrieval) and
          which service powers its voice. Changing providers takes effect on the next request — no
          redeploy needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* ── Brain provider ──────────────────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Thinking provider (chat &amp; knowledge)</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {BRAIN_PROVIDERS.map((provider) => {
              const selected = draft.defaultProvider === provider.id;
              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => setField("defaultProvider", provider.id)}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{provider.label}</span>
                    {selected && <Badge variant="default" className="text-[10px]">Active</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{provider.blurb}</p>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-muted/20 px-4 py-3">
            <span className="text-xs font-medium text-muted-foreground">Organisation can switch between:</span>
            {BRAIN_PROVIDERS.map((provider) => (
              <label key={provider.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.allowedProviders.includes(provider.id)}
                  onCheckedChange={() => setField("allowedProviders", toggleProvider(draft.allowedProviders, provider.id))}
                />
                {provider.label}
              </label>
            ))}
          </div>
        </section>

        {/* ── Default models per active brain provider ────────────────────── */}
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Default models — {draft.defaultProvider === "gemini" ? "Gemini" : "OpenAI"}
            </h3>
            <p className="text-xs text-muted-foreground">
              Starting models for this organisation. Agents and knowledge bases can override these.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ModelSelect
              label="Chat model"
              hint="Powers every assistant reply."
              value={draft.defaultChatModel}
              onChange={(value) => setField("defaultChatModel", value)}
              options={chatModelOptions.map((model) => ({
                value: model.id,
                label: model.label ?? model.id,
                meta: model.inputUsdPerMTokens != null ? `$${model.inputUsdPerMTokens}/M in` : undefined,
              }))}
            />
            <ModelSelect
              label="Embedding model"
              hint="Turns documents into searchable vectors."
              value={draft.defaultEmbeddingModel}
              onChange={(value) => setField("defaultEmbeddingModel", value)}
              options={embeddingModelOptions.map((model) => ({
                value: model.id,
                label: model.id,
                meta: `${model.dimension} dims`,
              }))}
            />
            <ModelSelect
              label="Realtime model"
              hint="Live voice sessions (non-ElevenLabs voice)."
              value={draft.defaultRealtimeModel}
              onChange={(value) => setField("defaultRealtimeModel", value)}
              options={realtimeModelOptions.map((id) => ({ value: id, label: id }))}
            />
            <ModelSelect
              label="Transcription model"
              hint="Speech-to-text inside realtime sessions."
              value={draft.defaultTranscriptionModel}
              onChange={(value) => setField("defaultTranscriptionModel", value)}
              options={transcriptionModelOptions.map((id) => ({ value: id, label: id }))}
            />
          </div>
        </section>

        {/* ── Voice provider ──────────────────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Voice provider (who speaks &amp; listens)</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {VOICE_PROVIDER_OPTIONS.map((option) => {
              const selected =
                option.id === "inherit" ? draft.voiceProvider === null : draft.voiceProvider === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setField("voiceProvider", option.id === "inherit" ? null : option.id)}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{option.label}</span>
                    {option.id === "elevenlabs" && elEnabled === false && (
                      <Badge variant="destructive" className="text-[10px]">Platform key missing</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{option.blurb}</p>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-muted/20 px-4 py-3">
            <span className="text-xs font-medium text-muted-foreground">Organisation can use voices from:</span>
            {(["openai", "gemini", "elevenlabs"] as VoiceProvider[]).map((provider) => (
              <label key={provider} className="flex items-center gap-2 text-sm capitalize">
                <Checkbox
                  checked={draft.allowedVoiceProviders.includes(provider)}
                  onCheckedChange={() =>
                    setField("allowedVoiceProviders", toggleVoiceProvider(draft.allowedVoiceProviders, provider))
                  }
                />
                {provider === "elevenlabs" ? "ElevenLabs" : provider}
              </label>
            ))}
          </div>

          {/* ElevenLabs specifics */}
          {draft.voiceProvider === "elevenlabs" && (
            <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/[0.03] p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AudioLines className="w-4 h-4 text-primary" />
                  <h4 className="text-sm font-semibold text-foreground">ElevenLabs settings</h4>
                </div>
                <Button variant="outline" size="sm" onClick={syncVoices} disabled={elSyncing}>
                  <RefreshCw className={`mr-2 h-3.5 w-3.5 ${elSyncing ? "animate-spin" : ""}`} />
                  {elSyncing ? "Syncing…" : "Sync voices"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Hybrid mode: ElevenLabs handles speaking and listening; Clara&apos;s own AI answers the
                questions. Documents and knowledge bases never leave this platform.
              </p>
              <div className="grid gap-4 lg:grid-cols-3">
                <ModelSelect
                  label="TTS model (speaking)"
                  hint="Flash = lowest latency."
                  value={draft.elevenlabsTtsModel}
                  onChange={(value) => setField("elevenlabsTtsModel", value)}
                  options={ELEVENLABS_TTS_MODELS.map((model) => ({
                    value: model.modelId,
                    label: model.name,
                    meta: `$${model.usdPer1kChars}/1k chars`,
                  }))}
                />
                <ModelSelect
                  label="STT model (listening)"
                  hint="Scribe transcribes spoken questions."
                  value={draft.elevenlabsSttModel}
                  onChange={(value) => setField("elevenlabsSttModel", value)}
                  options={[{ value: "scribe_v1", label: "Scribe v1" }]}
                />
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Default voice</Label>
                  {elVoices.length > 0 ? (
                    <Select
                      value={draft.defaultElevenlabsVoice || undefined}
                      onValueChange={(value) => setField("defaultElevenlabsVoice", value)}
                    >
                      <SelectTrigger><SelectValue placeholder="Pick a synced voice" /></SelectTrigger>
                      <SelectContent>
                        {elVoices.map((voice) => (
                          <SelectItem key={voice.voiceId} value={voice.voiceId}>
                            {voice.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={draft.defaultElevenlabsVoice}
                      onChange={(event) => setField("defaultElevenlabsVoice", event.target.value)}
                      placeholder="Voice id — or press Sync voices"
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    {elVoices.length > 0
                      ? `${elVoices.length} synced voices.`
                      : "No synced voices yet — press Sync voices to pull them from your ElevenLabs workspace."}
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ── Limits & features ───────────────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Limits &amp; features</h3>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Max chat tokens</Label>
              <Input
                inputMode="numeric"
                value={draft.maxChatTokens}
                onChange={(event) => setField("maxChatTokens", event.target.value)}
                placeholder="Platform default"
              />
              <p className="text-xs text-muted-foreground">Longest written reply allowed. Blank = platform default.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Max realtime tokens</Label>
              <Input
                inputMode="numeric"
                value={draft.maxRealtimeTokens}
                onChange={(event) => setField("maxRealtimeTokens", event.target.value)}
                placeholder="Platform default"
              />
              <p className="text-xs text-muted-foreground">Same cap for spoken replies. Blank = platform default.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Max temperature</Label>
              <Input
                inputMode="decimal"
                value={draft.maxTemperature}
                onChange={(event) => setField("maxTemperature", event.target.value)}
                placeholder="Platform default"
              />
              <p className="text-xs text-muted-foreground">Creativity ceiling (0–2). Blank = platform default.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <FeatureToggle
              icon={<Mic className="w-4 h-4" />}
              label="Voice assistant"
              description="Microphone + spoken answers"
              checked={draft.enableVoice}
              onChange={(value) => setField("enableVoice", value)}
            />
            <FeatureToggle
              icon={<AudioLines className="w-4 h-4" />}
              label="Realtime sessions"
              description="Live two-way voice conversations"
              checked={draft.enableRealtime}
              onChange={(value) => setField("enableRealtime", value)}
            />
            <FeatureToggle
              icon={<Volume2 className="w-4 h-4" />}
              label="Public website embed"
              description="Chat widget on customer websites"
              checked={draft.enablePublicEmbed}
              onChange={(value) => setField("enablePublicEmbed", value)}
            />
          </div>
        </section>

        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-3 shadow-soft">
          <div className="text-sm">
            {error && <span className="text-destructive">{error}</span>}
            {!error && (
              <span className="text-muted-foreground">
                Changes apply immediately to future requests and sessions.
              </span>
            )}
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save AI configuration"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ModelSelect({
  label, hint, value, onChange, options,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; meta?: string }[];
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Platform default" /></SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <span className="flex items-center justify-between gap-3">
                <span>{option.label}</span>
                {option.meta && <span className="text-[10px] text-muted-foreground">{option.meta}</span>}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function FeatureToggle({
  icon, label, description, checked, onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/10 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-primary">{icon}</div>
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
