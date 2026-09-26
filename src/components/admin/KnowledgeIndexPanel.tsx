"use client";
/**
 * KnowledgeIndexPanel — which embedding model indexes this knowledge base,
 * and the ElevenLabs-style switch to the multilingual index (re-index job
 * with progress, resume, cancel). Shown on the knowledge base's Documents tab.
 *
 * The multilingual option appears only when the platform admin enabled it
 * and the organisation's plan includes it; otherwise the panel says why.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Languages, Loader2, RefreshCw } from "lucide-react";
import { apiUrl } from "@/lib/runtime";
import { withAuthHeaders } from "@/lib/client-auth";
import { cn } from "@/lib/utils";

type IndexKind = "standard" | "multilingual";
type Job = {
  id: string;
  targetIndex: IndexKind;
  model: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  pointsTotal: number;
  pointsDone: number;
  errorMessage: string | null;
};
type Status = {
  current: { index: IndexKind; provider: string; model: string; dimension: number } | null;
  desiredIndex: IndexKind;
  standardUpdate: { model: string; dimension: number } | null;
  multilingual: {
    available: boolean;
    platform: boolean;
    plan: boolean;
    reason: string | null;
    model: string;
    label: string;
    languages: number | null;
    elevenLabsModel: string | null;
  };
  job: Job | null;
  retiredIndexes: number;
  orgDefaultIndex: IndexKind;
};

const POLL_MS = 4_000;

export function KnowledgeIndexPanel({ kbId }: { kbId: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<IndexKind | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(apiUrl(`/api/kbs/${kbId}/embedding-index`), { headers: withAuthHeaders() });
      if (!res.ok) return; // no access (e.g. platform admin view) — hide quietly
      const body = (await res.json()) as Status;
      if (mounted.current) setStatus(body);
    } catch {
      // transient — the next poll retries
    }
  }, [kbId]);

  const active = status?.job && (status.job.status === "queued" || status.job.status === "running");

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load]);

  // Poll while a re-index runs — each poll also advances the job server-side.
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => { void load(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [active, load]);

  const act = async (action: string, index?: IndexKind) => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/kbs/${kbId}/embedding-index`), {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action, ...(index ? { index } : {}) }),
      });
      const body = (await res.json().catch(() => ({}))) as Status & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "The knowledge index could not be updated.");
      if (body.current !== undefined) setStatus(body);
      else void load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  if (!status) return null;
  const { current, multilingual, job } = status;
  const onMultilingual = current?.index === "multilingual";
  const pct = job && job.pointsTotal > 0 ? Math.min(100, Math.round((job.pointsDone / job.pointsTotal) * 100)) : null;
  const target: IndexKind = onMultilingual ? "standard" : "multilingual";

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="kb-index-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="kb-index-title" className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Languages className="h-4 w-4 text-primary" /> Knowledge index
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {current ? (
              <>
                <span className="font-medium text-foreground">{onMultilingual ? "Multilingual" : "Standard"}</span>
                {" · "}
                <span className="font-mono">{current.model}</span>
                {" · "}
                {current.dimension}-dimensional vectors
              </>
            ) : (
              "Built when the first document is added."
            )}
          </p>
          {!onMultilingual && multilingual.available && (
            <p className="mt-1 text-xs text-muted-foreground">
              The multilingual index ({multilingual.label}
              {multilingual.languages ? `, ~${multilingual.languages} languages` : ""}) matches questions and documents across
              languages without a translation step{multilingual.elevenLabsModel ? " — the same model ElevenLabs uses for multilingual RAG" : ""}.
            </p>
          )}
          {status.standardUpdate && !active && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              The standard embedding model is now <span className="font-mono">{status.standardUpdate.model}</span>. Re-index
              to use it — until then this knowledge base keeps searching with the model that built it.
            </p>
          )}
          {!multilingual.available && multilingual.reason && (
            <p className="mt-1 text-xs text-muted-foreground/80">{multilingual.reason}</p>
          )}
        </div>

        {!active && (onMultilingual || multilingual.available || status.standardUpdate) && current && (
          confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Builds a new index in the background; the current one keeps answering until it is ready.
              </span>
              <button
                type="button"
                onClick={() => void act("start", confirming)}
                disabled={busy !== null}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
              >
                {busy === "start" ? "Starting…" : "Start re-index"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {status.standardUpdate && (
                <button
                  type="button"
                  onClick={() => setConfirming("standard")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/30"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Update index
                </button>
              )}
              {(onMultilingual || multilingual.available) && (
                <button
                  type="button"
                  onClick={() => setConfirming(target)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {onMultilingual ? "Switch back to standard index" : "Re-index as multilingual"}
                </button>
              )}
            </div>
          )
        )}
      </div>

      {job && (active || job.status === "failed") && (
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 text-foreground">
              {active && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
              {job.status === "failed"
                ? "Re-index stopped"
                : `Re-indexing with ${job.model}`}
              {pct !== null && ` · ${pct}% (${job.pointsDone.toLocaleString()} / ${job.pointsTotal.toLocaleString()} chunks)`}
            </span>
            <div className="flex gap-2">
              {job.status === "failed" && (
                <button
                  type="button"
                  onClick={() => void act("retry")}
                  disabled={busy !== null}
                  className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground disabled:opacity-60"
                >
                  Resume
                </button>
              )}
              <button
                type="button"
                onClick={() => void act("cancel")}
                disabled={busy !== null}
                className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
              >
                Cancel re-index
              </button>
            </div>
          </div>
          {pct !== null && (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className={cn("h-full rounded-full bg-primary transition-all")} style={{ width: `${pct}%` }} />
            </div>
          )}
          {job.errorMessage && <p className="text-xs text-destructive">{job.errorMessage}</p>}
          {active && (
            <p className="text-[11px] text-muted-foreground/80">
              Keep this page open to speed it up; it also continues in the background. New uploads go into both indexes.
            </p>
          )}
        </div>
      )}

      {(multilingual.available || (!active && status.retiredIndexes > 0)) && (
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/70 pt-3 text-xs">
        {multilingual.available && (
          <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
            <input
              type="checkbox"
              checked={status.orgDefaultIndex === "multilingual"}
              disabled={busy !== null}
              onChange={(e) => void act("org-default", e.target.checked ? "multilingual" : "standard")}
              className="rounded border-border text-primary focus:ring-primary/20"
            />
            Use the multilingual index for new knowledge bases in this organisation
          </label>
        )}
        {!active && status.retiredIndexes > 0 && (
          <button
            type="button"
            onClick={() => void act("delete-retired")}
            disabled={busy !== null}
            className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-60"
            title="Frees vector storage. Kept for at least 10 minutes after a switch."
          >
            Delete previous index ({status.retiredIndexes})
          </button>
        )}
      </div>
      )}

      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    </section>
  );
}
