"use client";

/**
 * src/components/admin/EmailTemplatesPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Settings → Email Templates — the email design workspace.
 *
 * Layout: template rail (left, searchable + categorized with status dots)
 * · template workspace (right, three tabs):
 *     Overview  — what recipients get now (rendered preview, meta, actions)
 *     Design    — Monaco (VS Code) editor + variable picker + live preview;
 *                 edits are saved as a DRAFT and go live only on Publish
 *     Settings  — active toggle, factory reset, change history (audit)
 *
 * The variable catalogue (system ∪ custom) is managed in a dialog and reused
 * by the editor's autocomplete and insert picker.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, CheckCircle2, Clock3, Eye, FileText, History, Loader2,
  Lock, Mail, Monitor, PencilLine, RotateCcw, Send, Settings2,
  Smartphone, Sparkles, Trash2, UploadCloud, Ban, Search, Variable as VariableIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiUrl } from "@/lib/runtime";
import { withAuthHeaders } from "@/lib/client-auth";
import { TemplateCodeEditor, type TemplateCodeEditorHandle } from "./email-templates/TemplateCodeEditor";
import { VariablePickerPopover } from "./email-templates/VariablePickerPopover";
import { VariablesManagerDialog } from "./email-templates/VariablesManagerDialog";
import {
  CATEGORY_LABELS, TEMPLATE_CATEGORY_ORDER, SAMPLE, formatDate, interpolate,
  unresolvedVariables, type AuditEntry, type EmailTemplate, type ManagedVariable,
  type TemplateVariable,
} from "./email-templates/shared";

type TabKey = "overview" | "design" | "settings";

export function EmailTemplatesPanel() {
  // ── Data ──────────────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [variables, setVariables] = useState<ManagedVariable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [guardKey, setGuardKey] = useState<string | null>(null);

  // ── Editor (draft) state ───────────────────────────────────────────────────
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<TabKey>("overview");

  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // ── Preview / misc ─────────────────────────────────────────────────────────
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [showSidePreview, setShowSidePreview] = useState(true);
  const [railQuery, setRailQuery] = useState("");

  // ── Dialogs ────────────────────────────────────────────────────────────────
  const [showVariablesManager, setShowVariablesManager] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const editorRef = useRef<TemplateCodeEditorHandle | null>(null);
  const initializedKey = useRef<string | null>(null);

  // ── Data loading ───────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/platform/email-templates"), { headers: withAuthHeaders() });
      const data = await res.json() as { templates?: EmailTemplate[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load templates");
      const list = data.templates ?? [];
      setTemplates(list);
      setSelectedKey((prev) =>
        prev && list.some((t) => t.key === prev) ? prev : (list[0]?.key ?? null));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadVariables = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/platform/email-variables"), { headers: withAuthHeaders() });
      const data = await res.json() as { variables?: ManagedVariable[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load variables");
      setVariables(data.variables ?? []);
    } catch (e) {
      console.warn("[templates] variable load failed:", (e as Error).message);
    }
  }, []);

  useEffect(() => { void load(); void loadVariables(); }, [load, loadVariables]);

  const selected = useMemo(
    () => templates.find((t) => t.key === selectedKey) ?? null,
    [templates, selectedKey],
  );

  /** Reset local editor state from a template row (draft ?? live). */
  const applyTemplate = useCallback((t: EmailTemplate) => {
    const base = t.draft ?? { subject: t.subject, bodyHtml: t.bodyHtml };
    setDraftSubject(base.subject);
    setDraftBody(base.bodyHtml);
    setDirty(false);
    initializedKey.current = t.key;
  }, []);

  // Initialise the editor whenever the selection changes.
  useEffect(() => {
    if (!selected) return;
    if (initializedKey.current === selected.key) return;
    applyTemplate(selected);
    setTestResult(null);
  }, [selected, applyTemplate]);

  // Warn before leaving the page with unsaved draft edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const customValues = useMemo(() => {
    const out: Record<string, string> = {};
    for (const v of variables) if (!v.isSystem) out[v.name] = v.value;
    return out;
  }, [variables]);

  const previewVars = useMemo(() => ({ ...SAMPLE, ...customValues }), [customValues]);

  const paletteVariables: TemplateVariable[] = useMemo(
    () =>
      variables.map((v) => ({
        name: v.name,
        description: v.isSystem
          ? v.description
          : `${v.description || "Custom variable"} — inserts “${v.value}”`,
      })),
    [variables],
  );

  const previewHtml = useMemo(() => interpolate(draftBody, previewVars), [draftBody, previewVars]);
  const previewSubject = useMemo(() => interpolate(draftSubject, previewVars), [draftSubject, previewVars]);
  const unresolved = useMemo(() => unresolvedVariables(previewHtml), [previewHtml]);

  const grouped = useMemo(() => {
    const needle = railQuery.trim().toLowerCase();
    const map = new Map<string, EmailTemplate[]>();
    for (const cat of TEMPLATE_CATEGORY_ORDER) {
      const items = templates.filter(
        (t) =>
          t.category === cat &&
          (!needle ||
            t.name.toLowerCase().includes(needle) ||
            t.description.toLowerCase().includes(needle)),
      );
      if (items.length) map.set(cat, items);
    }
    return map;
  }, [templates, railQuery]);

  const hasServerDraft = Boolean(selected?.draft);

  // ── Actions ────────────────────────────────────────────────────────────────
  const mergeTemplate = useCallback((t: EmailTemplate) => {
    setTemplates((prev) => prev.map((p) => (p.key === t.key ? t : p)));
  }, []);

  const saveDraft = useCallback(async () => {
    if (!selectedKey || !selected) return;
    if (!draftSubject.trim() || !draftBody.trim()) {
      setError("Subject and email body cannot be empty.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/platform/email-templates/${encodeURIComponent(selectedKey)}`), {
        method: "PUT",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ subject: draftSubject, bodyHtml: draftBody }),
      });
      const data = await res.json() as { ok?: boolean; template?: EmailTemplate; error?: string };
      if (!res.ok || !data.template) throw new Error(data.error ?? "Failed to save draft");
      mergeTemplate(data.template);
      applyTemplate(data.template);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [selectedKey, selected, draftSubject, draftBody, mergeTemplate, applyTemplate]);

  const publish = useCallback(async () => {
    if (!selectedKey) return;
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(
        apiUrl(`/api/platform/email-templates/${encodeURIComponent(selectedKey)}/publish`),
        { method: "POST", headers: withAuthHeaders() },
      );
      const data = await res.json() as { ok?: boolean; template?: EmailTemplate; error?: string };
      if (!res.ok || !data.template) throw new Error(data.error ?? "Failed to publish");
      mergeTemplate(data.template);
      applyTemplate(data.template);
      setTab("overview");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPublishing(false);
      setConfirmPublish(false);
    }
  }, [selectedKey, mergeTemplate, applyTemplate]);

  const discardDraft = useCallback(async () => {
    if (!selectedKey) return;
    setDiscarding(true);
    setError(null);
    try {
      const res = await fetch(
        apiUrl(`/api/platform/email-templates/${encodeURIComponent(selectedKey)}/discard`),
        { method: "POST", headers: withAuthHeaders() },
      );
      const data = await res.json() as { ok?: boolean; template?: EmailTemplate; error?: string };
      if (!res.ok || !data.template) throw new Error(data.error ?? "Failed to discard draft");
      mergeTemplate(data.template);
      applyTemplate(data.template);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDiscarding(false);
    }
  }, [selectedKey, mergeTemplate, applyTemplate]);

  const resetTemplate = useCallback(async () => {
    if (!selectedKey) return;
    setDiscarding(true);
    setError(null);
    try {
      const res = await fetch(
        apiUrl(`/api/platform/email-templates/${encodeURIComponent(selectedKey)}/reset`),
        { method: "POST", headers: withAuthHeaders() },
      );
      const data = await res.json() as { ok?: boolean; template?: EmailTemplate; error?: string };
      if (!res.ok || !data.template) throw new Error(data.error ?? "Failed to reset");
      mergeTemplate(data.template);
      applyTemplate(data.template);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDiscarding(false);
      setConfirmReset(false);
    }
  }, [selectedKey, mergeTemplate, applyTemplate]);

  const toggleActive = useCallback(async (next: boolean) => {
    if (!selectedKey || !selected) return;
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/platform/email-templates/${encodeURIComponent(selectedKey)}`), {
        method: "PUT",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ isActive: next }),
      });
      const data = await res.json() as { ok?: boolean; template?: EmailTemplate; error?: string };
      if (!res.ok || !data.template) throw new Error(data.error ?? "Failed to update");
      mergeTemplate(data.template);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [selectedKey, selected, mergeTemplate]);

  const sendTest = useCallback(async () => {
    if (!selectedKey || !testTo.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(apiUrl("/api/platform/email/test"), {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ to: testTo.trim(), templateKey: selectedKey }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Test send failed");
      setTestResult({ ok: Boolean(data.ok), error: data.error ?? undefined });
    } catch (e) {
      setTestResult({ ok: false, error: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }, [selectedKey, testTo]);

  const loadAudit = useCallback(async (key: string) => {
    setAuditLoading(true);
    try {
      const res = await fetch(
        apiUrl(`/api/platform/email-templates/${encodeURIComponent(key)}/audit?limit=10`),
        { headers: withAuthHeaders() },
      );
      const data = await res.json() as { entries?: AuditEntry[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load history");
      setAudit(data.entries ?? []);
    } catch (e) {
      console.warn("[templates] audit load failed:", (e as Error).message);
      setAudit([]);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "settings" && selectedKey) void loadAudit(selectedKey);
  }, [tab, selectedKey, loadAudit]);

  const selectTemplate = useCallback((key: string) => {
    if (key === selectedKey) return;
    if (dirty) {
      setGuardKey(key);
      return;
    }
    setSelectedKey(key);
    setTab("overview");
  }, [selectedKey, dirty]);

  const insertVariable = useCallback((name: string) => {
    editorRef.current?.insertVariable(name);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 animate-pulse rounded-xl bg-white/[0.04]" />
        <div className="h-[30rem] animate-pulse rounded-xl bg-white/[0.04]" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Compact header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-xs leading-relaxed text-white/40">
          Design every email Clara sends. Edits are saved as a <span className="text-white/70">draft</span> and
          reach real recipients only when you <span className="text-emerald-300">publish</span>.
          Placeholders like <code className="rounded bg-white/10 px-1 text-[11px] text-indigo-200">{"{{userName}}"}</code> fill in at send time.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowVariablesManager(true)}
          className="h-8 border-white/10 bg-white/[0.03] text-white/70 hover:border-indigo-500/40 hover:text-white"
        >
          <VariableIcon className="mr-1.5 h-3.5 w-3.5" />
          Manage variables
          <span className="ml-1.5 rounded-full bg-white/10 px-1.5 text-[10px] text-white/50">
            {variables.filter((v) => !v.isSystem).length} custom
          </span>
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[270px_minmax(0,1fr)]">
        {/* ── Template rail ─────────────────────────────────────────────── */}
        <nav aria-label="Email templates" className="lg:sticky lg:top-20 lg:self-start">
          <div className="mb-2.5 flex items-center gap-2 rounded-lg bg-white/[0.04] px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-white/30" />
            <input
              value={railQuery}
              onChange={(e) => setRailQuery(e.target.value)}
              placeholder="Search templates…"
              className="w-full bg-transparent text-xs text-white placeholder:text-white/25 focus:outline-none"
            />
          </div>
          <div className="max-h-[calc(100dvh-11rem)] space-y-4 overflow-y-auto pr-1">
            {[...grouped.entries()].map(([cat, items]) => (
              <div key={cat}>
                <h4 className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-white/30">
                  {CATEGORY_LABELS[cat] ?? cat}
                  <span className="ml-1.5 font-normal text-white/20">({items.length})</span>
                </h4>
                <ul className="space-y-1">
                  {items.map((t) => {
                    const active = t.key === selectedKey;
                    return (
                      <li key={t.key}>
                        <button
                          type="button"
                          onClick={() => selectTemplate(t.key)}
                          className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                            active
                              ? "bg-indigo-600/20 font-medium text-indigo-200 ring-1 ring-indigo-500/30"
                              : "text-white/55 hover:bg-white/[0.04] hover:text-white/85"
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            {t.draft && (
                              <span title="Unpublished draft" className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                            )}
                            <span className="block truncate">{t.name}</span>
                          </span>
                          {(t.isCustomized || !t.isActive) && (
                            <span className="mt-0.5 flex items-center gap-1.5">
                              {t.isCustomized && (
                                <span className="flex items-center gap-0.5 text-[9px] text-amber-300/80">
                                  <Sparkles className="h-2.5 w-2.5" /> custom
                                </span>
                              )}
                              {!t.isActive && (
                                <span className="flex items-center gap-0.5 text-[9px] text-white/30">
                                  <Ban className="h-2.5 w-2.5" /> using default
                                </span>
                              )}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {grouped.size === 0 && (
              <p className="px-2 py-4 text-xs text-white/30">No templates match “{railQuery}”.</p>
            )}
          </div>
        </nav>

        {/* ── Workspace ─────────────────────────────────────────────────── */}
        {selected ? (
          <div className="min-w-0 space-y-4">
            {/* Workspace header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-indigo-300" />
                  <h3 className="text-sm font-semibold text-white">{selected.name}</h3>
                  {selected.draft && (
                    <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 py-0 text-[10px] text-amber-300">
                      <Clock3 className="mr-1 h-2.5 w-2.5" /> draft pending
                    </Badge>
                  )}
                  {selected.isCustomized && (
                    <Badge variant="outline" className="py-0 text-[10px] text-amber-300/80">customized</Badge>
                  )}
                  {!selected.isActive && (
                    <Badge variant="outline" className="py-0 text-[10px] text-white/40">
                      <Ban className="mr-1 h-2.5 w-2.5" /> using factory default
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-white/40">{selected.description}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowTestDialog(true); setTestResult(null); }}
                className="h-8 shrink-0 border-white/10 bg-white/[0.03] text-white/70 hover:text-white"
              >
                <Send className="mr-1.5 h-3.5 w-3.5" /> Send test…
              </Button>
            </div>

            <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
              <TabsList className="h-9 bg-white/[0.04] p-1">
                <TabsTrigger value="overview" className="gap-1.5 px-3 text-xs data-[state=active]:bg-white/[0.08] data-[state=active]:text-white">
                  <Eye className="h-3.5 w-3.5" /> Overview
                </TabsTrigger>
                <TabsTrigger value="design" className="gap-1.5 px-3 text-xs data-[state=active]:bg-white/[0.08] data-[state=active]:text-white">
                  <PencilLine className="h-3.5 w-3.5" /> Design
                  {dirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                </TabsTrigger>
                <TabsTrigger value="settings" className="gap-1.5 px-3 text-xs data-[state=active]:bg-white/[0.08] data-[state=active]:text-white">
                  <Settings2 className="h-3.5 w-3.5" /> Settings & history
                </TabsTrigger>
              </TabsList>

              {/* ── Overview tab ─────────────────────────────────────────── */}
              <TabsContent value="overview" className="mt-4 space-y-4">
                {/* Meta */}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Live version</p>
                    <p className="mt-1.5 text-sm text-white/80">
                      {selected.isActive ? "Active — what recipients get" : "Using factory default"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-white/35">Published {formatDate(selected.updatedAt)}</p>
                  </div>
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Draft</p>
                    <p className="mt-1.5 text-sm text-white/80">
                      {selected.draft
                        ? "Pending — not yet sent to anyone"
                        : dirty
                          ? "Unsaved edits in the Design tab"
                          : "None"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-white/35">
                      {selected.draft ? `Saved ${formatDate(selected.draft.updatedAt)}` : "Open Design to edit"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Actions</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => setTab("design")} className="h-7 bg-indigo-600 text-xs hover:bg-indigo-500">
                        {selected.draft ? "Review draft" : "Edit"}
                      </Button>
                      {selected.draft && (
                        <Button
                          size="sm" variant="outline"
                          onClick={() => setConfirmPublish(true)}
                          className="h-7 border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-300 hover:bg-emerald-500/20"
                        >
                          <UploadCloud className="mr-1 h-3 w-3" /> Publish
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Preview */}
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-white/60">
                      <Eye className="h-3.5 w-3.5" /> Live preview
                      <span className="font-normal text-white/30">(sample data{Object.keys(customValues).length ? " + your custom variables" : ""})</span>
                    </label>
                    <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
                      <button
                        type="button"
                        onClick={() => setDevice("desktop")}
                        className={`rounded-md p-1.5 ${device === "desktop" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"}`}
                        title="Desktop width"
                      >
                        <Monitor className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDevice("mobile")}
                        className={`rounded-md p-1.5 ${device === "mobile" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"}`}
                        title="Mobile width (375px)"
                      >
                        <Smartphone className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
                    <div className="border-b border-white/[0.06] px-3 py-2 text-xs text-white/50">
                      <span className="text-white/30">Subject:</span> {interpolate(selected.subject, previewVars)}
                    </div>
                    <div className="flex justify-center bg-[#0a0a12] p-3">
                      <iframe
                        title="Email preview"
                        srcDoc={interpolate(selected.bodyHtml, previewVars)}
                        sandbox=""
                        className={`h-[26rem] border-0 bg-white transition-all ${device === "mobile" ? "w-[375px] max-w-full" : "w-full"}`}
                      />
                    </div>
                  </div>
                </div>

                {/* Unresolved variables + used variables */}
                {unresolvedVariables(interpolate(selected.bodyHtml, previewVars)).length > 0 && (
                  <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 text-xs text-amber-200/90">
                    <span className="font-medium">Placeholders that resolve to nothing:</span>{" "}
                    {unresolvedVariables(interpolate(selected.bodyHtml, previewVars)).map((n) => (
                      <code key={n} className="mx-0.5 rounded bg-amber-500/15 px-1 py-0.5 font-mono text-[11px]">{`{{${n}}}`}</code>
                    ))}
                    — they appear literally in sent emails. Check the spelling or ask for it at send time.
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Variables</span>
                  {selected.variables.map((v) => (
                    <span
                      key={v.name}
                      title={v.description}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-indigo-200/90"
                    >
                      {`{{${v.name}}}`}
                    </span>
                  ))}
                  {variables.filter((v) => !v.isSystem && !selected.variables.some((tv) => tv.name === v.name)).length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowVariablesManager(true)}
                      className="rounded-full border border-dashed border-white/15 px-2.5 py-1 text-[11px] text-white/40 hover:border-indigo-500/40 hover:text-indigo-200"
                    >
                      + {variables.filter((v) => !v.isSystem && !selected.variables.some((tv) => tv.name === v.name)).length} custom available
                    </button>
                  )}
                </div>
              </TabsContent>

              {/* ── Design tab ───────────────────────────────────────────── */}
              <TabsContent value="design" className="mt-4 space-y-4">
                {selected.draft && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-2.5 text-xs text-amber-200/90">
                    <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      You are editing a <strong>draft</strong> (saved {formatDate(selected.draft.updatedAt)}). Nothing
                      changes for recipients until you publish.
                      {dirty && " Unsaved edits in this tab are local — save them before leaving."}
                    </span>
                  </div>
                )}
                {!selected.draft && (
                  <div className="flex items-start gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-2.5 text-xs text-white/45">
                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>Saving creates a draft — the live email keeps being sent unchanged until you publish.</span>
                  </div>
                )}

                {/* Subject */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-white/60">Subject line</label>
                  <input
                    type="text"
                    value={draftSubject}
                    onChange={(e) => { setDraftSubject(e.target.value); setDirty(true); }}
                    className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-indigo-500/50 focus:outline-none"
                  />
                </div>

                {/* Editor + side preview */}
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-white/60">
                        <PencilLine className="h-3.5 w-3.5" /> HTML body
                      </label>
                      <div className="flex items-center gap-2">
                        <VariablePickerPopover variables={variables} onInsert={insertVariable} />
                        <button
                          type="button"
                          onClick={() => setShowSidePreview((p) => !p)}
                          className={`hidden items-center gap-1 text-[11px] transition-colors xl:flex ${showSidePreview ? "text-white/70" : "text-white/40 hover:text-white/70"}`}
                        >
                          <Eye className="h-3.5 w-3.5" /> {showSidePreview ? "Preview on" : "Preview off"}
                        </button>
                      </div>
                    </div>
                    <TemplateCodeEditor
                      ref={editorRef}
                      path={`email-template-${selected.key}.html`}
                      value={draftBody}
                      onChange={(v) => { setDraftBody(v); setDirty(true); }}
                      variables={paletteVariables}
                      onSave={() => void saveDraft()}
                    />
                  </div>

                  {showSidePreview && (
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-1.5 text-xs font-medium text-white/60">
                          <Eye className="h-3.5 w-3.5" /> Live preview
                          <span className="font-normal text-white/30">(sample data)</span>
                        </label>
                        <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
                          <button
                            type="button"
                            onClick={() => setDevice("desktop")}
                            className={`rounded-md p-1.5 ${device === "desktop" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"}`}
                            title="Desktop width"
                          >
                            <Monitor className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDevice("mobile")}
                            className={`rounded-md p-1.5 ${device === "mobile" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"}`}
                            title="Mobile width (375px)"
                          >
                            <Smartphone className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] xl:sticky xl:top-20">
                        <div className="border-b border-white/[0.06] px-3 py-2 text-xs text-white/50">
                          <span className="text-white/30">Subject:</span> {previewSubject}
                        </div>
                        <div className="flex justify-center bg-[#0a0a12] p-3">
                          <iframe
                            title="Draft email preview"
                            srcDoc={previewHtml}
                            sandbox=""
                            className={`h-[30rem] border-0 bg-white ${device === "mobile" ? "w-[375px] max-w-full" : "w-full"}`}
                          />
                        </div>
                      </div>
                      {unresolved.length > 0 && (
                        <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-[11px] text-amber-200/90">
                          <span className="font-medium">Not resolved:</span>{" "}
                          {unresolved.map((n) => (
                            <code key={n} className="mx-0.5 rounded bg-amber-500/15 px-1 font-mono">{`{{${n}}}`}</code>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3.5">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const hasDraft = Boolean(selected.draft) || dirty;
                        if (
                          hasDraft &&
                          !window.confirm(
                            "Discard the draft and any unsaved edits? The live email stays exactly as it is.",
                          )
                        ) return;
                        void discardDraft();
                      }}
                      disabled={discarding || (!dirty && !selected.draft)}
                      className="h-8 border-white/10 text-white/60 hover:border-red-500/30 hover:text-red-300"
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Discard draft
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] ${dirty ? "text-amber-300/90" : "text-white/30"}`}>
                      {dirty ? "Unsaved changes (Ctrl/Cmd+S)" : savedFlash ? "Draft saved" : hasServerDraft ? "Draft saved — not published" : "No changes"}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => void saveDraft()}
                      disabled={saving || (!dirty && hasServerDraft)}
                      className="h-8 bg-indigo-600 hover:bg-indigo-500"
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : savedFlash ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      ) : null}
                      {savedFlash ? "Saved" : "Save draft"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setConfirmPublish(true)}
                      disabled={publishing || dirty || !hasServerDraft}
                      title={dirty ? "Save your changes first" : !hasServerDraft ? "Nothing to publish yet — save a draft first" : "Make this version live"}
                      className="h-8 bg-emerald-600 hover:bg-emerald-500"
                    >
                      {publishing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UploadCloud className="h-4 w-4" />
                      )}
                      Publish
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* ── Settings & history tab ────────────────────────────────── */}
              <TabsContent value="settings" className="mt-4 space-y-4">
                <div className="space-y-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">Use this template</p>
                      <p className="mt-1 text-xs leading-relaxed text-white/40">
                        Off = the factory default is sent instead. Content edits you publish are kept and
                        return when you switch it back on.
                      </p>
                    </div>
                    <Switch
                      checked={selected.isActive}
                      onCheckedChange={(v) => void toggleActive(v)}
                    />
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">Restore factory default</p>
                      <p className="mt-1 text-xs leading-relaxed text-white/40">
                        Resets wording and design to the built-in original and deletes any draft. Your
                        customizations cannot be recovered.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmReset(true)}
                      disabled={discarding}
                      className="h-8 shrink-0 border-white/10 text-white/60 hover:border-amber-500/30 hover:text-amber-300"
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
                    </Button>
                  </div>
                </div>

                {/* History */}
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-white">
                    <History className="h-4 w-4 text-white/40" /> Recent changes
                  </p>
                  <p className="mt-1 text-xs text-white/40">
                    Every change that affected real recipients (publishes, resets, toggles).
                  </p>
                  {auditLoading ? (
                    <div className="mt-3 flex items-center gap-2 text-xs text-white/40">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading history…
                    </div>
                  ) : audit.length === 0 ? (
                    <p className="mt-3 text-xs text-white/30">No recorded changes yet.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {audit.map((a) => (
                        <li key={a.id} className="flex items-center gap-2.5 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              a.action === "publish"
                                ? "bg-emerald-500/15 text-emerald-300"
                                : a.action === "reset"
                                  ? "bg-amber-500/15 text-amber-300"
                                  : "bg-white/10 text-white/50"
                            }`}
                          >
                            {a.action}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs text-white/60" title={a.subject}>
                            {a.subject}
                          </span>
                          <span className="shrink-0 text-[10px] text-white/30">{formatDate(a.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center rounded-xl border border-white/[0.08] text-sm text-white/30">
            Select a template to edit.
          </div>
        )}
      </div>

      {/* ── Unsaved-changes guard ────────────────────────────────────────── */}
      <Dialog open={guardKey !== null} onOpenChange={(o) => { if (!o) setGuardKey(null); }}>
        <DialogContent className="w-[min(28rem,92vw)] border-white/10 bg-[#0d0f1a] text-white">
          <DialogHeader>
            <DialogTitle className="text-base">Unsaved changes</DialogTitle>
            <DialogDescription className="text-sm text-white/50">
              You edited this template but have not saved the draft. Switching now discards your edits.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setGuardKey(null)} className="border-white/10">
              Keep editing
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (guardKey) {
                  setSelectedKey(guardKey);
                  setTab("overview");
                  setDirty(false);
                }
                setGuardKey(null);
              }}
              className="border-red-500/30 text-red-300 hover:bg-red-500/10"
            >
              Discard & switch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Publish confirmation ─────────────────────────────────────────── */}
      <Dialog open={confirmPublish} onOpenChange={setConfirmPublish}>
        <DialogContent className="w-[min(28rem,92vw)] border-white/10 bg-[#0d0f1a] text-white">
          <DialogHeader>
            <DialogTitle className="text-base">Publish this template?</DialogTitle>
            <DialogDescription className="text-sm text-white/50">
              The draft becomes the live version — every future {selected?.name} email is sent with it.
              The previous version is replaced (recorded in history).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmPublish(false)} className="border-white/10">
              Cancel
            </Button>
            <Button
              onClick={() => void publish()}
              disabled={publishing}
              className="bg-emerald-600 hover:bg-emerald-500"
            >
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reset confirmation ───────────────────────────────────────────── */}
      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent className="w-[min(28rem,92vw)] border-white/10 bg-[#0d0f1a] text-white">
          <DialogHeader>
            <DialogTitle className="text-base">Restore factory default?</DialogTitle>
            <DialogDescription className="text-sm text-white/50">
              Both the live template and any draft return to the built-in original. Customizations cannot
              be recovered.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmReset(false)} className="border-white/10">
              Cancel
            </Button>
            <Button
              onClick={() => void resetTemplate()}
              disabled={discarding}
              className="bg-amber-600 hover:bg-amber-500"
            >
              {discarding ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Reset to default
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Test send dialog ─────────────────────────────────────────────── */}
      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent className="w-[min(26rem,92vw)] border-white/10 bg-[#0d0f1a] text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4 text-indigo-300" /> Send a test
            </DialogTitle>
            <DialogDescription className="text-sm text-white/50">
              Sends the <strong>live</strong> version of “{selected?.name}” with sample data to a real inbox —
              a great final check after publishing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5">
            <input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-indigo-500/50 focus:outline-none"
            />
            {testResult && (
              <p className={`text-xs ${testResult.ok ? "text-emerald-400" : "text-red-400"}`}>
                {testResult.ok
                  ? "Sent — check the inbox (and spam folder on first sends)."
                  : `Failed: ${testResult.error ?? "unknown error"}`}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowTestDialog(false)} className="border-white/10">
              Close
            </Button>
            <Button
              onClick={() => void sendTest()}
              disabled={testing || !testTo.trim()}
              className="bg-indigo-600 hover:bg-indigo-500"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Variables manager ────────────────────────────────────────────── */}
      <VariablesManagerDialog
        open={showVariablesManager}
        onClose={() => setShowVariablesManager(false)}
        onChanged={() => void loadVariables()}
      />
    </div>
  );
}
