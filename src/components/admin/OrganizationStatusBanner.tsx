"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, MailCheck, X } from "lucide-react";

type BannerState =
  | "ready"
  | "email_verification_required"
  | "payment_required"
  | "payment_pending"
  | "payment_failed"
  | "payment_cancelled"
  | "payment_review"
  | "subscription_required";

type Announcement = {
  id: string;
  title: string;
  message: string;
  severity: "info" | "success" | "warning" | "critical";
  action_label?: string | null;
  action_href?: string | null;
  dismissible: boolean;
};

type StatusResponse = {
  state: BannerState;
  title?: string;
  message?: string;
  actionLabel?: string;
  actionHref?: string;
  secondaryActionLabel?: string;
  secondaryAction?: "RESEND_VERIFICATION";
  planName?: string | null;
};

const DISMISS_KEY_PREFIX = "clara:org-status-banner:";

function tone(state: BannerState) {
  if (state === "payment_pending" || state === "payment_review") {
    return "border-amber-300/60 bg-amber-50/90 text-amber-950 dark:border-amber-400/20 dark:bg-amber-950/30 dark:text-amber-100";
  }
  if (state === "payment_failed" || state === "payment_cancelled" || state === "subscription_required") {
    return "border-destructive/25 bg-destructive/5 text-foreground";
  }
  return "border-primary/20 bg-primary/5 text-foreground";
}

function Icon({ state }: { state: BannerState }) {
  if (state === "email_verification_required") return <MailCheck className="h-4 w-4" />;
  if (state === "payment_pending" || state === "payment_review") return <Clock3 className="h-4 w-4" />;
  if (state === "ready") return <CheckCircle2 className="h-4 w-4" />;
  return <AlertCircle className="h-4 w-4" />;
}

export function OrganizationStatusBanner({ orgId }: { orgId: string | null }) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    fetch(`/api/platform/announcements`, { cache: "no-store" })
      .then(async (res) => res.ok ? (await res.json()) as { announcements?: Announcement[] } : null)
      .then((data) => {
        if (!cancelled) setAnnouncements(data?.announcements ?? []);
      })
      .catch(() => undefined);

    fetch(`/api/orgs/${encodeURIComponent(orgId)}/onboarding-status`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as StatusResponse;
      })
      .then((data) => {
        if (cancelled || !data || data.state === "ready") return;
        setStatus(data);
        const key = DISMISS_KEY_PREFIX + orgId + ":" + data.state;
        setDismissed(window.sessionStorage.getItem(key) === "1");
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (!orgId || (!status && announcements.length === 0) || dismissed) return null;

  const dismiss = () => {
    const key = DISMISS_KEY_PREFIX + orgId + ":" + status.state;
    window.sessionStorage.setItem(key, "1");
    setDismissed(true);
  };

  async function resendVerification() {
    setResending(true);
    setResendMessage(null);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      setResendMessage(
        res.ok
          ? "Verification email sent. Check your inbox."
          : data.error ?? "Unable to resend the verification email.",
      );
    } catch {
      setResendMessage("Unable to resend the verification email.");
    } finally {
      setResending(false);
    }
  }

  const extraAnnouncements = status ? announcements : announcements.slice(0, 3);

  return (
    <>
      {status && (
        <div className={`border-b px-4 py-2.5 ${tone(status.state)}`} role="status">
          <div className="mx-auto flex max-w-[1600px] items-start gap-3">
            <span className="mt-0.5 shrink-0"><Icon state={status.state} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <p className="text-sm font-semibold">{status.title}</p>
                {status.planName && <span className="rounded-full border border-current/15 px-2 py-0.5 text-[10px] font-medium opacity-70">{status.planName}</span>}
              </div>
              <p className="mt-0.5 text-xs leading-5 opacity-80">{status.message}</p>
              {resendMessage && <p className="mt-1 text-xs font-medium">{resendMessage}</p>}
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {status.secondaryAction === "RESEND_VERIFICATION" && (
                <button type="button" onClick={resendVerification} disabled={resending} className="rounded-lg border border-current/15 px-2.5 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/5">
                  {resending ? "Sending…" : status.secondaryActionLabel ?? "Resend verification"}
                </button>
              )}
              {status.actionHref && status.actionLabel && (
                <Link href={status.actionHref} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90">
                  {status.actionLabel}<ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
              <button type="button" onClick={dismiss} aria-label="Dismiss notification" className="rounded-md p-1 opacity-60 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/5">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {extraAnnouncements.map((item) => (
        <div key={item.id} className="border-b border-primary/10 bg-primary/5 px-4 py-2.5" role="status">
          <div className="mx-auto flex max-w-[1600px] items-center gap-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{item.title}</p>
              <p className="text-xs leading-5 opacity-80">{item.message}</p>
            </div>
            {item.action_href && item.action_label && (
              <Link href={item.action_href} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                {item.action_label}<ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
