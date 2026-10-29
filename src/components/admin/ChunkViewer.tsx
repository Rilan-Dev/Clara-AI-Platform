"use client";
/**
 * ChunkViewer.tsx
 * Expandable panel showing all Qdrant chunks for a single document.
 * Supports: view, edit (re-embed), delete, and add new chunks manually.
 */
import { useState, useCallback } from "react";
import * as api from "@/modules/admin-ui/api";
import type { KbChunk } from "@/modules/admin-ui/api";
import { formatChunkDebugExport, type DebugExportFormat } from "@/modules/admin-ui/rag-debug-export";
import { confirmAction } from "@/components/ui/confirm-dialog";

type Props = { kbId: string; docId: string; chunkCount: number | null };

function SpinnerIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function ChunkRow({ chunk, kbId, docId, onUpdated, onDeleted }: {
  chunk: KbChunk; kbId: string; docId: string;
  onUpdated: (c: KbChunk) => void;
  onDeleted: (pointId: string) => void;
}) {
  const [editing, setEditing]   = useState(false);
  const [draft, setDraft]       = useState(chunk.chunk);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const save = async () => {
    if (!draft.trim() || draft === chunk.chunk) { setEditing(false); return; }
    setSaving(true); setError(null);
    try {
      await api.updateDocumentChunk(kbId, docId, chunk.pointId, draft.trim(), chunk.chunkIndex);
      onUpdated({ ...chunk, chunk: draft.trim() });
      setEditing(false);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const del = async () => {
    if (!(await confirmAction({ title: `Delete chunk #${chunk.chunkIndex + 1}?`, description: "This cannot be undone.", destructive: true }))) return;
    setDeleting(true); setError(null);
    try {
      await api.deleteDocumentChunk(kbId, docId, chunk.pointId);
      onDeleted(chunk.pointId);
    } catch (e) { setError((e as Error).message); setDeleting(false); }
  };

  return (
    <div className="group border border-border rounded-lg bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
          #{chunk.chunkIndex + 1}{chunk.pageNumber != null ? ` · p.${chunk.pageNumber}` : ""}
        </span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!editing && (
            <button onClick={() => { setDraft(chunk.chunk); setEditing(true); }}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border border-border hover:bg-muted transition-colors">
              Edit
            </button>
          )}
          <button onClick={del} disabled={deleting}
            className="text-xs text-destructive px-2 py-0.5 rounded border border-destructive/30 hover:bg-destructive/10 transition-colors disabled:opacity-50">
            {deleting ? <SpinnerIcon className="h-3 w-3" /> : "Delete"}
          </button>
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={6}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {saving ? <><SpinnerIcon className="h-3 w-3" /> Re-embedding…</> : "Save & Re-embed"}
            </button>
            <button onClick={() => { setEditing(false); setDraft(chunk.chunk); setError(null); }}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border hover:bg-muted">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-foreground/80 leading-relaxed font-mono whitespace-pre-wrap break-words">
          {chunk.chunk}
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function ChunkViewer({ kbId, docId, chunkCount }: Props) {
  const [open, setOpen]       = useState(false);
  const [chunks, setChunks]   = useState<KbChunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [adding, setAdding]   = useState(false);
  const [newText, setNewText] = useState("");
  const [saving, setSaving]   = useState(false);
  const [search, setSearch]   = useState("");
  const [includeExportText, setIncludeExportText] = useState(true);
  const [exporting, setExporting] = useState<DebugExportFormat | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await api.listDocumentChunks(kbId, docId);
      setChunks(data); setLoaded(true);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [kbId, docId]);

  const toggle = () => { if (!open && !loaded) load(); setOpen((v) => !v); };
  const onUpdated = (u: KbChunk) => setChunks((p) => p.map((c) => c.pointId === u.pointId ? u : c));
  const onDeleted = (pid: string) => setChunks((p) => p.filter((c) => c.pointId !== pid));

  const addChunk = async () => {
    if (!newText.trim()) return;
    setSaving(true); setError(null);
    try {
      const added = await api.addDocumentChunk(kbId, docId, newText.trim());
      setChunks((p) => [...p, added]);
      setNewText(""); setAdding(false);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const exportChunks = async (format: DebugExportFormat) => {
    setExporting(format);
    setError(null);
    try {
      // Always re-read ALL currently stored points, not the filtered UI list,
      // so a shared artifact is an accurate current snapshot.
      const snapshot = await api.fetchDocumentChunkDebug(kbId, docId);
      const output = formatChunkDebugExport(snapshot, format, includeExportText);
      const blob = new Blob([output], { type: format === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const cleanName = snapshot.document.originalFilename.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 70);
      anchor.href = url;
      anchor.download = `clara-chunks-${cleanName || docId}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError((e as Error).message); }
    finally { setExporting(null); }
  };

  const filtered = search
    ? chunks.filter((c) => c.chunk.toLowerCase().includes(search.toLowerCase()))
    : chunks;
  const displayCount = loaded ? chunks.length : (chunkCount ?? 0);

  return (
    <div className="border-t border-border">
      <button onClick={toggle}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-muted/30 transition-colors">
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4 6h16M4 10h16M4 14h8M4 18h8" />
          </svg>
          {displayCount > 0 ? `${displayCount} chunk${displayCount !== 1 ? "s" : ""}` : "0 chunks"}
          {loaded && search && filtered.length !== chunks.length && ` · ${filtered.length} matching`}
        </span>
        <svg className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border bg-muted/10">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 pt-3">
            <div className="relative flex-1">
              <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground"
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" placeholder="Search chunks…" value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-background py-1.5 pl-7 pr-3 text-xs text-foreground placeholder:text-muted-foreground/80 focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <button onClick={load} disabled={loading}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded border border-border hover:bg-muted transition-colors">
              {loading ? <SpinnerIcon className="h-3 w-3" /> : (
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              Refresh
            </button>
            <label className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Text may contain customer information; review before sharing outside your organisation.">
              <input type="checkbox" checked={includeExportText}
                onChange={(e) => setIncludeExportText(e.target.checked)} />
              Include text
            </label>
            <button onClick={() => exportChunks("json")} disabled={exporting !== null}
              title="Export all live Qdrant chunks and metadata to share for debugging (no numeric vectors)"
              className="text-xs text-muted-foreground px-2 py-1.5 rounded border border-border hover:bg-muted disabled:opacity-50">
              {exporting === "json" ? "Exporting…" : "Export JSON"}
            </button>
            <button onClick={() => exportChunks("txt")} disabled={exporting !== null}
              title="Export indexed chunks in a readable UTF-8 text format"
              className="text-xs text-muted-foreground px-2 py-1.5 rounded border border-border hover:bg-muted disabled:opacity-50">
              {exporting === "txt" ? "Exporting…" : "Export TXT"}
            </button>
            <button onClick={() => setAdding((v) => !v)}
              className="flex items-center gap-1 text-xs text-primary px-2 py-1.5 rounded border border-primary/30 hover:bg-primary/10 transition-colors">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add chunk
            </button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Debug export uses the full authorized Qdrant chunk list, not the search filter. May contain sensitive document text; numeric vectors and credentials are not exported.
          </p>

          {/* Add chunk form */}
          {adding && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
              <p className="text-xs font-medium text-foreground">Add manual chunk</p>
              <textarea rows={5} value={newText} onChange={(e) => setNewText(e.target.value)}
                placeholder="Enter chunk text to embed and add to the vector store…"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <div className="flex items-center gap-2">
                <button onClick={addChunk} disabled={saving || !newText.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {saving ? <><SpinnerIcon className="h-3 w-3" /> Embedding…</> : "Embed & Save"}
                </button>
                <button onClick={() => { setAdding(false); setNewText(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded border border-border hover:bg-muted">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          {loading && (
            <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
              <SpinnerIcon className="h-4 w-4" /> Loading chunks from Qdrant…
            </div>
          )}

          {loaded && !loading && filtered.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              {search ? "No chunks match your search." : "No chunks found in the vector store."}
            </p>
          )}

          {loaded && !loading && filtered.length > 0 && (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {filtered.map((chunk) => (
                <ChunkRow key={chunk.pointId} chunk={chunk} kbId={kbId} docId={docId}
                  onUpdated={onUpdated} onDeleted={onDeleted} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
