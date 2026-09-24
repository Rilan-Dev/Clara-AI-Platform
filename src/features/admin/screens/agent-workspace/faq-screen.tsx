"use client";

/**
 * src/features/admin/screens/agent-workspace/faq-screen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * /orgs/[id]/agents/[agentId]/faq — the "FAQ" workspace tab (ElevenLabs-style).
 *
 * Managed canonical Q/A pairs:
 *   • live in the agent DRAFT's assistant section (faqItems) — so they ride
 *     the same draft → version → publish pipeline as every other persona
 *     field;
 *   • are injected into the composed system prompt at session time
 *     (config-builder) and mirrored in the ConfigEditor prompt preview;
 *   • AUTO-SAVE — no Save button. Edits persist ~1.2 s after typing stops
 *     (discrete add/remove saves immediately), the same policy as the Main
 *     tab. Publishing still happens through the topbar's one-click Publish.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { HelpCircle, MessageCircleQuestion, Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/modules/admin-ui/hooks";
import {
  fetchAgentDraft,
  putAgentDraft,
  type AgentDraftDTO,
} from "@/modules/admin-ui/ai-platform-api";
import type { FaqItem } from "@/modules/admin-ui/api";
import { useAgentWorkspaceContext } from "@/features/admin/screens/agent-workspace/workspace-shell";
import { AutoSaveChip } from "@/components/admin/ai-platform/shared";
import { useAutoSave } from "@/hooks/use-auto-save";

/** Debounce for typed edits (ms). Discrete actions (add/remove) flush. */
const AUTOSAVE_DELAY_MS = 1200;

function newFaqItem(): FaqItem {
  return {
    id: crypto.randomUUID(),
    question: "",
    answer: "",
  };
}

export default function AgentFaqScreen() {
  const { agentId = "" } = useParams<{ agentId: string }>();
  const { user } = useAuth();
  const isAdmin = user?.isSuperAdmin ?? false;
  const { refetch: refetchCtx } = useAgentWorkspaceContext(agentId);

  const [draft, setDraft] = useState<AgentDraftDTO | null>(null);
  const [items, setItems] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Freshest draft mirror (ref, not closure) + the last payload we persisted.
  const draftRef = useRef<AgentDraftDTO | null>(null);
  draftRef.current = draft;
  const savedBaselineRef = useRef<string | null>(null);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    setLoading(true);
    fetchAgentDraft(agentId)
      .then((result) => {
        if (cancelled) return;
        setDraft(result);
        draftRef.current = result;
        const next = readFaqItems(result);
        setItems(next);
        savedBaselineRef.current = JSON.stringify(next);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const save = useCallback(
    async (next: FaqItem[]) => {
      if (isAdmin) return;
      // Build from the freshest draft (ref, not closure) so a save fired
      // while another is in flight never reverts unrelated fields.
      const current = draftRef.current;
      if (!current) return;
      const configuration = {
        ...current.configuration,
        assistant: { ...current.configuration.assistant, faqItems: next },
      };
      const saved = await putAgentDraft(agentId, configuration);
      savedBaselineRef.current = JSON.stringify(next);
      draftRef.current = saved;
      setDraft(saved);
      void refetchCtx();
    },
    [agentId, isAdmin, refetchCtx],
  );

  const autoSave = useAutoSave<FaqItem[]>({
    value: items,
    save,
    delay: AUTOSAVE_DELAY_MS,
    enabled: !isAdmin && !loading,
    onError: (e) =>
      toast.error("Could not save the FAQ", { description: e.message }),
  });

  const setStatus = (updater: (prev: FaqItem[]) => FaqItem[]) => {
    setItems((prev) => {
      const next = updater(prev);
      return next;
    });
  };

  const addItem = () => setStatus((prev) => [...prev, newFaqItem()]);
  const removeItem = (id: string) => setStatus((prev) => prev.filter((f) => f.id !== id));
  const patchItem = (id: string, patch: Partial<Pick<FaqItem, "question" | "answer">>) =>
    setStatus((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const filledCount = useMemo(
    () => items.filter((f) => f.question.trim() && f.answer.trim()).length,
    [items],
  );

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-10 w-56 animate-pulse rounded-xl bg-muted/60" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-36 animate-pulse rounded-2xl bg-muted/60" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-6 text-center text-sm text-destructive">
        {error}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
            <MessageCircleQuestion className="h-4 w-4 text-primary" /> FAQ
            <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {items.length} {items.length === 1 ? "entry" : "entries"}
              {filledCount !== items.length ? ` · ${filledCount} complete` : ""}
            </span>
          </p>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground/70">
            Canonical answers injected into the assistant&apos;s system prompt — when a visitor
            asks a matching question (even paraphrased), the assistant reuses your answer.
            Edits save automatically into the draft; publishing makes them live.
          </p>
        </div>
        {!isAdmin && <AutoSaveChip status={autoSave.status} savedAt={autoSave.savedAt} />}
      </div>

      {isAdmin && (
        <p className="rounded-2xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground shadow-sm">
          Platform admins can view the FAQ but cannot edit it.
        </p>
      )}

      {/* Items */}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
          <HelpCircle className="mx-auto h-8 w-8 text-muted-foreground/80" />
          <p className="mt-3 text-sm font-medium text-foreground/80">No FAQ entries yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground/70">
            Add the questions your visitors ask most — pricing, coverage, how to reach a human —
            and the assistant will answer them consistently.
          </p>
          {!isAdmin && (
            <button
              type="button"
              onClick={addItem}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
            >
              <Plus className="h-3.5 w-3.5" /> Add the first question
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold text-muted-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-3">
                  <input
                    value={item.question}
                    onChange={(e) => patchItem(item.id, { question: e.target.value })}
                    placeholder="Type the question visitors ask…"
                    disabled={isAdmin}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground placeholder:text-muted-foreground/80 focus:border-primary/40 focus:outline-none disabled:opacity-60"
                  />
                  <textarea
                    value={item.answer}
                    onChange={(e) => patchItem(item.id, { answer: e.target.value })}
                    placeholder="The canonical answer the assistant should give…"
                    disabled={isAdmin}
                    rows={3}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/80 focus:border-primary/40 focus:outline-none disabled:opacity-60"
                  />
                </div>
                {!isAdmin && (
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    aria-label={`Remove FAQ entry ${index + 1}`}
                    title="Remove this entry"
                    className="rounded-lg p-1.5 text-muted-foreground/80 transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Footer actions */}
      {!isAdmin && items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-primary/30"
          >
            <Plus className="h-3.5 w-3.5" /> Add question
          </button>
          <p className="text-[11px] text-muted-foreground/80">
            {autoSave.status === "saving" ? "Saving…" : "FAQ entries publish with the agent — use Publish update in the top bar when ready."}
          </p>
        </div>
      )}
    </div>
  );
}

/** Read the FAQ list out of a draft payload without assuming the field is
 *  present (older drafts / versioned imports predate faqItems). */
function readFaqItems(draft: AgentDraftDTO): FaqItem[] {
  const raw = (draft.configuration.assistant as Record<string, unknown>).faqItems;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): FaqItem[] => {
    if (!entry || typeof entry !== "object") return [];
    const q = (entry as Record<string, unknown>).question;
    const a = (entry as Record<string, unknown>).answer;
    const id = (entry as Record<string, unknown>).id;
    if (typeof q !== "string" || typeof a !== "string") return [];
    return [{ id: typeof id === "string" ? id : crypto.randomUUID(), question: q, answer: a }];
  });
}
