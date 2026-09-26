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

function announcementTone(severity: Announcement["severity"]) {
  if (severity === "critical") return "border-destructive/25 bg-destructive/5";
  if (severity === "warning") return "border-amber-300/60 bg-amber-50/70 dark:border-amber-400/20 dark:bg-amber-950/20";
  if (severity === "success") return "border-emerald-300/50 bg-emerald-50/70 dark:border-emerald-400/20 dark:bg-emerald-950/20";
  return "border-primary/10 bg-primary/5";
}

function Icon({ state }: { state: BannerState }) {
  if (state === "email_verification_required") return <MailCheck className="h-4 w-4" />;
  if (state === "payment_pending" || state === "payment_review") return <Clock3 className="h-4 w-4" />;
  if (state === "ready") return <CheckCircle2 className="h-4 w-4" />;
  return <AlertCircle className="h-4 w-4" />;
}

function mobileMessage(status: StatusResponse) {
  switch (status.state) {
    case "payment_required":
      return status.planName ? `Finish payment to activate your ${status.planName} plan.` : "Finish payment to activate Clara AI.";
    case "payment_pending":
      return "Payment is being confirmed. No action needed yet.";
    case "payment_failed":
      return "Payment failed. Retry to activate Clara AI.";
    case "payment_cancelled":
      return "Payment was cancelled. Continue payment to activate Clara AI.";
    case "payment_review":
      return "Payment is under review. Please don't pay again.";
    case "email_verification_required":
      return "Verify your email to continue.";
    case "subscription_required":
      return "Choose a plan to activate Clara AI.";
    default:
      return status.message ?? "";
  }
}

export function OrganizationStatusBanner({ orgId }: { orgId: string | null }) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [statusDismissed, setStatusDismissed] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    fetch("/api/platform/announcements", { cache: "no-store" })
      .then(async (res) => res.ok ? (await res.json()) as { announcements?: Announcement[] } : null)
      .then((data) => {
        if (!cancelled) setAnnouncements(data?.announcements ?? []);
      })
      .catch(() => undefined);

    fetch(`/api/orgs/${encodeURIComponent(orgId)}/onboarding-status`, { cache: "no-store" })
      .then(async (res) => res.ok ? (await res.json()) as StatusResponse : null)
      .then((data) => {
        if (cancelled || !data || data.state === "ready") return;
        setStatus(data);
        const key = DISMISS_KEY_PREFIX + orgId + ":" + data.state;
        setStatusDismissed(window.sessionStorage.getItem(key) === "1");
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (!orgId || ((!status || statusDismissed) && announcements.length === 0)) return null;

  const dismiss = () => {
    if (!status) return;
    const key = DISMISS_KEY_PREFIX + orgId + ":" + status.state;
    window.sessionStorage.setItem(key, "1");
    setStatusDismissed(true);
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
      setResendMessage(res.ok ? "Verification email sent. Check your inbox." : data.error ?? "Unable to resend the verification email.");
    } catch {
      setResendMessage("Unable to resend the verification email.");
    } finally {
      setResending(false);
    }
  }

  const visibleAnnouncements = status ? announcements : announcements.slice(0, 3);

  return (
    <>
      {status && !statusDismissed && (
        <div className={`border-b px-3 py-2.5 sm:px-4 ${tone(status.state)}`} role="status">
          <div className="mx-auto flex max-w-[1600px] items-start gap-2.5 sm:gap-3">
            <span className="mt-0.5 shrink-0"><Icon state={status.state} /></span>

            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-semibold">{status.title}</p>
                {status.planName && (
                  <span className="hidden shrink-0 rounded-full border border-current/15 px-2 py-0.5 text-[11px] font-medium opacity-70 sm:inline-flex">
                    {status.planName}
                  </span>
                )}
              </div>

              <p className="mt-0.5 text-xs leading-5 opacity-80">
                <span className="sm:hidden">{mobileMessage(status)}</span>
                <span className="hidden sm:inline">{status.message}</span>
              </p>

              {resendMessage && <p className="mt-1 text-xs font-medium">{resendMessage}</p>}
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              {status.secondaryAction === "RESEND_VERIFICATION" && (
                <button
                  type="button"
                  onClick={resendVerification}
                  disabled={resending}
                  className="hidden rounded-lg border border-current/15 px-2.5 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/5 sm:inline-flex"
                >
                  {resending ? "Sending…" : status.secondaryActionLabel ?? "Resend verification"}
                </button>
              )}

              {status.actionHref && status.actionLabel && (
                <Link
                  href={status.actionHref}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 sm:px-3"
                >
                  <span className="sm:hidden">Continue</span>
                  <span className="hidden sm:inline">{status.actionLabel}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}

              <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss notification"
                className="rounded-md p-1.5 opacity-60 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {visibleAnnouncements.map((item) => (
        <div key={item.id} className={`border-b px-3 py-2.5 sm:px-4 ${announcementTone(item.severity)}`} role="status">
          <div className="mx-auto flex max-w-[1600px] items-start gap-2.5 sm:items-center sm:gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{item.title}</p>
              <p className="mt-0.5 text-xs leading-5 opacity-80">
                <span className="sm:hidden">{item.message.length > 96 ? item.message.slice(0, 93).trimEnd() + "…" : item.message}</span>
                <span className="hidden sm:inline">{item.message}</span>
              </p>
            </div>

            {item.action_href && item.action_label && (
              <Link
                href={item.action_href}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground sm:px-3"
              >
                <span className="sm:hidden">Open</span>
                <span className="hidden sm:inline">{item.action_label}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
