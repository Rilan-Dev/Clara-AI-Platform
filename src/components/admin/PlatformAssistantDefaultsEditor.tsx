"use client";

/**
 * src/components/admin/PlatformAssistantDefaultsEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform-level assistant defaults editor (super admin) — restyled with the
 * shared settings design language (settings-ui.tsx), the same UX as the
 * "AI Providers & Models" editor: sectioned card, friendly dropdowns, chip
 * multi-selects, one Save bar.
 *
 * The values here are the STARTING POINT for newly onboarding agents — they
 * are copied onto each new record at creation time. Existing agents keep the
 * values their organisations already own, so changing anything here never
 * rewrites them.
 */

import { useEffect, useState } from "react";
import { Bot, UserRound, BrainCircuit, Globe, Volume2 } from "lucide-react";
import type { PlatformAssistantDefaults } from "@/modules/admin-ui/api";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import {
  SettingsSection, TextField, TextAreaField, ModelSelect, GroupedModelSelect, ToggleChipRow, SaveBar,
} from "@/components/admin/settings-ui";
import {
  COMMON_LANGUAGES,
  voiceOptions,
} from "@/components/admin/ai-settings-options";

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
  allowedLanguages: string[];
  alwaysRespondIn: string;
  // Voice
  voiceId: string;
  voiceSpeed: string;
};

const KNOWN_LANGUAGES = new Set(COMMON_LANGUAGES.map((l) => l.code));

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
    allowedLanguages: defaults?.allowedLanguages ?? ["en"],
    alwaysRespondIn: defaults?.alwaysRespondIn ?? "",
    // Voice
    voiceId: defaults?.voiceId ?? "",
    voiceSpeed: defaults?.voiceSpeed != null ? String(defaults.voiceSpeed) : "1.0",
  };
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

/** Known languages + any custom code already saved (so nothing disappears).
 *
 * Empty codes are filtered: "Always respond in" stores "" for "follow the
 * user's language", and an "" item used to render <SelectItem value=""> —
 * Radix throws on empty-string values and took the whole /settings/ai page
 * down with the global error boundary ("We'll be right back").
 */
function languageChipItems(saved: string[]): { id: string; label: string }[] {
  const extras = saved
    .filter((code) => code && !KNOWN_LANGUAGES.has(code))
    .map((code) => ({ id: code, label: code.toUpperCase() }));
  return [
    ...COMMON_LANGUAGES.map((l) => ({ id: l.code, label: `${l.label} (${l.code})` })),
    ...extras,
  ];
}

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

  function toggleLanguage(code: string) {
    setSaved(false);
    setDraft((current) => {
      const next = current.allowedLanguages.includes(code)
        ? current.allowedLanguages.filter((c) => c !== code)
        : [...current.allowedLanguages, code];
      return { ...current, allowedLanguages: next.length > 0 ? next : current.allowedLanguages };
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      const assistantName = draft.assistantName.trim();
      if (!assistantName) throw new Error("Assistant name cannot be empty.");

      const defaultLanguage = draft.defaultLanguage.trim().toLowerCase();
      if (!defaultLanguage) throw new Error("Default language cannot be empty.");

      const allowedLanguages = draft.allowedLanguages.map((l) => l.toLowerCase());
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
          "Newly onboarding agents will start with these values. Existing ones keep their own settings.",
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
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bot className="w-5 h-5 text-primary" />
          Default Identity, Behaviour, Language &amp; Voice
        </CardTitle>
        <CardDescription>
          Platform-wide starting values for every new agent. They are copied onto each
          record the moment it is created — organisations can then customise their own copy, and
          existing agents are never touched when you change anything here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* ── Identity ─────────────────────────────────────────────────────── */}
        <SettingsSection
          icon={<UserRound />}
          title="Identity"
          description="The assistant name and avatar new projects and agents start with."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <TextField
              label="Assistant name"
              value={draft.assistantName}
              onChange={(value) => setField("assistantName", value)}
              placeholder="Clara"
            />
            <TextField
              label="Avatar URL"
              hint="Optional. Leave blank for the default look."
              value={draft.avatarUrl}
              onChange={(value) => setField("avatarUrl", value)}
              placeholder="https://example.com/avatar.png"
              type="url"
            />
          </div>
          {/* Live avatar preview — exactly what users will see in the chat. */}
          <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/10 px-4 py-3">
            {draft.avatarUrl.trim() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={draft.avatarUrl.trim()}
                alt="Assistant avatar preview"
                className="h-12 w-12 rounded-full object-cover ring-2 ring-primary/20"
                onError={(event) => { (event.target as HTMLImageElement).style.opacity = "0.2"; }}
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-violet-600 text-sm font-semibold text-primary-foreground">
                {(draft.assistantName.trim() || "C").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {draft.assistantName.trim() || "Clara"}
              </p>
              <p className="text-xs text-muted-foreground">
                Preview — how the assistant appears when a new chat starts.
              </p>
            </div>
          </div>
        </SettingsSection>

        {/* ── Behaviour ────────────────────────────────────────────────────── */}
        <SettingsSection
          icon={<BrainCircuit />}
          title="Behaviour"
          description="The starting personality and reply style for newly onboarding assistants."
        >
          <TextAreaField
            label="System prompt"
            hint="Core instructions for the assistant's behaviour and personality."
            value={draft.systemPrompt}
            onChange={(value) => setField("systemPrompt", value)}
            placeholder="You are Clara, a helpful voice assistant..."
            rows={4}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <TextField
              label="Welcome message"
              hint="First message shown when a new chat starts."
              value={draft.welcomeMessage}
              onChange={(value) => setField("welcomeMessage", value)}
              placeholder="Hello! How can I help you today?"
            />
            <TextField
              label="Out-of-scope reply"
              hint="Response when the assistant cannot answer from its knowledge base."
              value={draft.outOfScopeReply}
              onChange={(value) => setField("outOfScopeReply", value)}
              placeholder="I can only answer questions about the topics I have been set up for."
            />
          </div>
          <TextAreaField
            label="Rules"
            hint="Starting behavioural rules — one rule per line."
            value={draft.rules}
            onChange={(value) => setField("rules", value)}
            placeholder="Never share personal information. Be concise."
            rows={3}
          />
        </SettingsSection>

        {/* ── Language ─────────────────────────────────────────────────────── */}
        <SettingsSection
          icon={<Globe />}
          title="Language"
          description="Starting language setup for newly onboarding projects and agents."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <ModelSelect
              label="Default language"
              hint="The language a brand-new assistant greets users in."
              value={draft.defaultLanguage}
              onChange={(value) => setField("defaultLanguage", value)}
              options={languageChipItems([draft.defaultLanguage]).map((l) => ({
                value: l.id,
                label: l.label,
              }))}
              placeholder="en"
            />
            <ModelSelect
              label="Always respond in"
              hint="Force every reply into one language, or follow the user's language."
              value={draft.alwaysRespondIn}
              onChange={(value) => setField("alwaysRespondIn", value)}
              options={languageChipItems([draft.alwaysRespondIn]).map((l) => ({
                value: l.id,
                label: l.label,
              }))}
              placeholder="Follow the user's language"
              emptyOption="Follow the user's language"
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Allowed languages</p>
            <ToggleChipRow
              items={languageChipItems(draft.allowedLanguages)}
              selectedIds={draft.allowedLanguages}
              onToggle={toggleLanguage}
            />
            <p className="text-xs text-muted-foreground">
              Users can switch the assistant between these languages. At least one must stay selected.
            </p>
          </div>
        </SettingsSection>

        {/* ── Voice ────────────────────────────────────────────────────────── */}
        <SettingsSection
          icon={<Volume2 />}
          title="Voice"
          description="Starting voice for new assistants. Model selection stays centralised at platform level."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <GroupedModelSelect
              label="Default voice"
              hint="Blank = provider default. OpenAI and Gemini voices are listed; organisations can override."
              value={draft.voiceId}
              onChange={(value) => setField("voiceId", value)}
              groups={[
                { label: "OpenAI", options: voiceOptions("openai") },
                { label: "Gemini", options: voiceOptions("gemini") },
              ]}
              placeholder="Provider default"
              emptyOption="Provider default"
            />
            <TextField
              label="Voice speed"
              hint="Playback speed (0.25 to 4.0). 1.0 = normal."
              value={draft.voiceSpeed}
              onChange={(value) => setField("voiceSpeed", value)}
              placeholder="1.0"
              inputMode="decimal"
            />
          </div>
        </SettingsSection>

        <SaveBar
          error={error}
          saving={saving}
          onSave={handleSave}
          saveLabel="Save Defaults"
          hint={
            saved
              ? "Saved platform defaults."
              : "Applies to newly onboarding projects and agents only — existing ones keep their own values."
          }
        />
      </CardContent>
    </Card>
  );
}
