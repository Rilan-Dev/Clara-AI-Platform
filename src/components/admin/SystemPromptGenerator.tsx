"use client";
/**
 * SystemPromptGenerator — "Generate from knowledge base" dialog.
 *
 * The admin chooses HOW the prompt should be written (a template such as
 * Customer support, Clinical, Organisation policy… or "Let AI decide", which
 * reads the knowledge base and picks the style), optionally adds notes, and
 * reviews the result before it replaces or is appended to the prompt.
 * Nothing is written to the prompt without an explicit Replace / Append.
 */
import { useState } from "react";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PROMPT_TEMPLATES, findPromptTemplate, type PromptTemplateId } from "@/modules/assistant/core/prompt-templates";
import { cn } from "@/lib/utils";

export type SystemPromptGenerationResult = { prompt: string; template: string; reason?: string; documentsSampled?: number };
export type GenerateSystemPrompt = (template: PromptTemplateId, notes: string) => Promise<SystemPromptGenerationResult>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generate: GenerateSystemPrompt;
  hasExistingPrompt: boolean;
  onApply: (prompt: string, mode: "replace" | "append") => void;
};

export function SystemPromptGenerator({ open, onOpenChange, generate, hasExistingPrompt, onApply }: Props) {
  const [template, setTemplate] = useState<PromptTemplateId>("auto");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SystemPromptGenerationResult | null>(null);
  const [draft, setDraft] = useState("");

  const close = (next: boolean) => {
    if (busy) return;
    onOpenChange(next);
    if (!next) {
      setResult(null);
      setError(null);
    }
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const generated = await generate(template, notes.trim());
      setResult(generated);
      setDraft(generated.prompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The system prompt could not be generated.");
    } finally {
      setBusy(false);
    }
  };

  const apply = (mode: "replace" | "append") => {
    const text = draft.trim();
    if (!text) return;
    onApply(text, mode);
    onOpenChange(false);
    setResult(null);
  };

  const chosen = result ? findPromptTemplate(result.template) : null;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" /> Generate system prompt from knowledge base
          </DialogTitle>
          <DialogDescription>
            Clara scans the knowledge bases assigned to this agent and drafts a prompt in the style you choose.
            You can review and edit it before it is used.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block text-sm font-medium">What kind of assistant is this?</Label>
              <div role="radiogroup" aria-label="Prompt template" className="grid gap-2 sm:grid-cols-2">
                {PROMPT_TEMPLATES.map((t) => {
                  const selected = template === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={busy}
                      onClick={() => setTemplate(t.id)}
                      className={cn(
                        "rounded-xl border px-3 py-2.5 text-left transition-colors",
                        selected ? "border-primary bg-primary/5 ring-1 ring-primary/40" : "border-border hover:border-primary/30",
                        t.id === "auto" && "sm:col-span-2",
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        {t.id === "auto" && <Sparkles className="h-3.5 w-3.5 text-primary" />}
                        {t.label}
                        {t.id === "auto" && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Recommended</span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{t.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label htmlFor="prompt-gen-notes" className="mb-1.5 block text-sm font-medium">
                Extra instructions <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="prompt-gen-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                maxLength={2000}
                disabled={busy}
                placeholder="e.g. Speak to patients of our clinic, keep answers short, send billing questions to the front desk."
              />
            </div>
            {error && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Style: <span className="font-medium text-foreground">{chosen?.label ?? result.template}</span>
              {result.reason ? ` — ${result.reason}` : ""}
              {typeof result.documentsSampled === "number" ? ` · ${result.documentsSampled} excerpts scanned` : ""}
            </p>
            <Textarea
              aria-label="Generated system prompt"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={16}
              className="font-mono text-[13px] leading-6"
            />
            <p className="text-xs text-muted-foreground">
              Language rules and knowledge-base grounding are added automatically — the prompt does not need them.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {!result ? (
            <>
              <Button variant="outline" onClick={() => close(false)} disabled={busy}>Cancel</Button>
              <Button onClick={run} disabled={busy}>
                {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning knowledge base…</> : <><Wand2 className="mr-2 h-4 w-4" /> Generate</>}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setResult(null)}>Back</Button>
              {hasExistingPrompt && (
                <Button variant="outline" onClick={() => apply("append")} disabled={!draft.trim()}>Append to current</Button>
              )}
              <Button onClick={() => apply("replace")} disabled={!draft.trim()}>
                {hasExistingPrompt ? "Replace current prompt" : "Use this prompt"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
