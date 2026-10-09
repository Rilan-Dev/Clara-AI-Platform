"use client";
/**
 * WebSourcesPanel.tsx
 * Shows all web-scraped content grouped by scrape session (root URL).
 * Each session is one collapsible row → expands to individual scraped pages.
 * Each page has a ChunkViewer for full vector inspection / editing.
 */
import { useState, useEffect, useCallback } from "react";
import * as api from "@/modules/admin-ui/api";
import type { KbDocument, ScrapeSession } from "@/modules/admin-ui/api";
import { StatusBadge } from "./StatusBadge";
import { ChunkViewer } from "./ChunkViewer";
import { confirmAction } from "@/components/ui/confirm-dialog";

type Props = {
  kbId:        string;
  docs:        KbDocument[];
  onDelete:    (docId: string) => Promise<void>;
  onReprocess: (docId: string) => Promise<void>;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function GlobeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  );
}

// ── Single scraped page row ───────────────────────────────────────────────────

function PageRow({ doc, kbId, onDelete, onReprocess }: {
  doc: KbDocument; kbId: string;
  onDelete: (id: string) => void;
  onReprocess: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Page icon */}
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted/50">
          <svg className="h-3.5 w-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
          </svg>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="break-words [overflow-wrap:anywhere] text-sm font-medium text-foreground" title={doc.title}>{doc.title}</p>
          <p className="mt-0.5 break-words [overflow-wrap:anywhere] text-xs font-mono text-muted-foreground" title={doc.originalFilename}>
            {doc.originalFilename}
          </p>
        </div>

        {/* Meta + actions */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>{formatSize(doc.fileSize)}</span>
          <span>{doc.chunkCount != null ? `${doc.chunkCount.toLocaleString()} chunks` : "—"}</span>
          <StatusBadge status={doc.status} />
          {doc.status === "failed" && (
            <button onClick={() => onReprocess(doc.id)}
              className="text-warning border border-warning/30 hover:bg-warning/10 rounded px-2 py-0.5 transition-colors">
              Retry
            </button>
          )}
          <button
            onClick={async () => {
              if (!(await confirmAction({
                title: "Delete this page?",
                description: "The page and its indexed content are removed from the knowledge base.",
                destructive: true,
              }))) return;
              setDeleting(true);
              try { await onDelete(doc.id); } catch { setDeleting(false); }
            }}
            disabled={deleting}
            className="text-destructive border border-destructive/30 hover:bg-destructive/10 rounded px-2 py-0.5 transition-colors disabled:opacity-40">
            {deleting ? "…" : "Delete"}
          </button>
        </div>
      </div>

      {/* Chunk viewer — lazy, only for ready docs */}
      {doc.status === "ready" && (
        <ChunkViewer kbId={kbId} docId={doc.id} chunkCount={doc.chunkCount} />
      )}
    </div>
  );
}

// ── Session group ─────────────────────────────────────────────────────────────

function SessionGroup({ session, docs, kbId, onDelete, onReprocess }: {
  session: ScrapeSession; docs: KbDocument[]; kbId: string;
  onDelete: (id: string) => void;
  onReprocess: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const totalChunks = docs.reduce((s, d) => s + (d.chunkCount ?? 0), 0);
  const readyDocs   = docs.filter((d) => d.status === "ready").length;
  const failedDocs  = docs.filter((d) => d.status === "failed").length;
  const badgeStatus = session.status === "completed" ? "ready"
    : session.status === "failed" ? "failed" : "pending";

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-muted/30 transition-colors">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <GlobeIcon className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="break-words [overflow-wrap:anywhere] font-semibold text-foreground">{session.rootUrl}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {docs.length} page{docs.length !== 1 ? "s" : ""}
            {" · "}{readyDocs} ready
            {failedDocs > 0 && <span className="text-destructive"> · {failedDocs} failed</span>}
            {" · "}{totalChunks.toLocaleString()} chunks
            {" · "}{formatDate(session.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <StatusBadge status={badgeStatus} />
          <svg
            className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-border bg-muted/10 p-4 space-y-2">
          {docs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No pages ingested for this session.
            </p>
          ) : (
            docs.map((doc) => (
              <PageRow key={doc.id} doc={doc} kbId={kbId}
                onDelete={onDelete} onReprocess={onReprocess} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────

export function WebSourcesPanel({ kbId, docs, onDelete, onReprocess }: Props) {
  const [sessions, setSessions] = useState<ScrapeSession[]>([]);
  const [loading, setLoading]   = useState(true);

  const urlDocs = docs.filter((d) => d.sourceType === "url");

  const load = useCallback(async () => {
    try {
      const data = await api.listScrapeSessions(kbId);
      setSessions(data);
    } catch { /* non-critical */ }
    finally { setLoading(false); }
  }, [kbId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 rounded-xl border border-border bg-muted/20 animate-pulse" />
        ))}
      </div>
    );
  }

  // Group url docs by their session
  const grouped = new Map<string | null, KbDocument[]>();
  for (const doc of urlDocs) {
    const key = doc.createdByScrapeSessionId;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(doc);
  }

  const orphanDocs     = grouped.get(null) ?? [];
  const sessionGroups  = sessions
    .filter((s) => grouped.has(s.id))
    .map((s) => ({ session: s, docs: grouped.get(s.id)! }));
  const emptySessions  = sessions.filter(
    (s) => !grouped.has(s.id) && (s.status === "scraping" || s.status === "ingesting")
  );

  if (urlDocs.length === 0 && sessions.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card/50 p-8 text-center">
        <GlobeIcon className="h-10 w-10 text-muted-foreground/80 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No web sources yet.</p>
        <p className="text-xs text-muted-foreground/80 mt-1">
          Use the Scrape tab to import pages from any website.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Sessions with ingested docs */}
      {sessionGroups.map(({ session, docs: sDocs }) => (
        <SessionGroup key={session.id} session={session} docs={sDocs}
          kbId={kbId} onDelete={onDelete} onReprocess={onReprocess} />
      ))}

      {/* Sessions still in flight (no docs yet) */}
      {emptySessions.map((s) => (
        <div key={s.id} className="rounded-xl border border-border bg-card/50 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <GlobeIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary animate-pulse" />
            <div className="min-w-0 flex-1">
              <p className="break-words [overflow-wrap:anywhere] text-sm font-medium text-foreground">{s.rootUrl}</p>
              <p className="text-xs text-muted-foreground capitalize">{s.status}…</p>
            </div>
          </div>
        </div>
      ))}

      {/* Orphan URL docs (no session linked) */}
      {orphanDocs.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-3 bg-muted/30 border-b border-border">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Other web pages ({orphanDocs.length})
            </p>
          </div>
          <div className="p-3 space-y-2">
            {orphanDocs.map((doc) => (
              <PageRow key={doc.id} doc={doc} kbId={kbId}
                onDelete={onDelete} onReprocess={onReprocess} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
