"use client";

import { useEffect, useState } from "react";
import type { OrgAISettings } from "@/modules/admin-ui/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";

type Props = {
  orgName: string;
  settings: OrgAISettings | null;
  onSave: (
    data: Partial<Omit<OrgAISettings, "id" | "orgId" | "createdAt" | "updatedAt">>,
  ) => Promise<OrgAISettings>;
};

type Draft = {
  // Identity
  assistantName: string;
  avatarUrl: string;
  // Behaviour
  systemPrompt: string;
  welcomeMessage: string;
  outOfScopeReply: string;
  rules: string;
  // Language
  defaultLanguage: string;
  allowedLanguages: string;
  alwaysRespondIn: string;
  // Voice
  voiceId: string;
  voiceSpeed: string;
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

function parseOptionalFloat(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function toDraft(settings: OrgAISettings | null): Draft {
  return {
    // Identity
    assistantName: settings?.assistantName ?? "",
    avatarUrl: settings?.avatarUrl ?? "",
    // Behaviour
    systemPrompt: settings?.systemPrompt ?? "",
    welcomeMessage: settings?.welcomeMessage ?? "",
    outOfScopeReply: settings?.outOfScopeReply ?? "",
    rules: Array.isArray(settings?.rules) ? settings.rules.join("\n") : settings?.rules ?? "",
    // Language
    defaultLanguage: settings?.defaultLanguage ?? "en",
    allowedLanguages: toCsv(settings?.allowedLanguages ?? undefined),
    alwaysRespondIn: settings?.alwaysRespondIn ?? "",
    // Voice
    voiceId: settings?.voiceId ?? "",
    voiceSpeed: settings?.voiceSpeed != null ? String(settings.voiceSpeed) : "1.0",
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

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      const voiceSpeed = parseOptionalFloat(draft.voiceSpeed);
      if (Number.isNaN(voiceSpeed)) {
        throw new Error("Voice speed must be a number (e.g., 1.0, 1.5, 0.8).");
      }
      if (voiceSpeed != null && (voiceSpeed < 0.25 || voiceSpeed > 4.0)) {
        throw new Error("Voice speed must be between 0.25 and 4.0.");
      }

      const rulesArray = draft.rules
        .split("\n")
        .map((r) => r.trim())
        .filter(Boolean);

      await onSave({
        // Identity
        assistantName: emptyToNull(draft.assistantName),
        avatarUrl: emptyToNull(draft.avatarUrl),
        // Behaviour
        systemPrompt: emptyToNull(draft.systemPrompt),
        welcomeMessage: emptyToNull(draft.welcomeMessage),
        outOfScopeReply: emptyToNull(draft.outOfScopeReply),
        rules: rulesArray,
        // Language
        defaultLanguage: emptyToNull(draft.defaultLanguage) ?? "en",
        allowedLanguages: parseCsv(draft.allowedLanguages),
        alwaysRespondIn: emptyToNull(draft.alwaysRespondIn),
        // Voice
        voiceId: emptyToNull(draft.voiceId),
        voiceSpeed,
      });

      setSaved(true);
      toast.success("Saved organisation settings", {
        description: `${orgName} identity, behaviour, language & voice updated. AI model configuration is centralized at platform level.`,
      });
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      toast.error("Could not save organisation settings", {
        description: message,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-border shadow-soft">
      <CardHeader>
        <CardTitle className="text-lg">Org Identity, Behaviour, Language & Voice</CardTitle>
        <CardDescription>
          Configure this organisation&apos;s assistant persona. AI model selection, token limits, provider config, and feature flags are centralized at the platform admin level and apply to all organisations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Identity Section */}
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">🎭 Identity</h3>
            <p className="text-xs text-muted-foreground">
              The assistant&apos;s name and avatar shown to end users.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Assistant Name">
              <Input
                value={draft.assistantName}
                onChange={(event) => setField("assistantName", event.target.value)}
                placeholder="Clara Assistant"
              />
            </Field>
            <Field label="Avatar URL">
              <Input
                value={draft.avatarUrl}
                onChange={(event) => setField("avatarUrl", event.target.value)}
                placeholder="https://example.com/avatar.png"
              />
            </Field>
          </div>
        </section>

        {/* Behaviour Section */}
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">🧠 Behaviour</h3>
            <p className="text-xs text-muted-foreground">
              System prompt and conversational behaviour settings.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-1">
            <Field label="System Prompt" hint="Core instructions for the assistant&apos;s behaviour and personality.">
              <Textarea
                rows={4}
                value={draft.systemPrompt}
                onChange={(event) => setField("systemPrompt", event.target.value)}
                placeholder="You are a helpful AI assistant for..."
              />
            </Field>
            <Field label="Welcome Message" hint="First message shown when a new chat starts.">
              <Input
                value={draft.welcomeMessage}
                onChange={(event) => setField("welcomeMessage", event.target.value)}
                placeholder="Hello! How can I help you today?"
              />
            </Field>
            <Field label="Out of Scope Reply" hint="Response when the assistant cannot answer from knowledge base.">
              <Input
                value={draft.outOfScopeReply}
                onChange={(event) => setField("outOfScopeReply", event.target.value)}
                placeholder="I don't have information about that topic."
              />
            </Field>
            <Field label="Rules" hint="Additional behavioural rules (one per line or comma-separated).">
              <Textarea
                rows={3}
                value={draft.rules}
                onChange={(event) => setField("rules", event.target.value)}
                placeholder="Never share personal information. Be concise. Use emojis sparingly."
              />
            </Field>
          </div>
        </section>

        {/* Language Section */}
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">🌐 Language</h3>
            <p className="text-xs text-muted-foreground">
              Default language and supported languages for this organisation.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Field label="Default Language" hint="ISO language code (e.g., en, es, fr, de, hi, ta).">
              <Input
                value={draft.defaultLanguage}
                onChange={(event) => setField("defaultLanguage", event.target.value)}
                placeholder="en"
              />
            </Field>
            <Field label="Allowed Languages" hint="Comma-separated ISO codes. Blank means all languages allowed.">
              <Input
                value={draft.allowedLanguages}
                onChange={(event) => setField("allowedLanguages", event.target.value)}
                placeholder="en, es, fr, de, hi, ta"
              />
            </Field>
            <Field label="Always Respond In" hint="Force responses in specific language (ISO code). Blank = user's language.">
              <Input
                value={draft.alwaysRespondIn}
                onChange={(event) => setField("alwaysRespondIn", event.target.value)}
                placeholder="en"
              />
            </Field>
          </div>
        </section>

        {/* Voice Section */}
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">🎙️ Voice</h3>
            <p className="text-xs text-muted-foreground">
              Voice settings for realtime and TTS. Model selection is centralized at platform level.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Voice ID" hint="Voice ID from the active platform provider (OpenAI: alloy, echo, fable, onyx, nova, shimmer | Gemini: Puck, Charon, Kore, Fenrir, Aoede).">
              <Input
                value={draft.voiceId}
                onChange={(event) => setField("voiceId", event.target.value)}
                placeholder="alloy"
              />
            </Field>
            <Field label="Voice Speed" hint="Playback speed (0.25 to 4.0). 1.0 = normal.">
              <Input
                inputMode="decimal"
                value={draft.voiceSpeed}
                onChange={(event) => setField("voiceSpeed", event.target.value)}
                placeholder="1.0"
              />
            </Field>
          </div>
        </section>

        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-3 shadow-soft">
          <div className="text-sm">
            {error && <span className="text-destructive">{error}</span>}
            {saved && <span className="text-success">Saved organisation settings.</span>}
            {!error && !saved && (
              <span className="text-muted-foreground">Changes apply immediately to future requests and sessions.</span>
            )}
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
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
