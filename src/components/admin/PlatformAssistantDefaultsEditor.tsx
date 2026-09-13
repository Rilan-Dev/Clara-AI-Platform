"use client";

import { useEffect, useState } from "react";
import type { PlatformAssistantDefaults } from "@/modules/admin-ui/api";
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
  defaults: PlatformAssistantDefaults | null;
  onSave: (
    data: Partial<Omit<PlatformAssistantDefaults, "id" | "updatedAt">>,
  ) => Promise<PlatformAssistantDefaults>;
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

function toDraft(defaults: PlatformAssistantDefaults | null): Draft {
  return {
    // Identity
    assistantName: defaults?.assistantName ?? "Clara",
    avatarUrl: defaults?.avatarUrl ?? "",
    // Behaviour
    systemPrompt: defaults?.systemPrompt ?? "",
    welcomeMessage: defaults?.welcomeMessage ?? "",
    outOfScopeReply: defaults?.outOfScopeReply ?? "",
    rules: Array.isArray(defaults?.rules) ? defaults.rules.join("\n") : "",
    // Language
    defaultLanguage: defaults?.defaultLanguage ?? "en",
    allowedLanguages: toCsv(defaults?.allowedLanguages ?? undefined),
    alwaysRespondIn: defaults?.alwaysRespondIn ?? "",
    // Voice
    voiceId: defaults?.voiceId ?? "",
    voiceSpeed: defaults?.voiceSpeed != null ? String(defaults.voiceSpeed) : "1.0",
  };
}

/**
 * Platform-level assistant defaults editor (super admin).
 *
 * The values here are the STARTING POINT for newly onboarding projects and
 * agents — they are copied onto each new record at creation time. Existing
 * projects and agents keep the values their organisations already own, so
 * changing anything here never rewrites them.
 */
export function PlatformAssistantDefaultsEditor({ defaults, onSave }: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(defaults));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(toDraft(defaults));
  }, [defaults]);

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      const assistantName = draft.assistantName.trim();
      if (!assistantName) throw new Error("Assistant name cannot be empty.");

      const defaultLanguage = draft.defaultLanguage.trim().toLowerCase();
      if (!defaultLanguage) throw new Error("Default language cannot be empty.");

      const allowedLanguages = parseCsv(draft.allowedLanguages).map((l) => l.toLowerCase());
      if (allowedLanguages.length === 0) {
        throw new Error("Allowed languages must have at least one language (e.g., en).");
      }

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
        assistantName,
        avatarUrl: emptyToNull(draft.avatarUrl),
        // Behaviour
        systemPrompt: draft.systemPrompt,
        welcomeMessage: draft.welcomeMessage,
        outOfScopeReply: draft.outOfScopeReply,
        rules: rulesArray,
        // Language
        defaultLanguage,
        allowedLanguages,
        alwaysRespondIn: emptyToNull(draft.alwaysRespondIn),
        // Voice
        voiceId: emptyToNull(draft.voiceId),
        voiceSpeed,
      });

      setSaved(true);
      toast.success("Saved platform defaults", {
        description:
          "Newly onboarding projects and agents will start with these values. Existing ones keep their own settings.",
      });
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      toast.error("Could not save platform defaults", {
        description: message,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-border shadow-soft">
      <CardHeader>
        <CardTitle className="text-lg">Default Identity, Behaviour, Language &amp; Voice</CardTitle>
        <CardDescription>
          Platform-wide starting values for every new project and agent. They are copied onto each
          record the moment it is created — organisations can then customise their own copy, and
          existing projects and agents are never touched when you change anything here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Identity Section */}
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">🎭 Identity</h3>
            <p className="text-xs text-muted-foreground">
              The assistant name and avatar new projects and agents start with.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Assistant Name">
              <Input
                value={draft.assistantName}
                onChange={(event) => setField("assistantName", event.target.value)}
                placeholder="Clara"
              />
            </Field>
            <Field label="Avatar URL" hint="Optional. Leave blank for the default look.">
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
              The starting personality and reply style for newly onboarding assistants.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-1">
            <Field label="System Prompt" hint="Core instructions for the assistant's behaviour and personality.">
              <Textarea
                rows={4}
                value={draft.systemPrompt}
                onChange={(event) => setField("systemPrompt", event.target.value)}
                placeholder="You are Clara, a helpful voice assistant..."
              />
            </Field>
            <Field label="Welcome Message" hint="First message shown when a new chat starts.">
              <Input
                value={draft.welcomeMessage}
                onChange={(event) => setField("welcomeMessage", event.target.value)}
                placeholder="Hello! How can I help you today?"
              />
            </Field>
            <Field label="Out of Scope Reply" hint="Response when the assistant cannot answer from its knowledge base.">
              <Input
                value={draft.outOfScopeReply}
                onChange={(event) => setField("outOfScopeReply", event.target.value)}
                placeholder="I can only answer questions about the topics I have been set up for."
              />
            </Field>
            <Field label="Rules" hint="Starting behavioural rules (one per line).">
              <Textarea
                rows={3}
                value={draft.rules}
                onChange={(event) => setField("rules", event.target.value)}
                placeholder="Never share personal information. Be concise."
              />
            </Field>
          </div>
        </section>

        {/* Language Section */}
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">🌐 Language</h3>
            <p className="text-xs text-muted-foreground">
              Starting language setup for newly onboarding projects and agents.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Field label="Default Language" hint="ISO language code (e.g., en, si, ta).">
              <Input
                value={draft.defaultLanguage}
                onChange={(event) => setField("defaultLanguage", event.target.value)}
                placeholder="en"
              />
            </Field>
            <Field label="Allowed Languages" hint="Comma-separated ISO codes. At least one is required.">
              <Input
                value={draft.allowedLanguages}
                onChange={(event) => setField("allowedLanguages", event.target.value)}
                placeholder="en, si, ta"
              />
            </Field>
            <Field label="Always Respond In" hint="Force responses in one language (ISO code). Blank = follow the user.">
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
              Starting voice for new assistants. Model selection stays centralised at platform level.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Voice ID" hint="Blank = provider default. OpenAI: alloy, echo, coral, nova... | Gemini: Puck, Kore, Aoede...">
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
            {saved && <span className="text-success">Saved platform defaults.</span>}
            {!error && !saved && (
              <span className="text-muted-foreground">
                Applies to newly onboarding projects and agents only — existing ones keep their own values.
              </span>
            )}
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Defaults"}
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
