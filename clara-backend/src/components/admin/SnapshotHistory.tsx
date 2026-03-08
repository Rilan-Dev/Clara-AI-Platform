"use client";
/**
 * SnapshotHistory — shows up to 5 config snapshots with restore button.
 * Displayed in the assistant config page sidebar.
 */
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ConfigSnapshot } from "@/modules/admin-ui/api";

type Props = {
  snapshots: ConfigSnapshot[];
  onSave:    (label?: string) => Promise<ConfigSnapshot>;
  onRestore: (snapshotId: string) => Promise<unknown>;
  onRefetch: () => void;
};

export function SnapshotHistory({ snapshots, onSave, onRestore, onRefetch }: Props) {
  const [saving, setSaving]   = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [label, setLabel]     = useState("");
  const [error, setError]     = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function flash(msg: string) {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(label.trim() || undefined);
      setLabel("");
      flash("Snapshot saved");
      onRefetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [label, onSave, onRefetch]);

  const handleRestore = useCallback(async (id: string) => {
    if (!confirm("Restore this snapshot? The current config will be saved first so you can undo.")) return;
    setRestoring(id);
    setError(null);
    try {
      await onRestore(id);
      flash("Config restored — reload the page to see changes");
      onRefetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRestoring(null);
    }
  }, [onRestore, onRefetch]);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-muted/30 px-4 py-3 flex items-center gap-2">
        <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-sm font-semibold text-foreground">Version History</span>
        <span className="ml-auto text-xs text-muted-foreground">{snapshots.length}/5</span>
      </div>

      {/* Manual save */}
      <div className="border-b border-border px-4 py-3 space-y-2">
        <p className="text-xs text-muted-foreground">Save current config as a named checkpoint.</p>
        <div className="flex gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            className="h-8 text-sm flex-1"
            disabled={saving}
          />
          <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={handleSave} disabled={saving}>
            {saving ? "…" : "Save"}
          </Button>
        </div>
        {error   && <p className="text-xs text-destructive">{error}</p>}
        {message && <p className="text-xs text-success">{message}</p>}
      </div>

      {/* Snapshot list */}
      {snapshots.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">No snapshots yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Snapshots are auto-saved before every config edit.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {snapshots.map((snap, i) => (
            <li key={snap.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/10 transition-colors">
              {/* Version badge */}
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {snapshots.length - i}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {snap.label ?? (i === 0 ? "Latest" : `Version ${snapshots.length - i}`)}
                </p>
                <p className="text-xs text-muted-foreground">{formatDate(snap.createdAt)}</p>
              </div>
              {/* Restore */}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 text-xs text-primary hover:bg-primary/10"
                onClick={() => handleRestore(snap.id)}
                disabled={restoring === snap.id}
              >
                {restoring === snap.id ? "…" : "Restore"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
