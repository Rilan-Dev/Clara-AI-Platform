"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { confirmAction } from "@/components/ui/confirm-dialog";

type Announcement = {
  id: string;
  title: string;
  message: string;
  severity: string;
  action_label?: string | null;
  action_href?: string | null;
  audience: string;
  starts_at: string;
  ends_at?: string | null;
  dismissible: boolean;
  priority: number;
};

const empty = { title: "", message: "", severity: "info", actionLabel: "", actionHref: "", audience: "all", startsAt: "", endsAt: "", dismissible: true, priority: 0 };

export function AnnouncementManager() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const res = await fetch("/api/platform/announcements", { cache: "no-store" });
    if (res.ok) setItems(((await res.json()) as { announcements?: Announcement[] }).announcements ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/platform/announcements", { cache: "no-store" })
      .then(async (res) => res.ok ? (await res.json()) as { announcements?: Announcement[] } : null)
      .then((data) => {
        if (!cancelled) setItems(data?.announcements ?? []);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setMessage("");
    try {
      const res = await fetch("/api/platform/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Unable to create announcement");
      setForm(empty);
      setMessage("Announcement published.");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to create announcement");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!(await confirmAction({ title: "Delete this announcement?", destructive: true }))) return;
    const res = await fetch(`/api/platform/announcements/${id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Announcements</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Publish offers, product news, maintenance notices and important messages across organisation workspaces.
        </p>
      </div>

      <form onSubmit={submit} className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm">Title<input required value={form.title} onChange={e => setForm({...form,title:e.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
          <label className="text-sm">Severity<select value={form.severity} onChange={e => setForm({...form,severity:e.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"><option value="info">Info</option><option value="success">Success</option><option value="warning">Warning</option><option value="critical">Critical</option></select></label>
        </div>
        <label className="block text-sm">Message<textarea required value={form.message} onChange={e => setForm({...form,message:e.target.value})} rows={3} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm">Audience<select value={form.audience} onChange={e => setForm({...form,audience:e.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"><option value="all">All organisations</option><option value="paid">Paid organisations</option><option value="trialing">Trial organisations</option></select></label>
          <label className="text-sm">CTA label<input value={form.actionLabel} onChange={e => setForm({...form,actionLabel:e.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
          <label className="text-sm">CTA URL<input value={form.actionHref} onChange={e => setForm({...form,actionHref:e.target.value})} placeholder="/subscriptions" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm">Starts at<input type="datetime-local" value={form.startsAt} onChange={e => setForm({...form,startsAt:e.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
          <label className="text-sm">Ends at<input type="datetime-local" value={form.endsAt} onChange={e => setForm({...form,endsAt:e.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
          <label className="text-sm">Priority<input type="number" value={form.priority} onChange={e => setForm({...form,priority:Number(e.target.value)})} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.dismissible} onChange={e => setForm({...form,dismissible:e.target.checked})} /> Dismissible</label>
        <div className="flex items-center gap-3"><button disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? "Publishing…" : "Publish announcement"}</button>{message && <span className="text-sm text-muted-foreground">{message}</span>}</div>
      </form>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Published announcements</h2>
        {items.length === 0 ? <p className="text-sm text-muted-foreground">No announcements yet.</p> : items.map(item => (
          <div key={item.id} className="flex items-start gap-4 rounded-xl border border-border bg-card p-4">
            <div className="min-w-0 flex-1"><p className="font-medium">{item.title}</p><p className="mt-1 text-sm text-muted-foreground">{item.message}</p><p className="mt-2 text-xs text-muted-foreground">{item.audience} · {item.severity}</p></div>
            <button onClick={() => remove(item.id)} className="text-xs text-destructive hover:underline">Delete</button>
          </div>
        ))}
      </section>
    </div>
  );
}
