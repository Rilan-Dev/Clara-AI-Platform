"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, X, ArrowRight, AlertCircle } from "lucide-react";
import { toast } from "@/components/ui/sonner";

type Notice = {
  id: string;
  title: string;
  message: string;
  severity: "info" | "success" | "warning" | "critical";
  action_label?: string | null;
  action_href?: string | null;
  dismissible?: boolean;
};

type OrgStatus = {
  state: string;
  title?: string;
  message?: string;
  actionLabel?: string;
  actionHref?: string;
};

const DISMISSED_PREFIX = "clara:org-notification-dismissed:";

export function OrganizationNotificationCenter({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [announcementResponse, statusResponse] = await Promise.all([
          fetch("/api/platform/announcements", { cache: "no-store" }),
          fetch("/api/orgs/" + encodeURIComponent(orgId) + "/onboarding-status", { cache: "no-store" }),
        ]);
        const announcementData = announcementResponse.ok ? await announcementResponse.json() as { announcements?: Notice[] } : {};
        const status = statusResponse.ok ? await statusResponse.json() as OrgStatus : null;
        if (cancelled) return;
        const announcementNotices = (announcementData.announcements ?? []).map((item) => ({ ...item, id: "announcement:" + item.id }));
        const statusNotices: Notice[] = status && status.state !== "ready" ? [{
          id: "status:" + status.state,
          title: status.title ?? "Organisation action required",
          message: status.message ?? "Review your organisation status.",
          severity: ["payment_failed", "payment_cancelled", "subscription_required"].includes(status.state) ? "critical" : "warning",
          action_label: status.actionLabel ?? null,
          action_href: status.actionHref ?? null,
          dismissible: true,
        }] : [];
        const all = [...statusNotices, ...announcementNotices];
        setNotices(all);
        setDismissed(all.filter((item) => item.dismissible && window.localStorage.getItem(DISMISSED_PREFIX + orgId + ":" + item.id) === "1").map((item) => item.id));
        for (const item of all) {
          const key = "clara:org-notification-center-toast:" + orgId + ":" + item.id;
          if (window.sessionStorage.getItem(key) === "1") continue;
          window.sessionStorage.setItem(key, "1");
          const notify = item.severity === "critical" || item.severity === "warning" ? toast.warning : item.severity === "success" ? toast.success : toast.info;
          notify(item.title, { description: item.message, duration: item.severity === "critical" ? Infinity : 8000 });
        }
      } catch {
        // Notification UI must not disrupt the organization workspace.
      }
    };
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [orgId]);

  const visible = notices.filter((item) => !dismissed.includes(item.id));
  const dismiss = (item: Notice) => {
    if (!item.dismissible) return;
    window.localStorage.setItem(DISMISSED_PREFIX + orgId + ":" + item.id, "1");
    setDismissed((current) => current.includes(item.id) ? current : [...current, item.id]);
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-label="Organisation notifications" aria-expanded={open} className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        <Bell className="h-4 w-4" />
        {visible.length > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white">{visible.length > 9 ? "9+" : visible.length}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Organisation notifications" className="absolute right-0 top-11 z-[60] w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div><p className="text-sm font-semibold">Notifications</p><p className="text-xs text-muted-foreground">{visible.length} active</p></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close notifications" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
          <div className="max-h-[min(65vh,28rem)] overflow-y-auto">
            {visible.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">You're all caught up.</p> : visible.map((item) => (
              <div key={item.id} className="flex items-start gap-2.5 border-b border-border/70 px-4 py-3 last:border-b-0">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{item.message}</p>
                  {item.action_href && item.action_label && <Link href={item.action_href} onClick={() => setOpen(false)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">{item.action_label}<ArrowRight className="h-3 w-3" /></Link>}
                </div>
                {item.dismissible && <button type="button" onClick={() => dismiss(item)} aria-label={"Dismiss " + item.title} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
