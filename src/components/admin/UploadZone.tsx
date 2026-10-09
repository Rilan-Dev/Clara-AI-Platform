"use client";
/**
 * UploadZone — drag-and-drop multi-file upload with live status table
 */
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import { ChunkViewer } from "./ChunkViewer";
import type { KbDocument } from "@/modules/admin-ui/api";

const ACCEPTED = ".pdf,.docx,.xlsx,.xls,.txt,.md,.csv";
const MAX_MB = 50;

type UploadError = { filename: string; error: string };

type Props = {
  kbId: string;
  docs: KbDocument[];
  onUpload: (files: File[]) => Promise<{ queued: KbDocument[]; errors: UploadError[] }>;
  onDelete: (docId: string) => Promise<void>;
  onReprocess: (docId: string) => Promise<void>;
};

export function UploadZone({ kbId, docs, onUpload, onDelete, onReprocess }: Props) {
  // Only show uploaded files — web-scraped docs live in the Web Sources tab
  const uploadDocs = docs.filter((d) => d.sourceType !== "url");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<UploadError[]>([]);
  const [reprocessError, setReprocessError] = useState<string | null>(null);

  const handleReprocess = useCallback(async (docId: string) => {
    setReprocessError(null);
    try {
      await onReprocess(docId);
    } catch (e) {
      setReprocessError((e as Error).message || "Retry failed");
    }
  }, [onReprocess]);

  const processFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    const arr = Array.from(files);
    setUploading(true);
    setUploadErrors([]);
    try {
      const result = await onUpload(arr);
      if (result.errors.length) setUploadErrors(result.errors);
    } catch (e) {
      setUploadErrors([{ filename: "upload", error: (e as Error).message }]);
    } finally {
      setUploading(false);
    }
  }, [onUpload]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    processFiles(e.dataTransfer.files);
  }, [processFiles]);

  function formatSize(bytes: number | null): string {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 sm:p-10 text-center cursor-pointer transition-all duration-200 select-none active:border-primary active:bg-primary/5",
          dragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border hover:border-primary/50 hover:bg-muted/30"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          className="sr-only"
          onChange={(e) => processFiles(e.target.files)}
        />
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <svg className="h-7 w-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
        </div>
        <div>
          <p className="font-medium text-foreground">
            {uploading ? "Uploading…" : (
              <>
                {/* Touch-first copy on phones — drag-and-drop is a desktop gesture */}
                <span className="sm:hidden">Tap to upload files</span>
                <span className="hidden sm:inline">Drop files here or click to browse</span>
              </>
            )}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            PDF, DOCX, XLSX, TXT, MD, CSV — up to {MAX_MB} MB each
          </p>
        </div>
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/70">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
      </div>

      {/* Upload errors */}
      {uploadErrors.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
          {uploadErrors.map((e, i) => (
            <p key={i} className="text-sm text-destructive">
              <span className="font-medium">{e.filename}:</span> {e.error}
            </p>
          ))}
        </div>
      )}

      {/* Retry errors — previously swallowed silently, leaving users with no
          feedback when the reprocess endpoint rejected the request. */}
      {reprocessError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">
            <span className="font-medium">Retry failed:</span> {reprocessError}
          </p>
        </div>
      )}

      {/* Documents table — uploaded files only */}
      {uploadDocs.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
          {uploadDocs.map((doc) => (
            <div key={doc.id} className="bg-card">
              {/* Row — mobile: two stacked lines (info, then meta+actions);
                  desktop: single row as before. */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                {/* File icon + info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted/60">
                    <svg className="h-3.5 w-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="break-words [overflow-wrap:anywhere] text-sm font-medium text-foreground">{doc.title}</div>
                    <div className="break-words [overflow-wrap:anywhere] text-xs text-muted-foreground">{doc.originalFilename}</div>
                  </div>
                </div>
                {/* Meta + actions on one wrapped line */}
                <div className="flex items-center justify-between gap-3 sm:gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-3 min-w-0">
                    <span>{formatSize(doc.fileSize)}</span>
                    <span className="hidden sm:inline">{doc.chunkCount != null ? `${doc.chunkCount.toLocaleString()} chunks` : "—"}</span>
                    <span className="hidden sm:block">{formatDate(doc.createdAt)}</span>
                    <StatusBadge status={doc.status} />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {doc.status === "failed" && (
                      <Button variant="ghost" size="sm" onClick={() => handleReprocess(doc.id)}
                        className="h-8 px-3 text-xs text-warning hover:text-warning hover:bg-warning/10">
                        Retry
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => onDelete(doc.id)}
                      aria-label={`Delete ${doc.title}`}
                      className="h-8 px-3 text-xs text-destructive hover:text-destructive hover:bg-destructive/10">
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
              {/* Failure reason — the single most requested piece of information
                  when an ingest fails. Collapsed by default, one click to view. */}
              {doc.status === "failed" && doc.errorMessage && (
                <div className="px-4 pb-3">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-destructive/90 hover:text-destructive">
                      <svg
                        className="h-3 w-3 transition-transform group-open:rotate-90"
                        fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                      Why did this fail?
                    </summary>
                    <p className="mt-1.5 break-words rounded-md border border-destructive/25 bg-destructive/[0.06] px-3 py-2 font-mono text-[11px] leading-4 text-destructive/90">
                      {doc.errorMessage}
                    </p>
                  </details>
                </div>
              )}

              {/* Chunk viewer — lazy, expandable */}
              {doc.status === "ready" && (
                <ChunkViewer kbId={kbId} docId={doc.id} chunkCount={doc.chunkCount} />
              )}
            </div>
          ))}
        </div>
      )}

      {uploadDocs.length === 0 && !uploading && (
        <p className="text-center text-sm text-muted-foreground py-4">
          No uploaded documents yet. Drop files above to get started.
        </p>
      )}
    </div>
  );
}
