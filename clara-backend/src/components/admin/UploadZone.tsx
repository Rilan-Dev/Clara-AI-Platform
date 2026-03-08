"use client";
/**
 * UploadZone — drag-and-drop multi-file upload with live status table
 */
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import type { KbDocument } from "@/modules/admin-ui/api";

const ACCEPTED = ".pdf,.docx,.txt,.md,.csv";
const MAX_MB = 50;

type UploadError = { filename: string; error: string };

type Props = {
  docs: KbDocument[];
  onUpload: (files: File[]) => Promise<{ queued: KbDocument[]; errors: UploadError[] }>;
  onDelete: (docId: string) => Promise<void>;
  onReprocess: (docId: string) => Promise<void>;
};

export function UploadZone({ docs, onUpload, onDelete, onReprocess }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<UploadError[]>([]);

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
          "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-200 select-none",
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
            {uploading ? "Uploading…" : "Drop files here or click to browse"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            PDF, DOCX, TXT, MD, CSV — up to {MAX_MB} MB each
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

      {/* Documents table */}
      {docs.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Document</th>
                <th className="px-4 py-2.5 text-left font-medium">Size</th>
                <th className="px-4 py-2.5 text-left font-medium">Chunks</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-left font-medium">Uploaded</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {docs.map((doc) => (
                <tr key={doc.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 max-w-[220px]">
                    <div className="font-medium text-foreground truncate">{doc.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{doc.originalFilename}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatSize(doc.fileSize)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {doc.chunkCount != null ? doc.chunkCount.toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={doc.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(doc.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {doc.status === "failed" && (
                        <Button variant="ghost" size="sm" onClick={() => onReprocess(doc.id)}
                          className="h-7 px-2 text-xs text-warning hover:text-warning hover:bg-warning/10">
                          Retry
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => onDelete(doc.id)}
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10">
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {docs.length === 0 && !uploading && (
        <p className="text-center text-sm text-muted-foreground py-4">
          No documents yet. Upload your first document above.
        </p>
      )}
    </div>
  );
}
