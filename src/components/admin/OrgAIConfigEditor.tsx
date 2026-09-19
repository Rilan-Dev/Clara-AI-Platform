"use client";

/**
 * src/components/admin/OrgAIConfigEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The AI provider / model / voice configuration editor for an organisation.
 *
 * This is the reference implementation of the settings design language
 * (src/components/admin/settings-ui.tsx): sectioned card, selectable provider
 * cards, model dropdowns with pricing metadata, friendly toggles and one
 * Save bar. The platform-level settings editors reuse the same kit.
 *
 *   🧠 Brain provider  — which LLM powers chat + embeddings + RAG
 *                         (OpenAI / Gemini; per-provider default models)
 *   🎙️ Voice provider — who speaks & listens
 *                         (Follow brain / OpenAI Realtime / Gemini Live /
 *                          ElevenLabs hybrid pipeline)
 *   ⚙️ Limits & features — token caps, temperature cap, feature flags
 *
 * Every dropdown draws from the canonical model catalogues
 * (src/modules/ai-core/model-catalog.ts + voice-core/model-catalog.ts via
 * ai-settings-options.ts), so the WS-0.4 "chat model in the embedding
 * field" class of defect is blocked at entry here too.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Sparkles, Volume2, SlidersHorizontal, Mic, AudioLines, Phone, Languages } from "lucide-react";
import type { OrgAISettings, AIProvider, VoiceProvider } from "@/modules/admin-ui/api";
import { apiUrl } from "@/lib/runtime";
import { withAuthHeaders } from "@/lib/client-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import {
  SettingsSection, OptionCardGrid, ModelSelect, TextField, FeatureToggle, AllowedRow, SaveBar,
} from "@/components/admin/settings-ui";
import {
  BRAIN_PROVIDERS,
  openaiChatOptions, geminiChatOptions, sarvamChatOptions,
  openaiEmbeddingOptions, geminiEmbeddingOptions,
  realtimeOptions, transcriptionOptions, elevenlabsTtsOptions, elevenlabsSttOptions,
  sarvamTtsOptions, sarvamSttOptions, sarvamSpeakerOptions,
} from "@/components/admin/ai-settings-options";

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
  realtimeVoiceProvider: VoiceProvider | null;
  elevenlabsTtsModel: string;
  elevenlabsSttModel: string;
  defaultElevenlabsVoice: string;
  sarvamTtsModel: string;
  sarvamSttModel: string;
  defaultSarvamSpeaker: string;
  translationMode: "off" | "query" | "query+answer";
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

const VOICE_PROVIDER_OPTIONS: { id: VoiceProvider | "inherit"; label: string; blurb: string }[] = [
  { id: "inherit",     label: "Follow brain provider", blurb: "Same provider as chat (OpenAI Realtime / Gemini Live)" },
  { id: "elevenlabs",  label: "ElevenLabs (hybrid)",   blurb: "Best-in-class voices. Documents & KBs stay inside Clara." },
  { id: "sarvam",      label: "Sarvam AI (Indic)",     blurb: "Saaras + Bulbul — 22 Indian languages, 37 speakers. Documents & KBs stay inside Clara." },
  { id: "openai",      label: "OpenAI Realtime",       blurb: "Force OpenAI Realtime even if chat uses Gemini" },
  { id: "gemini",      label: "Gemini Live",           blurb: "Force Gemini Live even if chat uses OpenAI" },
];

/** Realtime voice-assistant purpose (floating voice modal, embed voice,
 *  Agents, phone) — "inherit" follows the voice-chat provider above. */
const REALTIME_PROVIDER_OPTIONS: { id: VoiceProvider | "inherit"; label: string; blurb: string }[] = [
  { id: "inherit",     label: "Follow voice provider",   blurb: "Same provider as voice chat above — one pick, everything native" },
  { id: "elevenlabs",  label: "ElevenLabs Agents",       blurb: "Real-time streaming conversations (Mode B) with the ElevenLabs agent — needs an acknowledged agent binding" },
  { id: "sarvam",      label: "Sarvam pipeline",         blurb: "Saaras STT + Bulbul TTS pipeline with optional realtime partial-transcript streaming (live captions, early barge-in)" },
  { id: "openai",      label: "OpenAI Realtime",         blurb: "The floating voice assistant runs on OpenAI Realtime" },
  { id: "gemini",      label: "Gemini Live",             blurb: "The floating voice assistant runs on Gemini Live" },
];

function toDraft(settings: OrgAISettings | null): Draft {
  return {
    defaultProvider: settings?.defaultProvider ?? null,
    allowedProviders: settings?.allowedProviders ?? ["openai", "gemini"],
    voiceProvider: settings?.voiceProvider ?? null,
    allowedVoiceProviders: settings?.allowedVoiceProviders ?? ["openai", "gemini", "elevenlabs"],
    realtimeVoiceProvider: settings?.realtimeVoiceProvider ?? null,
    elevenlabsTtsModel: settings?.elevenlabsTtsModel ?? "",
    elevenlabsSttModel: settings?.elevenlabsSttModel ?? "",
    defaultElevenlabsVoice: settings?.defaultElevenlabsVoice ?? "",
    sarvamTtsModel: settings?.sarvamTtsModel ?? "",
    sarvamSttModel: settings?.sarvamSttModel ?? "",
    defaultSarvamSpeaker: settings?.defaultSarvamSpeaker ?? "",
    translationMode: settings?.translationMode ?? "off",
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

  const activeProvider =
    draft.defaultProvider === "gemini" ? "gemini"
    : draft.defaultProvider === "sarvam" ? "sarvam"
    : "openai";

  const chatModelOptions = useMemo(
    () =>
      activeProvider === "gemini" ? geminiChatOptions()
      : activeProvider === "sarvam" ? sarvamChatOptions()
      : openaiChatOptions(),
    [activeProvider],
  );
  // Sarvam publishes no embeddings API — embeddings always run on the
  // backbone (SARVAM_EMBEDDING_FALLBACK_PROVIDER, platform-configured).
  const embeddingModelOptions = useMemo(
    () => (activeProvider === "gemini" ? geminiEmbeddingOptions() : openaiEmbeddingOptions()),
    [activeProvider],
  );
  const realtimeModelOptions = useMemo(() => realtimeOptions(activeProvider), [activeProvider]);
  const transcriptionModelOptions = useMemo(() => transcriptionOptions(activeProvider), [activeProvider]);

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
        realtimeVoiceProvider: draft.realtimeVoiceProvider,
        elevenlabsTtsModel: draft.elevenlabsTtsModel.trim() || null,
        elevenlabsSttModel: draft.elevenlabsSttModel.trim() || null,
        defaultElevenlabsVoice: draft.defaultElevenlabsVoice.trim() || null,
        sarvamTtsModel: draft.sarvamTtsModel.trim() || null,
        sarvamSttModel: draft.sarvamSttModel.trim() || null,
        defaultSarvamSpeaker: draft.defaultSarvamSpeaker.trim() || null,
        translationMode: draft.translationMode,
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
        <SettingsSection
          icon={<Sparkles />}
          title="Thinking provider (chat & knowledge)"
        >
          <OptionCardGrid
            options={BRAIN_PROVIDERS.map((p) => ({ id: p.id, label: p.label, blurb: p.blurb }))}
            value={draft.defaultProvider}
            onChange={(id) => setField("defaultProvider", (id as AIProvider | null))}
          />
          <AllowedRow
            caption="Organisation can switch between:"
            items={BRAIN_PROVIDERS.map((p) => ({ id: p.id, label: p.label }))}
            checkedIds={draft.allowedProviders}
            onToggle={(id) => setField("allowedProviders", toggleProvider(draft.allowedProviders, id as AIProvider))}
          />
        </SettingsSection>

        {/* ── Default models per active brain provider ────────────────────── */}
        <SettingsSection
          title={`Default models — ${activeProvider === "gemini" ? "Gemini" : "OpenAI"}`}
          description="Starting models for this organisation. Agents and knowledge bases can override these."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <ModelSelect
              label="Chat model"
              hint="Powers every assistant reply."
              value={draft.defaultChatModel}
              onChange={(value) => setField("defaultChatModel", value)}
              options={chatModelOptions}
            />
            <ModelSelect
              label="Embedding model"
              hint="Turns documents into searchable vectors."
              value={draft.defaultEmbeddingModel}
              onChange={(value) => setField("defaultEmbeddingModel", value)}
              options={embeddingModelOptions}
            />
            <ModelSelect
              label="Realtime model"
              hint="Live voice sessions (non-ElevenLabs voice)."
              value={draft.defaultRealtimeModel}
              onChange={(value) => setField("defaultRealtimeModel", value)}
              options={realtimeModelOptions}
            />
            <ModelSelect
              label="Transcription model"
              hint="Speech-to-text inside realtime sessions."
              value={draft.defaultTranscriptionModel}
              onChange={(value) => setField("defaultTranscriptionModel", value)}
              options={transcriptionModelOptions}
            />
          </div>
        </SettingsSection>

        {/* ── Voice provider ──────────────────────────────────────────────── */}
        <SettingsSection
          icon={<Volume2 />}
          title="Voice provider (who speaks & listens)"
        >
          <OptionCardGrid
            options={VOICE_PROVIDER_OPTIONS.map((option) => ({
              id: option.id,
              label: option.label,
              blurb: option.blurb,
              badge:
                option.id === "elevenlabs" && elEnabled === false
                  ? { text: "Platform key missing", variant: "destructive" as const }
                  : undefined,
            }))}
            value={draft.voiceProvider ?? "inherit"}
            onChange={(id) => setField("voiceProvider", id === "inherit" ? null : (id as VoiceProvider))}
          />
          <AllowedRow
            caption="Organisation can use voices from:"
            items={[
              { id: "openai", label: "OpenAI" },
              { id: "gemini", label: "Gemini" },
              { id: "elevenlabs", label: "ElevenLabs" },
              { id: "sarvam", label: "Sarvam" },
            ]}
            checkedIds={draft.allowedVoiceProviders}
            onToggle={(id) =>
              setField("allowedVoiceProviders", toggleVoiceProvider(draft.allowedVoiceProviders, id as VoiceProvider))
            }
          />

          {/* Realtime voice-assistant purpose — the floating voice modal,
              embed voice surfaces and phone Agents. Defaults to following
              the voice provider above, so one provider pick keeps every
              surface native; pinning it splits the purposes (e.g. chat +
              voice chat on OpenAI while real-time voice runs ElevenLabs). */}
          <div className="space-y-3 rounded-xl border border-border bg-muted/10 p-4">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold text-foreground">
                Real-time voice assistant provider
              </h4>
            </div>
            <p className="text-xs text-muted-foreground">
              Applies to the floating voice assistant, embedded voice demos and phone agents.
              Leave on “Follow voice provider” and everything stays on one provider automatically.
            </p>
            <OptionCardGrid
              options={REALTIME_PROVIDER_OPTIONS.map((option) => ({
                id: option.id,
                label: option.label,
                blurb: option.blurb,
                badge:
                  option.id === "elevenlabs" && elEnabled === false
                    ? { text: "Platform key missing", variant: "destructive" as const }
                    : undefined,
              }))}
              value={draft.realtimeVoiceProvider ?? "inherit"}
              onChange={(id) => setField("realtimeVoiceProvider", id === "inherit" ? null : (id as VoiceProvider))}
            />
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
                  options={elevenlabsTtsOptions()}
                />
                <ModelSelect
                  label="STT model (listening)"
                  hint="Scribe transcribes spoken questions."
                  value={draft.elevenlabsSttModel}
                  onChange={(value) => setField("elevenlabsSttModel", value)}
                  options={elevenlabsSttOptions()}
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

          {/* Sarvam specifics — static catalogue, no sync job by design */}
          {draft.voiceProvider === "sarvam" && (
            <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/[0.03] p-4">
              <div className="flex items-center gap-2">
                <AudioLines className="w-4 h-4 text-primary" />
                <h4 className="text-sm font-semibold text-foreground">Sarvam voice settings</h4>
              </div>
              <p className="text-xs text-muted-foreground">
                Indic pipeline: Saaras listens (22 Indian languages + English, tuned for 8 kHz phone
                audio), Bulbul speaks (37 speakers). Bulbul speakers are a fixed vendor catalogue —
                there is nothing to sync. When the platform enables the realtime relay, partial
                transcripts stream for live captions and faster barge-in.
              </p>
              <div className="grid gap-4 lg:grid-cols-3">
                <ModelSelect
                  label="TTS model (speaking)"
                  hint="Bulbul v3 recommended."
                  value={draft.sarvamTtsModel}
                  onChange={(value) => setField("sarvamTtsModel", value)}
                  options={sarvamTtsOptions()}
                />
                <ModelSelect
                  label="STT model (listening)"
                  hint="Saaras v3 default; v4 adds Global English tuning."
                  value={draft.sarvamSttModel}
                  onChange={(value) => setField("sarvamSttModel", value)}
                  options={sarvamSttOptions()}
                />
                <ModelSelect
                  label="Default speaker"
                  hint="37 static Bulbul speakers, gender-tagged."
                  value={draft.defaultSarvamSpeaker}
                  onChange={(value) => setField("defaultSarvamSpeaker", value)}
                  options={sarvamSpeakerOptions()}
                />
              </div>
            </div>
          )}

          {/* Cross-lingual RAG posture (Sarvam language services, V4) */}
          <div className="space-y-3 rounded-xl border border-border bg-muted/10 p-4">
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold text-foreground">Cross-lingual answers</h4>
            </div>
            <p className="text-xs text-muted-foreground">
              When the platform enables Sarvam language services, users can ask in their own language
              (including romanized Hinglish) against a knowledge base in another language. Clara
              identifies the language, translates the question, retrieves, and can translate the
              answer back sentence-by-sentence.
            </p>
            <OptionCardGrid
              options={[
                { id: "off", label: "Off", blurb: "Same-language questions and answers only (default — zero translation cost)" },
                { id: "query", label: "Translate questions", blurb: "Questions are translated for retrieval quality; answers stay in the knowledge base language" },
                { id: "query+answer", label: "Translate questions + answers", blurb: "Full round-trip: answers stream back in the user's language, sentence by sentence" },
              ]}
              value={draft.translationMode}
              onChange={(id) =>
                setField("translationMode", id === "query" || id === "query+answer" ? id : "off")
              }
            />
          </div>
        </SettingsSection>

        {/* ── Limits & features ───────────────────────────────────────────── */}
        <SettingsSection
          icon={<SlidersHorizontal />}
          title="Limits & features"
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <TextField
              label="Max chat tokens"
              hint="Longest written reply allowed. Blank = platform default."
              value={draft.maxChatTokens}
              onChange={(value) => setField("maxChatTokens", value)}
              placeholder="Platform default"
              inputMode="numeric"
            />
            <TextField
              label="Max realtime tokens"
              hint="Same cap for spoken replies. Blank = platform default."
              value={draft.maxRealtimeTokens}
              onChange={(value) => setField("maxRealtimeTokens", value)}
              placeholder="Platform default"
              inputMode="numeric"
            />
            <TextField
              label="Max temperature"
              hint="Creativity ceiling (0–2). Blank = platform default."
              value={draft.maxTemperature}
              onChange={(value) => setField("maxTemperature", value)}
              placeholder="Platform default"
              inputMode="decimal"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <FeatureToggle
              icon={<Mic />}
              label="Voice assistant"
              description="Microphone + spoken answers"
              checked={draft.enableVoice}
              onChange={(value) => setField("enableVoice", value)}
            />
            <FeatureToggle
              icon={<AudioLines />}
              label="Realtime sessions"
              description="Live two-way voice conversations"
              checked={draft.enableRealtime}
              onChange={(value) => setField("enableRealtime", value)}
            />
            <FeatureToggle
              icon={<Volume2 />}
              label="Public website embed"
              description="Chat widget on customer websites"
              checked={draft.enablePublicEmbed}
              onChange={(value) => setField("enablePublicEmbed", value)}
            />
          </div>
        </SettingsSection>

        <SaveBar
          error={error}
          saving={saving}
          onSave={handleSave}
          saveLabel="Save AI configuration"
          hint="Changes apply immediately to future requests and sessions."
        />
      </CardContent>
    </Card>
  );
}
