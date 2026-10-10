"use client";

import { useEffect, useState } from "react";
import { useClara } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, AlertTriangle, Sparkles, ArrowRight } from "lucide-react";

/** Dismissible 80% soft-warning banner driven by server events (WS-1.2). */
export function QuotaBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className="mb-2 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p className="flex-1">{message}</p>
      <button
        onClick={onDismiss}
        className="rounded px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
        aria-label="Dismiss quota warning"
      >
        Dismiss
      </button>
    </div>
  );
}

/** The upgrade sheet rendered from the 402/403 payload — never a client guess. */
export function UpgradeSheet() {
  const { upgradeSheet, closeUpgradeSheet, setView } = useClara();
  if (!upgradeSheet.open) return null;
  const is402 = upgradeSheet.code === "QUOTA_EXCEEDED";
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Upgrade required"
    >
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge variant={is402 ? "destructive" : "secondary"}>
              {upgradeSheet.code}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {is402 ? "HTTP 402" : "HTTP 403"}
            </span>
          </div>
          <CardTitle className="text-lg">
            {is402 ? "Limit reached" : "Not in your plan"}
          </CardTitle>
          <CardDescription>{upgradeSheet.message}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <p className="font-medium">
              Upgrade to {upgradeSheet.planName ?? "a higher plan"}
            </p>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Higher daily & monthly request caps
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                More knowledge bases & storage
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Premium models
                {upgradeSheet.reason?.startsWith("model:") ? " like this one" : ""}
              </li>
            </ul>
          </div>
        </CardContent>
        <CardFooter className="gap-2">
          <Button
            onClick={() => {
              closeUpgradeSheet();
              setView("billing");
            }}
            className="gap-1"
          >
            <Sparkles className="h-4 w-4" />
            Upgrade plan
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" onClick={closeUpgradeSheet}>
            Maybe later
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

/** Auto-dismiss toast. */
export function Toast() {
  const { toast, clearToast } = useClara();
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => clearToast(), 4200);
    return () => clearTimeout(t);
  }, [toast, clearToast]);
  if (!toast) return null;
  return (
    <div
      role="alert"
      className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 max-w-[92vw] truncate rounded-full px-4 py-2 text-sm shadow-lg ${
        toast.tone === "error"
          ? "bg-red-600 text-white"
          : toast.tone === "success"
            ? "bg-emerald-600 text-white"
            : "bg-slate-900 text-white"
      }`}
    >
      {toast.message}
    </div>
  );
}

/** Usage meter with limit + 80% warning colouring. */
export function UsageBar({
  used,
  limit,
  label,
  compact,
}: {
  used: number;
  limit: number;
  label: string;
  compact?: boolean;
}) {
  const unlimited = limit === -1;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const tone = unlimited
    ? "bg-emerald-500"
    : pct >= 100
      ? "bg-red-500"
      : pct >= 80
        ? "bg-amber-500"
        : "bg-emerald-500";
  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {used.toLocaleString()}
          {unlimited ? " / ∞" : ` / ${limit.toLocaleString()}`}
        </span>
      </div>
      {!unlimited && (
        <Progress value={pct} className="h-2" indicatorClassName={tone} />
      )}
    </div>
  );
}
