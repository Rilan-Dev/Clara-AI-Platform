"use client";

import { useEffect, useMemo, useState } from "react";
import type { AIProvider, BulkReprocessResult, KBAIOverrides } from "@/modules/admin-ui/api";
import {
  chatModelOptions,
  embeddingModelOptions,
  embeddingDimensionFor,
  validateModelField,
} from "@/modules/ai-core/model-catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";

type Props = {
  kbName: string;
  overrides: KBAIOverrides | null;
  onSave: (
    data: Partial<Omit<KBAIOverrides, "id" | "kbId" | "createdAt" | "updatedAt">>,
  ) => Promise<KBAIOverrides>;
  onSaveAndReprocess?: (
    data: Partial<Omit<KBAIOverrides, "id" | "kbId" | "createdAt" | "updatedAt">>,
  ) => Promise<BulkReprocessResult>;
};

/** Extended payload: the reprocess variant carries the WS-0.4 flag that
 *  acknowledges the embedding-model change and the rebuild that follows. */
type SavePayload = Partial<Omit<KBAIOverrides, "id" | "kbId" | "createdAt" | "updatedAt">> & {
  allowEmbeddingReprocess?: boolean;
};

type Draft = {
  provider: AIProvider | null;
  chatModel: string;
  embeddingModel: string;
  realtimeModel: string;
  transcriptionModel: string;
  disableVoice: boolean;
  disablePublicEmbed: boolean;
};

type PreviewChange = {
  label: string;
  from: string;
  to: string;
};

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDraft(overrides: KBAIOverrides | null): Draft {
  return {
    provider: overrides?.provider ?? null,
    chatModel: overrides?.chatModel ?? "",
    embeddingModel: overrides?.embeddingModel ?? "",
    realtimeModel: overrides?.realtimeModel ?? "",
    transcriptionModel: overrides?.transcriptionModel ?? "",
    disableVoice: overrides?.disableVoice ?? false,
    disablePublicEmbed: overrides?.disablePublicEmbed ?? false,
  };
}

function formatMaybeInherited(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "inherit";
}

function formatProvider(value: AIProvider | null): string {
  return value ?? "inherit";
}

export function KBAIOverridesEditor({
  kbName,
  overrides,
  onSave,
  onSaveAndReprocess,
}: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(overrides));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reprocessMessage, setReprocessMessage] = useState<string | null>(null);
  const [needsReprocess, setNeedsReprocess] = useState(false);

  const baseline = useMemo(() => toDraft(overrides), [overrides]);

  useEffect(() => {
    setDraft(toDraft(overrides));
    setNeedsReprocess(false);
    setReprocessMessage(null);
  }, [overrides]);

  function buildPayload(reprocessDocs = false): SavePayload {
    return {
      provider: draft.provider,
      chatModel: emptyToNull(draft.chatModel),
      embeddingModel: emptyToNull(draft.embeddingModel),
      realtimeModel: emptyToNull(draft.realtimeModel),
      transcriptionModel: emptyToNull(draft.transcriptionModel),
      disableVoice: draft.disableVoice,
      disablePublicEmbed: draft.disablePublicEmbed,
      // WS-0.4: tells the API the vectors will be rebuilt with the new model.
      ...(reprocessDocs ? { allowEmbeddingReprocess: true } : {}),
    };
  }

  function hasEmbeddingRoutingChange(): boolean {
    return (
      draft.provider !== baseline.provider ||
      draft.embeddingModel.trim() !== baseline.embeddingModel.trim()
    );
  }

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
    setError(null);
    setReprocessMessage(null);
  }

  async function handleSave(reprocessDocs = false) {
    setSaving(true);
    setError(null);
    setReprocessMessage(null);

    try {
      // WS-0.4: block catalogue violations before they reach the API.
      const provider = draft.provider ?? undefined;
      const chatCheck = validateModelField({ field: "chat", model: draft.chatModel, provider });
      if (!chatCheck.ok) throw new Error(chatCheck.message);
      const embeddingCheck = validateModelField({ field: "embedding", model: draft.embeddingModel, provider });
      if (!embeddingCheck.ok) throw new Error(embeddingCheck.message);

      const payload = buildPayload(reprocessDocs);
      if (reprocessDocs) {
        if (!onSaveAndReprocess) {
          throw new Error("Bulk reprocess is not available for this KB.");
        }
        const result = await onSaveAndReprocess(payload);
        setNeedsReprocess(false);
        setReprocessMessage(
          `Queued ${result.queued} document${result.queued === 1 ? "" : "s"}. ` +
            `${result.skipped} skipped, ${result.failed} failed.`,
        );
        toast.success("Saved KB overrides and queued document rebuild", {
          description: `Queued ${result.queued}, skipped ${result.skipped}, failed ${result.failed}.`,
        });
      } else {
        await onSave(payload);
        setNeedsReprocess(hasEmbeddingRoutingChange());
        toast.success("Saved KB AI overrides", {
          description: `${kbName} will use the updated runtime routing for new requests.`,
        });
      }

      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      toast.error("Could not update KB runtime overrides", {
        description: message,
      });
    } finally {
      setSaving(false);
    }
  }

  async function resetToInherited() {
    // Load the inherited (baseline) values from the project config
    const resetDraft: Draft = {
      provider: null,  // null means inherit from project
      chatModel: "",
      embeddingModel: "",
      realtimeModel: "",
      transcriptionModel: "",
      disableVoice: false,
      disablePublicEmbed: false,
    };
    setDraft(resetDraft);
    setError(null);
    setReprocessMessage(null);
    setSaved(false);
    setNeedsReprocess(
      baseline.provider !== null || baseline.embeddingModel.trim().length > 0,
    );
  }

  const inherited =
    draft.provider === null &&
    !draft.chatModel &&
    !draft.embeddingModel &&
    !draft.realtimeModel &&
    !draft.transcriptionModel &&
    !draft.disableVoice &&
    !draft.disablePublicEmbed;

  // ── WS-0.4: live catalogue validation for the two model fields ──────────
  const chatModelError = useMemo(() => {
    const result = validateModelField({ field: "chat", model: draft.chatModel, provider: draft.provider ?? undefined });
    return result.ok ? null : result.message;
  }, [draft.chatModel, draft.provider]);

  const embeddingModelError = useMemo(() => {
    const result = validateModelField({ field: "embedding", model: draft.embeddingModel, provider: draft.provider ?? undefined });
    return result.ok ? null : result.message;
  }, [draft.embeddingModel, draft.provider]);

  const embeddingHint = useMemo(() => {
    const dim = embeddingDimensionFor(draft.embeddingModel);
    return dim
      ? `${draft.embeddingModel} produces ${dim}-dimensional vectors — changing the model requires re-processing documents.`
      : "Only embedding models can be selected — chat models are rejected.";
  }, [draft.embeddingModel]);

  const embeddingRoutingChanged = hasEmbeddingRoutingChange();
  const pendingChanges = useMemo<PreviewChange[]>(() => {
    const changes: PreviewChange[] = [];

    const pushIfChanged = (label: string, from: string, to: string) => {
      if (from !== to) {
        changes.push({ label, from, to });
      }
    };

    pushIfChanged("Provider", formatProvider(baseline.provider), formatProvider(draft.provider));
    pushIfChanged("Chat model", formatMaybeInherited(baseline.chatModel), formatMaybeInherited(draft.chatModel));
    pushIfChanged(
      "Embedding model",
      formatMaybeInherited(baseline.embeddingModel),
      formatMaybeInherited(draft.embeddingModel),
    );
    pushIfChanged(
      "Realtime model",
      formatMaybeInherited(baseline.realtimeModel),
      formatMaybeInherited(draft.realtimeModel),
    );
    pushIfChanged(
      "Transcription model",
      formatMaybeInherited(baseline.transcriptionModel),
      formatMaybeInherited(draft.transcriptionModel),
    );
    pushIfChanged(
      "Voice access",
      baseline.disableVoice ? "disabled" : "enabled",
      draft.disableVoice ? "disabled" : "enabled",
    );
    pushIfChanged(
      "Public embed",
      baseline.disablePublicEmbed ? "disabled" : "enabled",
      draft.disablePublicEmbed ? "disabled" : "enabled",
    );

    return changes;
  }, [baseline, draft]);

  return (
    <Card className="border-border shadow-soft">
      <CardHeader>
        <CardTitle className="text-lg">KB AI Runtime Overrides</CardTitle>
        <CardDescription>
          Override provider and model routing for {kbName}. Blank values inherit the organisation policy and platform defaults.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          {inherited
            ? "This knowledge base currently inherits its AI provider, models, and embed access from the organisation policy."
            : "Overrides are active for this knowledge base. These values take precedence over the org defaults."}
        </div>

        {pendingChanges.length > 0 && (
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-4">
            <div className="mb-3">
              <p className="text-sm font-semibold text-foreground">Pending runtime changes</p>
              <p className="text-xs text-muted-foreground">
                These fields will change when you save the override set.
              </p>
            </div>
            <div className="grid gap-2">
              {pendingChanges.map((change) => (
                <div
                  key={change.label}
                  className="flex flex-col gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm md:flex-row md:items-center md:justify-between"
                >
                  <span className="font-medium text-foreground">{change.label}</span>
                  <span className="text-muted-foreground">
                    <span className="text-white/60">{change.from}</span>
                    <span className="mx-2 text-indigo-300">-&gt;</span>
                    <span className="text-foreground">{change.to}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Provider and model overrides</h3>
            <p className="text-xs text-muted-foreground">
              Use these fields only when this KB needs different routing than the rest of the org.
            </p>
          </div>
          <Field label="Provider Override" hint="Auto means inherit the org default provider.">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setField("provider", null)} className={toggleButtonClass(draft.provider === null)}>
                Auto
              </button>
              <button type="button" onClick={() => setField("provider", "openai")} className={toggleButtonClass(draft.provider === "openai")}>
                OpenAI
              </button>
              <button type="button" onClick={() => setField("provider", "gemini")} className={toggleButtonClass(draft.provider === "gemini")}>
                Gemini
              </button>
            </div>
          </Field>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field
              label="Chat Model Override"
              hint="Only chat models can be selected — embedding models are rejected."
              error={chatModelError}
            >
              <Input
                value={draft.chatModel}
                onChange={(event) => setField("chatModel", event.target.value)}
                placeholder="Leave blank to inherit"
                list="kb-chat-model-options"
              />
              <datalist id="kb-chat-model-options">
                {chatModelOptions(draft.provider ?? undefined).map((m) => (
                  <option key={m.id} value={m.id} />
                ))}
              </datalist>
            </Field>
            <Field
              label="Embedding Model Override"
              hint={embeddingHint}
              error={embeddingModelError}
            >
              <Input
                value={draft.embeddingModel}
                onChange={(event) => setField("embeddingModel", event.target.value)}
                placeholder="Leave blank to inherit"
                list="kb-embedding-model-options"
              />
              <datalist id="kb-embedding-model-options">
                {embeddingModelOptions(draft.provider ?? undefined).map((m) => (
                  <option key={m.id} value={m.id}>
                    {`${m.id} — ${m.dimension} dims`}
                  </option>
                ))}
              </datalist>
            </Field>
            <Field label="Realtime Model Override">
              <Input
                value={draft.realtimeModel}
                onChange={(event) => setField("realtimeModel", event.target.value)}
                placeholder="Leave blank to inherit"
              />
            </Field>
            <Field label="Transcription Model Override">
              <Input
                value={draft.transcriptionModel}
                onChange={(event) => setField("transcriptionModel", event.target.value)}
                placeholder="Leave blank to inherit"
              />
            </Field>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Feature restrictions</h3>
            <p className="text-xs text-muted-foreground">
              These flags can disable voice or public embed for this KB even if the organisation allows them.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <SwitchField
              label="Disable voice for this KB"
              description="Prevent voice and realtime sessions for this knowledge base."
              checked={draft.disableVoice}
              onChange={(value) => setField("disableVoice", value)}
            />
            <SwitchField
              label="Disable public embed"
              description="Block API-key based public chat and voice embeds for this KB."
              checked={draft.disablePublicEmbed}
              onChange={(value) => setField("disablePublicEmbed", value)}
            />
          </div>
        </section>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          If you change the embedding model override, reprocess this KB&apos;s documents so new vectors match the selected model dimension.
        </div>

        {needsReprocess && (
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-700 dark:text-cyan-300">
            Embedding routing changed. Reprocess the KB&apos;s documents before depending on updated retrieval quality.
          </div>
        )}

        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-3 shadow-soft">
          <div className="text-sm">
            {error && <span className="text-destructive">{error}</span>}
            {saved && <span className="text-success">Saved KB runtime overrides.</span>}
            {!error && reprocessMessage && <span className="text-cyan-600 dark:text-cyan-300">{reprocessMessage}</span>}
            {!error && !saved && !reprocessMessage && (
              <span className="text-muted-foreground">Save to update routing for future chat, RAG, voice, and embed requests.</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={resetToInherited} disabled={saving}>
              Load Inherited Values
            </Button>
            {onSaveAndReprocess && (embeddingRoutingChanged || needsReprocess) && (
              <Button variant="outline" onClick={() => void handleSave(true)} disabled={saving}>
                {saving ? "Saving..." : "Save & Reprocess Docs"}
              </Button>
            )}
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Saving..." : "Save Overrides"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        {error && <p className="mt-0.5 text-xs font-medium text-destructive">{error}</p>}
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
