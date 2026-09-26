"use client";

/**
 * src/components/admin/email-templates/VariablesManagerDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The managed variable catalogue (Settings → Email Templates → Variables).
 *
 *   · System variables (userName, resetUrl…) are supplied by the platform at
 *     send time — shown with a lock; only their description can be edited.
 *   · Custom variables are static values the admin defines once and can use
 *     in every template ({{supportEmail}}, {{companyAddress}}…).
 *   · Deleting a variable still referenced by a template is blocked until it
 *     is removed there (or forced, after an explicit warning).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Braces, Loader2, Lock, PencilLine, Plus, Search, Trash2, X,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/runtime";
import { withAuthHeaders } from "@/lib/client-auth";
import {
  CATEGORY_LABELS, VARIABLE_CATEGORY_ORDER, formatDate, type ManagedVariable,
} from "./shared";
import { confirmAction } from "@/components/ui/confirm-dialog";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called after any create/update/delete so the parent can refresh. */
  onChanged?: () => void;
};

type DraftVariable = {
  name: string;
  category: string;
  description: string;
  value: string;
};

const EMPTY_DRAFT: DraftVariable = { name: "", category: "custom", description: "", value: "" };

export function VariablesManagerDialog({ open, onClose, onChanged }: Props) {
  const [variables, setVariables] = useState<ManagedVariable[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<DraftVariable>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftVariable>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/platform/email-variables"), { headers: withAuthHeaders() });
      const data = await res.json() as { variables?: ManagedVariable[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load variables");
      setVariables(data.variables ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return variables;
    return variables.filter(
      (v) => v.name.toLowerCase().includes(needle) || v.description.toLowerCase().includes(needle),
    );
  }, [variables, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, ManagedVariable[]>();
    for (const cat of VARIABLE_CATEGORY_ORDER) {
      const items = filtered.filter((v) => v.category === cat);
      if (items.length) map.set(cat, items);
    }
    return map;
  }, [filtered]);

  const createVariable = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(apiUrl("/api/platform/email-variables"), {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(draft),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create variable");
      setDraft(EMPTY_DRAFT);
      setAdding(false);
      setNotice(`Added {{${draft.name.trim()}}} — you can use it in every template now.`);
      await load();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const isSystem = variables.find((v) => v.name === editing)?.isSystem;
      const res = await fetch(apiUrl(`/api/platform/email-variables/${encodeURIComponent(editing)}`), {
        method: "PUT",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(
          isSystem
            ? { description: editDraft.description }
            : { description: editDraft.description, value: editDraft.value, category: editDraft.category },
        ),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setEditing(null);
      await load();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const deleteVariable = async (name: string, force = false) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        apiUrl(`/api/platform/email-variables/${encodeURIComponent(name)}${force ? "?force=true" : ""}`),
        { method: "DELETE", headers: withAuthHeaders() },
      );
      const data = await res.json() as { ok?: boolean; error?: string; usedIn?: string[] };
      if (!res.ok) {
        if (res.status === 409 && data.usedIn?.length) {
          const proceed = await confirmAction({
            title: `{{${name}}} is still used by ${data.usedIn.length} template(s)`,
            description:
              `Used in: ${data.usedIn.join(", ")}. If you delete it, those placeholders appear literally in sent emails until removed.`,
            confirmLabel: "Delete anyway",
            destructive: true,
          });
          if (proceed) {
            setBusy(false);
            await deleteVariable(name, true);
            return;
          }
          setBusy(false);
          return;
        }
        throw new Error(data.error ?? "Failed to delete");
      }
      setNotice(`Deleted {{${name}}}.`);
      await load();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] w-[min(56rem,95vw)] overflow-y-auto sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Braces className="h-4 w-4 text-primary" /> Template variables
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
            Placeholders like <code className="rounded bg-muted px-1">{"{{userName}}"}</code> are replaced
            when an email goes out. System values are supplied by the platform (locked). Custom variables
            hold values you define — usable in every template.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600">
            {notice}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search variables…"
              className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/80 focus:outline-none"
            />
          </div>
          <Button
            size="sm"
            onClick={() => { setAdding((a) => !a); setDraft(EMPTY_DRAFT); }}
            className="h-8 bg-primary hover:bg-primary/90"
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> New custom variable
          </Button>
        </div>

        {/* Add form */}
        {adding && (
          <div className="space-y-2.5 rounded-xl border border-primary/25 bg-primary/5 p-3.5">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Name</span>
                <div className="flex items-center rounded-lg border border-input bg-background px-2.5 focus-within:border-primary/50">
                  <span className="font-mono text-xs text-muted-foreground/70">{"{{"}</span>
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") }))}
                    placeholder="supportEmail"
                    className="w-full bg-transparent px-1 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/80 focus:outline-none"
                  />
                  <span className="font-mono text-xs text-muted-foreground/70">{"}}"}</span>
                </div>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Category</span>
                <select
                  value={draft.category}
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                  className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-xs text-foreground focus:border-primary/50 focus:outline-none"
                >
                  {VARIABLE_CATEGORY_ORDER.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c] ?? c}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Value — inserted wherever {"{{name}}"} appears
              </span>
              <input
                value={draft.value}
                onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
                placeholder="support@yourcompany.com"
                className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/80 focus:border-primary/50 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Description (optional)</span>
              <input
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="Shown in the variable picker to explain what this holds"
                className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/80 focus:border-primary/50 focus:outline-none"
              />
            </label>
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setAdding(false)} className="h-8">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => void createVariable()}
                disabled={busy || !draft.name.trim() || !draft.value.trim()}
                className="h-8 bg-primary hover:bg-primary/90"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add variable
              </Button>
            </div>
          </div>
        )}

        {/* Catalogue */}
        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading variables…
          </div>
        ) : (
          <div className="space-y-4">
            {[...grouped.entries()].map(([cat, items]) => (
              <div key={cat}>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {CATEGORY_LABELS[cat] ?? cat}
                  <span className="ml-1.5 font-normal normal-case text-muted-foreground/70">({items.length})</span>
                </p>
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {items.map((v) => {
                    const isEditing = editing === v.name;
                    return (
                      <li key={v.name} className="bg-card">
                        {isEditing ? (
                          <div className="space-y-2.5 p-3.5">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs text-primary">{`{{${v.name}}}`}</span>
                              {v.isSystem && (
                                <span className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                                  <Lock className="h-3 w-3" /> system — value comes from the platform
                                </span>
                              )}
                            </div>
                            {!v.isSystem && (
                              <div className="grid gap-2.5 sm:grid-cols-2">
                                <label className="block">
                                  <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Value</span>
                                  <input
                                    value={editDraft.value}
                                    onChange={(e) => setEditDraft((d) => ({ ...d, value: e.target.value }))}
                                    className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-xs text-foreground focus:border-primary/50 focus:outline-none"
                                  />
                                </label>
                                <label className="block">
                                  <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Category</span>
                                  <select
                                    value={editDraft.category}
                                    onChange={(e) => setEditDraft((d) => ({ ...d, category: e.target.value }))}
                                    className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-xs text-foreground focus:border-primary/50 focus:outline-none"
                                  >
                                    {VARIABLE_CATEGORY_ORDER.map((c) => (
                                      <option key={c} value={c}>
                                        {CATEGORY_LABELS[c] ?? c}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                            )}
                            <label className="block">
                              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Description</span>
                              <input
                                value={editDraft.description}
                                onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                                className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-xs text-foreground focus:border-primary/50 focus:outline-none"
                              />
                            </label>
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => setEditing(null)} className="h-8">
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => void saveEdit()}
                                disabled={busy || (!v.isSystem && !editDraft.value.trim())}
                                className="h-8 bg-primary hover:bg-primary/90"
                              >
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                                Save
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3.5 py-2.5">
                            <code className="shrink-0 font-mono text-xs text-primary">{`{{${v.name}}}`}</code>
                            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                              {v.isSystem
                                ? v.description
                                : `${v.description || "Custom variable"} — “${v.value}”`}
                            </span>
                            <span
                              className={`shrink-0 text-[11px] ${v.usedIn.length ? "text-muted-foreground" : "text-muted-foreground/70"}`}
                              title={v.usedIn.join(", ") || "Not referenced by any template"}
                            >
                              {v.usedIn.length
                                ? `used in ${v.usedIn.length} template${v.usedIn.length > 1 ? "s" : ""}`
                                : "unused"}
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                              {v.isSystem && (
                                <span title="System variable — supplied by the platform at send time">
                                  <Lock className="h-3.5 w-3.5 text-muted-foreground/70" />
                                </span>
                              )}
                              <button
                                type="button"
                                title="Edit"
                                onClick={() => {
                                  setEditing(v.name);
                                  setEditDraft({
                                    name: v.name,
                                    category: v.category,
                                    description: v.description,
                                    value: v.value,
                                  });
                                }}
                                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              >
                                <PencilLine className="h-3.5 w-3.5" />
                              </button>
                              {!v.isSystem && (
                                <button
                                  type="button"
                                  title="Delete"
                                  onClick={() => void deleteVariable(v.name)}
                                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </span>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {grouped.size === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground/70">
                No variables match “{q}”.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground/70">
              Last refreshed {formatDate(new Date().toISOString())} · system names are the platform’s
              send-time contract and cannot be renamed or deleted.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </DialogContent>
    </Dialog>
  );
}
