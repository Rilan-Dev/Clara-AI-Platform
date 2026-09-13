"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  FileText, Save, RotateCcw, CheckCircle2, AlertCircle, Loader2,
  Eye, Send, Code2, Sparkles, Ban,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/runtime";
import { withAuthHeaders } from "@/lib/client-auth";

/**
 * EmailTemplatesPanel — Settings → Email Templates
 * ─────────────────────────────────────────────────────────────────────────────
 * Full HTML editor for every transactional email the platform sends
 * (password resets, invitations, subscription lifecycle notices…).
 *
 * Layout: template list (left) · editor + live preview (right).
 *   - {{placeholders}} are interpolated at send time; hover a variable chip to
 *     see what it holds, click to insert it at the cursor.
 *   - Save writes to the `email_templates` table (audited); Reset restores
 *     the factory default.
 *   - "Send test" pushes a real email rendered with sample data.
 */

type TemplateVariable = { name: string; description: string };

type EmailTemplate = {
  key: string; name: string; description: string; category: string;
  subject: string; bodyHtml: string; variables: TemplateVariable[];
  isActive: boolean; updatedAt: string; isCustomized: boolean;
};

const CATEGORY_LABELS: Record<string, string> = {
  auth: "Account & security",
  invitation: "Invitations",
  subscription: "Subscriptions & billing",
  system: "System",
};

const CATEGORY_ORDER = ["auth", "invitation", "subscription", "system"];

// Friendly sample values for the live preview + test sends.
const SAMPLE: Record<string, string> = {
  userName: "Aisha Rahman",
  orgName: "Demo Organisation",
  planName: "Pro",
  oldPlan: "Starter",
  newPlan: "Pro",
  role: "org admin",
  trialEnd: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
  trialDays: "7",
  note: "We upgraded you early — enjoy!",
  resetUrl: "https://clara.example.com/login/reset?token=sample-token",
  inviteUrl: "https://clara.example.com/login/reset?token=sample-token",
  loginUrl: "https://clara.example.com/login",
  renewUrl: "https://clara.example.com/login",
  appName: "Clara AI",
  provider: "resend",
  sentAt: new Date().toLocaleString(),
  to: "you@example.com",
};

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (match, name: string) =>
    name in vars ? vars[name] : match,
  );
}

export function EmailTemplatesPanel() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [dirty, setDirty] = useState(false);

  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [showPreview, setShowPreview] = useState(true);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/platform/email-templates"), { headers: withAuthHeaders() });
      const data = await res.json() as { templates?: EmailTemplate[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load templates");
      const list = data.templates ?? [];
      setTemplates(list);
      setSelectedKey((prev) => {
        const stillExists = prev && list.some((t) => t.key === prev);
        return stillExists ? prev : (list[0]?.key ?? null);
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Load the selected template into the editor draft.
  useEffect(() => {
    const t = templates.find((tpl) => tpl.key === selectedKey);
    if (!t) return;
    setDraftSubject(t.subject);
    setDraftBody(t.bodyHtml);
    setIsActive(t.isActive);
    setDirty(false);
    setTestResult(null);
  }, [selectedKey, templates]);

  const selected = templates.find((t) => t.key === selectedKey) ?? null;

  const previewHtml = useMemo(
    () => interpolate(draftBody, SAMPLE),
    [draftBody],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, EmailTemplate[]>();
    for (const cat of CATEGORY_ORDER) {
      const items = templates.filter((t) => t.category === cat);
      if (items.length) map.set(cat, items);
    }
    return map;
  }, [templates]);

  const insertVariable = (name: string) => {
    const el = textareaRef.current;
    if (!el) {
      setDraftBody((b) => `${b}{{${name}}}`);
      setDirty(true);
      return;
    }
    const start = el.selectionStart ?? draftBody.length;
    const end = el.selectionEnd ?? start;
    const insert = `{{${name}}}`;
    const next = draftBody.slice(0, start) + insert + draftBody.slice(end);
    setDraftBody(next);
    setDirty(true);
    // Restore cursor after React re-render.
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + insert.length;
    });
  };

  const save = async () => {
    if (!selectedKey) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/platform/email-templates/${encodeURIComponent(selectedKey)}`), {
        method: "PUT",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ subject: draftSubject, bodyHtml: draftBody, isActive }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const resetTemplate = async () => {
    if (!selectedKey) return;
    setResetting(true);
    setError(null);
    try {
      const res = await fetch(
        apiUrl(`/api/platform/email-templates/${encodeURIComponent(selectedKey)}/reset`),
        { method: "POST", headers: withAuthHeaders() },
      );
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to reset");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setResetting(false);
    }
  };

  const sendTest = async () => {
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
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 rounded-xl bg-white/[0.04] animate-pulse" />
        <div className="h-[30rem] rounded-xl bg-white/[0.04] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Intro */}
      <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.08] to-violet-500/[0.04] p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-white">Every email, fully editable</h2>
        <p className="mt-2 text-xs leading-relaxed text-white/45">
          Each template below is a complete HTML email. Edit the design and wording,
          preview it live with sample data, then send yourself a test before saving.
          Placeholders like <code className="rounded bg-white/10 px-1 py-0.5 text-[11px] text-indigo-200">{"{{userName}}"}</code> are
          replaced with real values when the email goes out. Reset any time to the
          factory default — every change is audited.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* ── Template list ─────────────────────────────────────────────── */}
        <nav aria-label="Email templates" className="lg:sticky lg:top-20 lg:self-start">
          <div className="max-h-[calc(100dvh-8rem)] space-y-4 overflow-y-auto pr-1">
            {[...grouped.entries()].map(([cat, items]) => (
              <div key={cat}>
                <h4 className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-white/30">
                  {CATEGORY_LABELS[cat] ?? cat}
                </h4>
                <ul className="space-y-1">
                  {items.map((t) => {
                    const active = t.key === selectedKey;
                    return (
                      <li key={t.key}>
                        <button
                          type="button"
                          onClick={() => setSelectedKey(t.key)}
                          className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                            active
                              ? "bg-indigo-600/20 text-indigo-200 font-medium ring-1 ring-indigo-500/30"
                              : "text-white/55 hover:bg-white/[0.04] hover:text-white/85"
                          }`}
                        >
                          <span className="block truncate">{t.name}</span>
                          <span className="mt-0.5 flex items-center gap-1.5">
                            {t.isCustomized && (
                              <span className="flex items-center gap-0.5 text-[9px] text-amber-300/80">
                                <Sparkles className="w-2.5 h-2.5" /> custom
                              </span>
                            )}
                            {!t.isActive && (
                              <span className="flex items-center gap-0.5 text-[9px] text-white/30">
                                <Ban className="w-2.5 h-2.5" /> disabled
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        {/* ── Editor ────────────────────────────────────────────────────── */}
        {selected ? (
          <div className="min-w-0 space-y-4">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-300" />
                  <h3 className="text-sm font-semibold text-white">{selected.name}</h3>
                  {selected.isCustomized && (
                    <Badge variant="outline" className="text-[10px] text-amber-300/80 py-0">customized</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-white/40">{selected.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-white/50">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => { setIsActive(e.target.checked); setDirty(true); }}
                    className="h-4 w-4 accent-indigo-500"
                  />
                  Active
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void resetTemplate()}
                  disabled={resetting}
                >
                  {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  Reset
                </Button>
                <Button size="sm" onClick={() => void save()} disabled={saving || !dirty}>
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : savedFlash ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {savedFlash ? "Saved" : dirty ? "Save changes" : "Saved"}
                </Button>
              </div>
            </div>

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

            {/* Variables */}
            {selected.variables.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Variables</span>
                {selected.variables.map((v) => (
                  <button
                    key={v.name}
                    type="button"
                    title={v.description}
                    onClick={() => insertVariable(v.name)}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-indigo-200/90 transition-colors hover:border-indigo-500/40 hover:bg-indigo-500/10"
                  >
                    {`{{${v.name}}}`}
                  </button>
                ))}
              </div>
            )}

            {/* Editor + preview */}
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="min-w-0 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-white/60">
                    <Code2 className="w-3.5 h-3.5" /> HTML body
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPreview((p) => !p)}
                    className="flex items-center gap-1 text-[11px] text-white/40 transition-colors hover:text-white/70 xl:hidden"
                  >
                    <Eye className="w-3.5 h-3.5" /> {showPreview ? "Hide preview" : "Show preview"}
                  </button>
                </div>
                <textarea
                  ref={textareaRef}
                  value={draftBody}
                  onChange={(e) => { setDraftBody(e.target.value); setDirty(true); }}
                  spellCheck={false}
                  rows={18}
                  className="w-full resize-y rounded-xl border border-white/10 bg-[#0c0c16] p-4 font-mono text-[12px] leading-relaxed text-white/85 focus:border-indigo-500/50 focus:outline-none"
                />
                <p className="text-[11px] text-white/30">
                  Full HTML document — everything the recipient sees is editable here.
                </p>
              </div>

              {showPreview && (
                <div className="min-w-0 space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-white/60">
                    <Eye className="w-3.5 h-3.5" /> Live preview
                    <span className="font-normal text-white/30">(sample data)</span>
                  </label>
                  <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
                    <div className="border-b border-white/[0.06] px-3 py-2 text-xs text-white/50">
                      <span className="text-white/30">Subject:</span>{" "}
                      {interpolate(draftSubject, SAMPLE)}
                    </div>
                    <iframe
                      title="Email preview"
                      srcDoc={previewHtml}
                      sandbox=""
                      className="h-[26rem] w-full bg-white"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Test send */}
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
              <p className="text-xs text-white/40">
                Send this template (with sample data) to a real inbox:
              </p>
              <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                <input
                  type="email"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="you@example.com"
                  className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-indigo-500/50 focus:outline-none"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void sendTest()}
                  disabled={testing || !testTo.trim()}
                  className="shrink-0"
                >
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send test
                </Button>
              </div>
              {testResult && (
                <p className={`mt-2.5 text-xs ${testResult.ok ? "text-emerald-400" : "text-red-400"}`}>
                  {testResult.ok
                    ? "Sent — check the inbox (and spam folder on first sends)."
                    : `Failed: ${testResult.error ?? "unknown error"}`}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center rounded-xl border border-white/[0.08] text-sm text-white/30">
            Select a template to edit.
          </div>
        )}
      </div>
    </div>
  );
}
