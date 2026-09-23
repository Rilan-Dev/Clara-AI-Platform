"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/modules/admin-ui/hooks";
import { AlertTriangle, ArrowRight, Clock3, X } from "lucide-react";

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

const STORAGE_PREFIX = "clara:platform-health-banner:";
const TOMORROW_HOURS = 24;

function storageKey(kind: "tomorrow" | "never", id: string) {
  return `${STORAGE_PREFIX}${kind}:${id}`;
}

function isSuppressed(alert: HealthAlert) {
  try {
    if (localStorage.getItem(storageKey("never", alert.id)) === "1") return true;
    const until = Number(localStorage.getItem(storageKey("tomorrow", alert.id)) ?? "0");
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

export function PlatformHealthAlertBanner() {
  const { user, loading } = useAuth();
  const [alerts, setAlerts] = useState<HealthAlert[]>([]);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (loading || !user?.isSuperAdmin) {
      setAlerts([]);
      return;
    }

    let cancelled = false;
    fetch("/api/platform/health-alerts", { cache: "no-store" })
      .then(async (res) => res.ok ? (await res.json()) as { alerts?: HealthAlert[] } : null)
      .then((data) => {
        if (!cancelled) setAlerts((data?.alerts ?? []).filter((alert) => !isSuppressed(alert)));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [loading, user?.isSuperAdmin]);

  const countLabel = useMemo(
    () => `${alerts.length} platform ${alerts.length === 1 ? "issue" : "issues"} need attention`,
    [alerts.length],
  );

  if (loading || !user?.isSuperAdmin || hidden || alerts.length === 0) return null;

  const remindTomorrow = () => {
    const until = Date.now() + TOMORROW_HOURS * 60 * 60 * 1000;
    alerts.forEach((alert) => localStorage.setItem(storageKey("tomorrow", alert.id), String(until)));
    setHidden(true);
  };

  const neverShowAgain = () => {
    alerts.forEach((alert) => localStorage.setItem(storageKey("never", alert.id), "1"));
    setHidden(true);
  };

  return (
    <section
      aria-label="Platform health alerts"
      className="border-b border-amber-300/50 bg-amber-50/90 text-amber-950 dark:border-amber-400/20 dark:bg-amber-950/25 dark:text-amber-100"
    >
      <div className="mx-auto max-w-[1600px] px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex items-start gap-2.5 sm:gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
            <AlertTriangle className="h-4 w-4" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-sm font-semibold">{countLabel}</p>
              <span className="hidden rounded-full border border-current/15 px-2 py-0.5 text-[10px] font-medium opacity-70 sm:inline-flex">
                Platform admin
              </span>
            </div>

            <div className="mt-1.5 space-y-1">
              {alerts.slice(0, 3).map((alert) => (
                <div key={alert.id} className="flex min-w-0 items-center gap-2 text-xs">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current/60" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium">{alert.serviceName}</span>
                  <Link
                    href={alert.actionHref}
                    className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold underline underline-offset-2 hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <span className="hidden sm:inline">{alert.actionLabel}</span>
                    <span className="sm:hidden">Review</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              ))}
              {alerts.length > 3 && (
                <p className="text-[11px] opacity-70">+{alerts.length - 3} more in System Status</p>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={remindTomorrow}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-current/15 px-2.5 text-[11px] font-medium hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Clock3 className="h-3.5 w-3.5" />
                Remind tomorrow
              </button>
              <button
                type="button"
                onClick={neverShowAgain}
                className="inline-flex min-h-9 items-center rounded-lg px-2.5 text-[11px] font-medium opacity-75 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/5"
              >
                Don’t show again
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setHidden(true)}
            aria-label="Close platform health alerts"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg opacity-60 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
