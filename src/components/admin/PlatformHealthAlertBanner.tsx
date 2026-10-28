"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/modules/admin-ui/hooks";
import { toast } from "@/components/ui/sonner";
import { Activity, AlertTriangle, ArrowRight, Bell, CheckCircle2, Info, ShieldAlert, X } from "lucide-react";

type HealthAlert = {
  id: string;
  incidentKey: string;
  serviceName: string;
  severity: "warning" | "critical";
  title: string;
  message: string;
  actionLabel: string;
  actionHref: string;
  lastSeenAt: string;
};

const POLL_INTERVAL_MS = 30_000;
const DISMISSED_ALERTS_KEY = "clara:platform-health-alerts:dismissed:v1";

function dismissedAlertIds(): Set<string> {
  try {
    const value = window.localStorage.getItem(DISMISSED_ALERTS_KEY);
    const parsed: unknown = value ? JSON.parse(value) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function markAlertDismissed(id: string) {
  try {
    const dismissed = dismissedAlertIds();
    dismissed.add(id);
    window.localStorage.setItem(DISMISSED_ALERTS_KEY, JSON.stringify([...dismissed]));
  } catch {
    // Storage may be unavailable; session-level toast de-duplication still applies.
  }
}

function clearAlertDismissal(id: string) {
  try {
    const dismissed = dismissedAlertIds();
    dismissed.delete(id);
    window.localStorage.setItem(DISMISSED_ALERTS_KEY, JSON.stringify([...dismissed]));
  } catch {
    // Non-fatal: the incident remains reviewable from the notification bell.
  }
}

function announceAlert(alert: HealthAlert) {
  const description = `${alert.message} · ${alert.actionLabel}`;
  const action = {
    label: "Review",
    onClick: () => { window.location.href = alert.actionHref; },
  };
  if (alert.severity === "critical") {
    // Risks are deliberately sticky: only the user can close this toast.
    toast.error(alert.title, {
      id: `platform-risk:${alert.id}`,
      description,
      duration: Infinity,
      closeButton: true,
      onDismiss: () => markAlertDismissed(alert.id),
      action,
    });
  } else {
    toast.warning(alert.title, {
      id: `platform-warning:${alert.id}`,
      description,
      duration: 8_000,
      closeButton: true,
      onDismiss: () => markAlertDismissed(alert.id),
      action,
    });
  }
}

export function PlatformHealthAlertBanner() {
  const { user, loading } = useAuth();
  const [alerts, setAlerts] = useState<HealthAlert[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const previousRef = useRef<Map<string, HealthAlert>>(new Map());

  const refresh = useCallback(async (notify: boolean) => {
    try {
      const response = await fetch("/api/platform/health-alerts", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!response.ok) return;
      const data = await response.json() as { alerts?: HealthAlert[] };
      const next = Array.isArray(data.alerts) ? data.alerts : [];
      const nextById = new Map(next.map((alert) => [alert.id, alert]));
      const previous = previousRef.current;

      if (notify) {
        for (const alert of next) {
          const old = previous.get(alert.id);
          const isNewOrEscalated = !old || (old.severity !== "critical" && alert.severity === "critical");
          if (isNewOrEscalated && !dismissedAlertIds().has(alert.id)) {
            announceAlert(alert);
          }
        }
        for (const old of previous.values()) {
          if (!nextById.has(old.id)) {
            toast.info(`${old.serviceName} recovered`, {
              id: `platform-recovered:${old.id}`,
              description: "The platform health check is no longer reporting this issue.",
              duration: 6_000,
              closeButton: true,
            });
            toast.dismiss(`platform-risk:${old.id}`);
            toast.dismiss(`platform-warning:${old.id}`);
            clearAlertDismissal(old.id);
          }
        }
      }

      previousRef.current = nextById;
      setAlerts(next);
      setLoaded(true);
    } catch {
      // Keep the last known alerts visible during transient polling failures.
    }
  }, []);

  useEffect(() => {
    if (loading || !user?.isSuperAdmin) {
      setAlerts([]);
      previousRef.current = new Map();
      setLoaded(false);
      return;
    }

    let cancelled = false;
    const initial = async () => {
      await refresh(true);
    };
    void initial();
    const timer = window.setInterval(() => {
      if (!cancelled) void refresh(true);
    }, POLL_INTERVAL_MS);

    const onFocus = () => { if (!cancelled) void refresh(true); };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [loading, user?.isSuperAdmin, refresh]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (loading || !user?.isSuperAdmin) return null;

  const criticalCount = alerts.filter((alert) => alert.severity === "critical").length;
  const warningCount = alerts.filter((alert) => alert.severity === "warning").length;
  const count = alerts.length;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={count ? `Notifications, ${count} active platform issues` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Platform notifications"
        className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="h-[18px] w-[18px]" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-background bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
        <span className="sr-only">{criticalCount} risks, {warningCount} warnings</span>
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="Platform notifications"
          className="absolute right-0 top-full z-[70] mt-2 w-[min(92vw,390px)] overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <div className="flex items-start gap-3 border-b border-border px-4 py-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Activity className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">Notifications</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {count ? `${count} active issue${count === 1 ? "" : "s"} · updates automatically` : "Live platform health updates"}
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close notifications" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[min(65vh,480px)] overflow-y-auto p-2">
            {!loaded ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">Loading platform notifications…</div>
            ) : count === 0 ? (
              <div className="flex flex-col items-center px-4 py-9 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <p className="mt-2 text-sm font-medium">You’re all caught up</p>
                <p className="mt-1 text-xs text-muted-foreground">New platform issues will appear here automatically.</p>
              </div>
            ) : alerts.map((alert) => {
              const risk = alert.severity === "critical";
              return (
                <div key={alert.id} className="flex gap-3 rounded-xl p-3 transition-colors hover:bg-muted/60">
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${risk ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-600"}`}>
                    {risk ? <ShieldAlert className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-semibold leading-5">{alert.title}</p>
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${risk ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}>
                        {risk ? "Risk" : "Warning"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{alert.message}</p>
                    <Link
                      href={alert.actionHref}
                      onClick={() => setOpen(false)}
                      className="mt-2 inline-flex min-h-8 items-center gap-1 rounded-lg text-xs font-semibold text-primary hover:underline"
                    >
                      {alert.actionLabel}<ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-4 py-3">
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              Refreshes every 30 seconds
            </span>
            <Link href="/system-status" onClick={() => setOpen(false)} className="text-xs font-semibold text-primary hover:underline">
              System status
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
