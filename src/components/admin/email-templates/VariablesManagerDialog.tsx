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
          const proceed = window.confirm(
            `{{${name}}} is still used by ${data.usedIn.length} template(s):\n\n` +
            data.usedIn.join("\n") +
            "\n\nDelete anyway? Those placeholders will show up literally in sent emails until removed.",
          );
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
      <DialogContent className="max-h-[85vh] w-[min(56rem,95vw)] overflow-y-auto border-white/10 bg-[#0d0f1a] text-white sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Braces className="h-4 w-4 text-indigo-300" /> Template variables
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-white/45">
            Placeholders like <code className="rounded bg-white/10 px-1">{"{{userName}}"}</code> are replaced
            when an email goes out. System values are supplied by the platform (locked). Custom variables
            hold values you define — usable in every template.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            {notice}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-white/[0.04] px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-white/30" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search variables…"
              className="w-full bg-transparent text-xs text-white placeholder:text-white/25 focus:outline-none"
            />
          </div>
          <Button
            size="sm"
            onClick={() => { setAdding((a) => !a); setDraft(EMPTY_DRAFT); }}
            className="h-8 bg-indigo-600 hover:bg-indigo-500"
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> New custom variable
          </Button>
        </div>

        {/* Add form */}
        {adding && (
          <div className="space-y-2.5 rounded-xl border border-indigo-500/25 bg-indigo-500/[0.06] p-3.5">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-white/55">Name</span>
                <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.03] px-2.5 focus-within:border-indigo-500/50">
                  <span className="font-mono text-xs text-white/30">{"{{"}</span>
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") }))}
                    placeholder="supportEmail"
                    className="w-full bg-transparent px-1 py-2 font-mono text-xs text-white placeholder:text-white/25 focus:outline-none"
                  />
                  <span className="font-mono text-xs text-white/30">{"}}"}</span>
                </div>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-white/55">Category</span>
                <select
                  value={draft.category}
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-xs text-white focus:border-indigo-500/50 focus:outline-none"
                >
                  {VARIABLE_CATEGORY_ORDER.map((c) => (
                    <option key={c} value={c} className="bg-[#12131f]">
                      {CATEGORY_LABELS[c] ?? c}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-white/55">
                Value — inserted wherever {"{{name}}"} appears
              </span>
              <input
                value={draft.value}
                onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
                placeholder="support@yourcompany.com"
                className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-xs text-white placeholder:text-white/25 focus:border-indigo-500/50 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-white/55">Description (optional)</span>
              <input
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="Shown in the variable picker to explain what this holds"
                className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-xs text-white placeholder:text-white/25 focus:border-indigo-500/50 focus:outline-none"
              />
            </label>
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setAdding(false)} className="h-8 border-white/10">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => void createVariable()}
                disabled={busy || !draft.name.trim() || !draft.value.trim()}
                className="h-8 bg-indigo-600 hover:bg-indigo-500"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add variable
              </Button>
            </div>
          </div>
        )}

        {/* Catalogue */}
        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-white/40">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading variables…
          </div>
        ) : (
          <div className="space-y-4">
            {[...grouped.entries()].map(([cat, items]) => (
              <div key={cat}>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/30">
                  {CATEGORY_LABELS[cat] ?? cat}
                  <span className="ml-1.5 font-normal normal-case text-white/25">({items.length})</span>
                </p>
                <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.07]">
                  {items.map((v) => {
                    const isEditing = editing === v.name;
                    return (
                      <li key={v.name} className="bg-white/[0.02]">
                        {isEditing ? (
                          <div className="space-y-2.5 p-3.5">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs text-indigo-200">{`{{${v.name}}}`}</span>
                              {v.isSystem && (
                                <span className="flex items-center gap-1 text-[10px] text-white/35">
                                  <Lock className="h-3 w-3" /> system — value comes from the platform
                                </span>
                              )}
                            </div>
                            {!v.isSystem && (
                              <div className="grid gap-2.5 sm:grid-cols-2">
                                <label className="block">
                                  <span className="mb-1 block text-[11px] font-medium text-white/55">Value</span>
                                  <input
                                    value={editDraft.value}
                                    onChange={(e) => setEditDraft((d) => ({ ...d, value: e.target.value }))}
                                    className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-xs text-white focus:border-indigo-500/50 focus:outline-none"
                                  />
                                </label>
                                <label className="block">
                                  <span className="mb-1 block text-[11px] font-medium text-white/55">Category</span>
                                  <select
                                    value={editDraft.category}
                                    onChange={(e) => setEditDraft((d) => ({ ...d, category: e.target.value }))}
                                    className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-xs text-white focus:border-indigo-500/50 focus:outline-none"
                                  >
                                    {VARIABLE_CATEGORY_ORDER.map((c) => (
                                      <option key={c} value={c} className="bg-[#12131f]">
                                        {CATEGORY_LABELS[c] ?? c}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                            )}
                            <label className="block">
                              <span className="mb-1 block text-[11px] font-medium text-white/55">Description</span>
                              <input
                                value={editDraft.description}
                                onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                                className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-xs text-white focus:border-indigo-500/50 focus:outline-none"
                              />
                            </label>
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => setEditing(null)} className="h-8 border-white/10">
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => void saveEdit()}
                                disabled={busy || (!v.isSystem && !editDraft.value.trim())}
                                className="h-8 bg-indigo-600 hover:bg-indigo-500"
                              >
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                                Save
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3.5 py-2.5">
                            <code className="shrink-0 font-mono text-xs text-indigo-200">{`{{${v.name}}}`}</code>
                            <span className="min-w-0 flex-1 truncate text-xs text-white/45">
                              {v.isSystem
                                ? v.description
                                : `${v.description || "Custom variable"} — “${v.value}”`}
                            </span>
                            <span
                              className={`shrink-0 text-[10px] ${v.usedIn.length ? "text-white/40" : "text-white/25"}`}
                              title={v.usedIn.join(", ") || "Not referenced by any template"}
                            >
                              {v.usedIn.length
                                ? `used in ${v.usedIn.length} template${v.usedIn.length > 1 ? "s" : ""}`
                                : "unused"}
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                              {v.isSystem && (
                                <span title="System variable — supplied by the platform at send time">
                                  <Lock className="h-3.5 w-3.5 text-white/30" />
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
                                className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white"
                              >
                                <PencilLine className="h-3.5 w-3.5" />
                              </button>
                              {!v.isSystem && (
                                <button
                                  type="button"
                                  title="Delete"
                                  onClick={() => void deleteVariable(v.name)}
                                  className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-red-500/15 hover:text-red-300"
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
              <p className="py-8 text-center text-sm text-white/30">
                No variables match “{q}”.
              </p>
            )}
            <p className="text-[11px] text-white/30">
              Last refreshed {formatDate(new Date().toISOString())} · system names are the platform’s
              send-time contract and cannot be renamed or deleted.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-md p-1 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </DialogContent>
    </Dialog>
  );
}
