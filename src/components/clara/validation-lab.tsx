"use client";

import { useState } from "react";
import { api, useClara } from "@/lib/store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, PlayCircle, Infinity as InfinityIcon } from "lucide-react";

type CheckResult = {
  id: string;
  plan: string;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
};
type RunResult = {
  runId: string;
  durationMs: number;
  passed: number;
  failed: number;
  total: number;
  checks: CheckResult[];
  startedAt: string;
};

const TIER_META: Record<string, { title: string; limits: string; script: string }> = {
  free: {
    title: "Free / trial",
    limits: "50 req/day · 500/mo · 1 KB · 50 MB",
    script:
      "49/50 today + 1/1 KB + 80% storage → 2nd KB refused; request 50 admitted; 51+ refused 402; storage upload refused with remaining copy; premium model 403 via raw API; meter = event log",
  },
  starter: {
    title: "Starter",
    limits: "300 req/day · 5,000/mo · 5 KBs",
    script:
      "239/300 today → 80% warning fires exactly once at 240; monthly cap walk 5,000→5,001 refused with renewal copy; daily window resets at local midnight; 6th KB refused",
  },
  pro: {
    title: "Pro / Business",
    limits: "2,000 req/day · 50,000/mo · 20 KBs · Terra model",
    script:
      "1 credit remaining → 100 parallel requests: exactly 1 admitted, 99 refused 402; 10 concurrent KB creates at 20/20: none admitted; meters equal event-log counts to the row",
  },
  enterprise: {
    title: "Enterprise",
    limits: "Unlimited · SSO · custom LLM · widget",
    script:
      "25 × 1000-request burst, no artificial caps; all 5 feature gates pass; a FREE org is still refused SSO + premium model (gates are per-plan); every suite action audited; hash chain verifies",
  },
  all: {
    title: "Chain integrity",
    limits: "Hash chain",
    script:
      "Deliberate tamper test — one character flipped inside a row must break verification, and restoring it must bring the chain back to valid",
  },
};

export function ValidationLab({ userId }: { userId: string }) {
  const { showToast } = useClara();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await api("/api/validation/run", userId, { method: "POST" });
      const body = await res.json();
      if (res.ok) {
        setResult(body);
        showToast(
          body.failed === 0
            ? `Suite passed — ${body.passed}/${body.total} checks green`
            : `${body.failed} check(s) FAILED — see details`,
          body.failed === 0 ? "success" : "error"
        );
      } else {
        showToast(body?.error?.message ?? "Suite refused", "error");
      }
    } catch {
      showToast("Network error while running the suite", "error");
    } finally {
      setRunning(false);
    }
  };

  const grouped = (result?.checks ?? []).reduce<
    Record<string, CheckResult[]>
  >((acc, c) => {
    (acc[c.plan] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div className="space-y-6 overflow-y-auto p-4 pb-8 md:p-6">
      <header className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold">Quota Validation Lab</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            The permanent plan-by-plan suite (WS-1.3): every tier is seeded near
            its boundaries and every limit is walked to N, N+1 and beyond — via
            the real route handlers, not the UI — asserting refusals, message
            copy, meter accuracy and upgrade paths. Bypass attempts with a raw
            API client fail exactly like polite traffic does.
          </p>
        </div>
        <Button
          onClick={run}
          disabled={running}
          className="ml-auto gap-2"
          size="lg"
        >
          {running ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Running suite…
            </>
          ) : (
            <>
              <PlayCircle className="h-4 w-4" />
              Run full suite
            </>
          )}
        </Button>
      </header>

      {result && (
        <div
          className={`flex flex-wrap items-center gap-3 rounded-lg border p-4 ${
            result.failed === 0
              ? "border-emerald-300 bg-emerald-50"
              : "border-red-300 bg-red-50"
          }`}
          role="status"
        >
          <span className="text-2xl font-semibold tabular-nums">
            {result.passed}/{result.total}
          </span>
          <div className="text-sm">
            <p className="font-medium">
              {result.failed === 0
                ? "All checks passed — quotas cannot be bypassed"
                : `${result.failed} check(s) failed — enforcement gap detected`}
            </p>
            <p className="text-muted-foreground">
              Completed in {(result.durationMs / 1000).toFixed(1)}s ·{" "}
              {new Date(result.startedAt).toLocaleTimeString("en-IN")}
            </p>
          </div>
          <Badge
            variant={result.failed === 0 ? "secondary" : "destructive"}
            className="ml-auto"
          >
            {result.failed === 0 ? "GREEN — releasable" : "RED — CI blocks merge"}
          </Badge>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(TIER_META).map(([key, meta]) => {
          const checks = grouped[key] ?? [];
          const passed = checks.filter((c) => c.passed).length;
          return (
            <Card key={key}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{meta.title}</CardTitle>
                  {checks.length > 0 && (
                    <Badge
                      variant={passed === checks.length ? "secondary" : "destructive"}
                      className="h-5 px-1.5 text-[10px] tabular-nums"
                    >
                      {passed}/{checks.length}
                    </Badge>
                  )}
                </div>
                <CardDescription className="flex items-center gap-1">
                  {key === "enterprise" || key === "all" ? (
                    <>{meta.limits}</>
                  ) : (
                    <>
                      <InfinityIcon className="hidden" aria-hidden />
                      {meta.limits}
                    </>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
                  {meta.script}
                </p>
                {checks.map((c) => (
                  <div
                    key={c.id}
                    className={`rounded-lg border p-2.5 text-sm ${
                      c.passed ? "border-emerald-200" : "border-red-300 bg-red-50"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {c.passed ? (
                        <CheckCircle2
                          className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                          aria-label="passed"
                        />
                      ) : (
                        <XCircle
                          className="mt-0.5 h-4 w-4 shrink-0 text-red-600"
                          aria-label="failed"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium">{c.name}</p>
                        <p className="mt-0.5 break-words text-[11px] text-muted-foreground">
                          expected {c.expected} · actual {c.actual}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                {checks.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Run the suite to populate this tier&apos;s checks.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
