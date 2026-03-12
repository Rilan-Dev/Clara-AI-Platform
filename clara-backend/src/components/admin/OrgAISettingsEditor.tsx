"use client";

import { useEffect, useMemo, useState } from "react";
import type { AIProvider, OrgAISettings } from "@/modules/admin-ui/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  orgName: string;
  settings: OrgAISettings | null;
  onSave: (
    data: Partial<Omit<OrgAISettings, "id" | "orgId" | "createdAt" | "updatedAt">>,
  ) => Promise<OrgAISettings>;
};

type Draft = {
  defaultProvider: AIProvider | null;
  allowedProviders: AIProvider[];
  defaultChatModel: string;
  defaultEmbeddingModel: string;
  defaultRealtimeModel: string;
  defaultTranscriptionModel: string;
  maxChatTokens: string;
  maxRealtimeTokens: string;
  maxTemperature: string;
  enablePublicEmbed: boolean;
  enableVoice: boolean;
  enableRealtime: boolean;
  allowedChatModels: Record<AIProvider, string>;
  allowedEmbeddingModels: Record<AIProvider, string>;
  allowedRealtimeModels: Record<AIProvider, string>;
  allowedVoices: Record<AIProvider, string>;
};

function toCsv(values?: string[]): string {
  return (values ?? []).join(", ");
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.round(parsed) : Number.NaN;
}

function parseOptionalFloat(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function toDraft(settings: OrgAISettings | null): Draft {
  return {
    defaultProvider: settings?.defaultProvider ?? null,
    allowedProviders: settings?.allowedProviders ?? ["openai", "gemini"],
    defaultChatModel: settings?.defaultChatModel ?? "",
    defaultEmbeddingModel: settings?.defaultEmbeddingModel ?? "",
    defaultRealtimeModel: settings?.defaultRealtimeModel ?? "",
    defaultTranscriptionModel: settings?.defaultTranscriptionModel ?? "",
    maxChatTokens:
      settings?.maxChatTokens != null ? String(settings.maxChatTokens) : "",
    maxRealtimeTokens:
      settings?.maxRealtimeTokens != null ? String(settings.maxRealtimeTokens) : "",
    maxTemperature:
      settings?.maxTemperature != null ? String(settings.maxTemperature) : "",
    enablePublicEmbed: settings?.enablePublicEmbed ?? true,
    enableVoice: settings?.enableVoice ?? true,
    enableRealtime: settings?.enableRealtime ?? true,
    allowedChatModels: {
      openai: toCsv(settings?.allowedChatModels.openai),
      gemini: toCsv(settings?.allowedChatModels.gemini),
    },
    allowedEmbeddingModels: {
      openai: toCsv(settings?.allowedEmbeddingModels.openai),
      gemini: toCsv(settings?.allowedEmbeddingModels.gemini),
    },
    allowedRealtimeModels: {
      openai: toCsv(settings?.allowedRealtimeModels.openai),
      gemini: toCsv(settings?.allowedRealtimeModels.gemini),
    },
    allowedVoices: {
      openai: toCsv(settings?.allowedVoices.openai),
      gemini: toCsv(settings?.allowedVoices.gemini),
    },
  };
}

export function OrgAISettingsEditor({ orgName, settings, onSave }: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(settings));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(toDraft(settings));
  }, [settings]);

  const helperSummary = useMemo(() => {
    const providerLabel = draft.defaultProvider ? draft.defaultProvider : "platform default";
    return `${orgName} defaults to ${providerLabel} with ${draft.allowedProviders.join(" + ")} enabled.`;
  }, [draft.allowedProviders, draft.defaultProvider, orgName]);

  function toggleAllowedProvider(provider: AIProvider) {
    setDraft((current) => {
      const enabled = current.allowedProviders.includes(provider);
      return {
        ...current,
        allowedProviders: enabled
          ? current.allowedProviders.filter((item) => item !== provider)
          : [...current.allowedProviders, provider],
      };
    });
    setSaved(false);
  }

  function setScopedText(
    key: "allowedChatModels" | "allowedEmbeddingModels" | "allowedRealtimeModels" | "allowedVoices",
    provider: AIProvider,
    value: string,
  ) {
    setDraft((current) => ({
      ...current,
      [key]: {
        ...current[key],
        [provider]: value,
      },
    }));
    setSaved(false);
  }

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      if (draft.allowedProviders.length === 0) {
        throw new Error("At least one provider must remain enabled.");
      }

      const maxChatTokens = parseOptionalInteger(draft.maxChatTokens);
      if (Number.isNaN(maxChatTokens)) {
        throw new Error("Chat token cap must be a whole number or blank.");
      }

      const maxRealtimeTokens = parseOptionalInteger(draft.maxRealtimeTokens);
      if (Number.isNaN(maxRealtimeTokens)) {
        throw new Error("Realtime token cap must be a whole number or blank.");
      }

      const maxTemperature = parseOptionalFloat(draft.maxTemperature);
      if (Number.isNaN(maxTemperature)) {
        throw new Error("Max temperature must be a number between 0 and 1, or blank.");
      }
      if (maxTemperature != null && (maxTemperature < 0 || maxTemperature > 1)) {
        throw new Error("Max temperature must stay between 0 and 1.");
      }

      await onSave({
        defaultProvider: draft.defaultProvider,
        allowedProviders: draft.allowedProviders,
        allowedChatModels: {
          openai: parseCsv(draft.allowedChatModels.openai),
          gemini: parseCsv(draft.allowedChatModels.gemini),
        },
        allowedEmbeddingModels: {
          openai: parseCsv(draft.allowedEmbeddingModels.openai),
          gemini: parseCsv(draft.allowedEmbeddingModels.gemini),
        },
        allowedRealtimeModels: {
          openai: parseCsv(draft.allowedRealtimeModels.openai),
          gemini: parseCsv(draft.allowedRealtimeModels.gemini),
        },
        allowedVoices: {
          openai: parseCsv(draft.allowedVoices.openai),
          gemini: parseCsv(draft.allowedVoices.gemini),
        },
        defaultChatModel: emptyToNull(draft.defaultChatModel),
        defaultEmbeddingModel: emptyToNull(draft.defaultEmbeddingModel),
        defaultRealtimeModel: emptyToNull(draft.defaultRealtimeModel),
        defaultTranscriptionModel: emptyToNull(draft.defaultTranscriptionModel),
        maxChatTokens,
        maxRealtimeTokens,
        maxTemperature,
        enablePublicEmbed: draft.enablePublicEmbed,
        enableVoice: draft.enableVoice,
        enableRealtime: draft.enableRealtime,
      });

      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-border shadow-soft">
      <CardHeader>
        <CardTitle className="text-lg">Org AI Policy</CardTitle>
        <CardDescription>
          Control which providers, models, and voice features {orgName} can use. KB-specific overrides can only narrow or override what is allowed here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          {helperSummary}
        </div>

        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Provider policy</h3>
            <p className="text-xs text-muted-foreground">
              Choose the default runtime provider and which providers are available to this organisation.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Default Provider" hint="Auto means use the platform default from server env.">
              <ProviderModeSelector
                value={draft.defaultProvider}
                onChange={(value) => setField("defaultProvider", value)}
              />
            </Field>
            <Field label="Allowed Providers" hint="Knowledge bases can only choose from enabled providers.">
              <div className="flex flex-wrap gap-2">
                {(["openai", "gemini"] as const).map((provider) => {
                  const active = draft.allowedProviders.includes(provider);
                  return (
                    <button
                      key={provider}
                      type="button"
                      onClick={() => toggleAllowedProvider(provider)}
                      className={toggleButtonClass(active)}
                    >
                      {provider}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Default model routing</h3>
            <p className="text-xs text-muted-foreground">
              Leave blank to inherit the platform env default for that surface.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Default Chat Model">
              <Input
                value={draft.defaultChatModel}
                onChange={(event) => setField("defaultChatModel", event.target.value)}
                placeholder="gpt-4o-mini or gemini-2.5-flash"
              />
            </Field>
            <Field label="Default Embedding Model">
              <Input
                value={draft.defaultEmbeddingModel}
                onChange={(event) => setField("defaultEmbeddingModel", event.target.value)}
                placeholder="text-embedding-3-small"
              />
            </Field>
            <Field label="Default Realtime Model">
              <Input
                value={draft.defaultRealtimeModel}
                onChange={(event) => setField("defaultRealtimeModel", event.target.value)}
                placeholder="gpt-realtime-mini"
              />
            </Field>
            <Field label="Default Transcription Model">
              <Input
                value={draft.defaultTranscriptionModel}
                onChange={(event) => setField("defaultTranscriptionModel", event.target.value)}
                placeholder="gpt-4o-mini-transcribe"
              />
            </Field>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Allowlists</h3>
            <p className="text-xs text-muted-foreground">
              Enter comma-separated lists. Leave a box empty to allow any model or voice for that provider.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ScopedListField
              label="Allowed chat models"
              value={draft.allowedChatModels}
              onChange={(provider, value) => setScopedText("allowedChatModels", provider, value)}
            />
            <ScopedListField
              label="Allowed embedding models"
              value={draft.allowedEmbeddingModels}
              onChange={(provider, value) => setScopedText("allowedEmbeddingModels", provider, value)}
            />
            <ScopedListField
              label="Allowed realtime models"
              value={draft.allowedRealtimeModels}
              onChange={(provider, value) => setScopedText("allowedRealtimeModels", provider, value)}
            />
            <ScopedListField
              label="Allowed voices"
              value={draft.allowedVoices}
              onChange={(provider, value) => setScopedText("allowedVoices", provider, value)}
            />
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Limits and feature flags</h3>
            <p className="text-xs text-muted-foreground">
              These caps are enforced after KB-level settings resolve.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Field label="Max Chat Tokens" hint="Blank means no org-level cap.">
              <Input
                inputMode="numeric"
                value={draft.maxChatTokens}
                onChange={(event) => setField("maxChatTokens", event.target.value)}
                placeholder="1500"
              />
            </Field>
            <Field label="Max Realtime Tokens" hint="Blank means no org-level cap.">
              <Input
                inputMode="numeric"
                value={draft.maxRealtimeTokens}
                onChange={(event) => setField("maxRealtimeTokens", event.target.value)}
                placeholder="500"
              />
            </Field>
            <Field label="Max Temperature" hint="Blank means no org-level clamp.">
              <Input
                inputMode="decimal"
                value={draft.maxTemperature}
                onChange={(event) => setField("maxTemperature", event.target.value)}
                placeholder="0.7"
              />
            </Field>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <SwitchField
              label="Public Embed"
              description="Allow public API-key based chat and voice embedding."
              checked={draft.enablePublicEmbed}
              onChange={(value) => setField("enablePublicEmbed", value)}
            />
            <SwitchField
              label="Voice"
              description="Allow voice experiences for knowledge bases in this org."
              checked={draft.enableVoice}
              onChange={(value) => setField("enableVoice", value)}
            />
            <SwitchField
              label="Realtime"
              description="Allow realtime session creation for voice surfaces."
              checked={draft.enableRealtime}
              onChange={(value) => setField("enableRealtime", value)}
            />
          </div>
        </section>

        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-3 shadow-soft">
          <div className="text-sm">
            {error && <span className="text-destructive">{error}</span>}
            {saved && <span className="text-success">Saved organisation AI policy.</span>}
            {!error && !saved && (
              <span className="text-muted-foreground">Changes apply immediately to future requests and sessions.</span>
            )}
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save AI Policy"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProviderModeSelector({
  value,
  onChange,
}: {
  value: AIProvider | null;
  onChange: (value: AIProvider | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => onChange(null)} className={toggleButtonClass(value === null)}>
        Auto
      </button>
      <button type="button" onClick={() => onChange("openai")} className={toggleButtonClass(value === "openai")}>
        OpenAI
      </button>
      <button type="button" onClick={() => onChange("gemini")} className={toggleButtonClass(value === "gemini")}>
        Gemini
      </button>
    </div>
  );
}

function ScopedListField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Record<AIProvider, string>;
  onChange: (provider: AIProvider, value: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/10 p-4">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="mt-3 grid gap-3">
        {(["openai", "gemini"] as const).map((provider) => (
          <Field
            key={provider}
            label={provider === "openai" ? "OpenAI" : "Gemini"}
            hint="Comma-separated. Blank means unrestricted."
          >
            <Textarea
              rows={3}
              value={value[provider]}
              onChange={(event) => onChange(provider, event.target.value)}
              placeholder={provider === "openai" ? "gpt-4o-mini, gpt-4.1-mini" : "gemini-2.5-flash, gemini-2.0-flash"}
            />
          </Field>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function SwitchField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-3">
      <div className="pr-4">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function toggleButtonClass(active: boolean): string {
  return [
    "rounded-lg border px-3 py-2 text-sm font-medium transition-all",
    active
      ? "border-primary bg-primary/10 text-primary"
      : "border-border text-foreground hover:border-primary/40 hover:bg-muted/40",
  ].join(" ");
}
