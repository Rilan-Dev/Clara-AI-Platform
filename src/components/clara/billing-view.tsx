"use client";

import { useCallback, useEffect, useState } from "react";
import { api, readError, useClara } from "@/lib/store";
import { UsageBar } from "@/components/clara/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Sparkles } from "lucide-react";

type PlansResponse = {
  plans: {
    id: string;
    name: string;
    priceInr: number;
    requestsDay: number;
    requestsMonth: number;
    kbs: number;
    storageMb: number;
    seats: number;
    features: string[];
    maxModelTier: number;
  }[];
  current: {
    planId: string;
    planName: string;
    requestsToday: number;
    requestsTodayLimit: number;
    requestsMonth: number;
    requestsMonthLimit: number;
    storageUsedBytes: number;
    storageLimitBytes: number;
    kbs: number;
    kbsLimit: number;
  };
  models: { id: string; displayName: string; tier: number }[];
};

const fmt = (n: number) => (n === -1 ? "Unlimited" : n.toLocaleString());

export function BillingView({ userId, orgId }: { userId: string; orgId: string }) {
  const { showToast } = useClara();
  const [data, setData] = useState<PlansResponse | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api(`/api/plans?orgId=${orgId}`, userId);
    if (res.ok) setData(await res.json());
  }, [orgId, userId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const upgrade = async (planId: string) => {
    setBusyPlan(planId);
    try {
      const res = await api("/api/billing/upgrade", userId, {
        method: "POST",
        body: JSON.stringify({ planId }),
      });
      if (res.ok) {
        const body = await res.json();
        showToast(`Plan changed to ${body.plan.name} — BILLING row written to the audit chain`, "success");
        await load();
      } else {
        const err = await readError(res);
        showToast(err.message ?? "Upgrade failed", "error");
      }
    } finally {
      setBusyPlan(null);
    }
  };

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading plans…
      </div>
    );
  }

  return (
    <div className="space-y-6 overflow-y-auto p-4 pb-8 md:p-6">
      <header>
        <h1 className="text-xl font-semibold">Billing & Plans</h1>
        <p className="text-sm text-muted-foreground">
          Current usage against the {data.current.planName} plan — limits shown
          here are exactly what the server enforces on every billable route.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Live usage — {data.current.planName}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <UsageBar
            used={data.current.requestsToday}
            limit={data.current.requestsTodayLimit}
            label="Requests today"
          />
          <UsageBar
            used={data.current.requestsMonth}
            limit={data.current.requestsMonthLimit}
            label="Requests this month"
          />
          <UsageBar
            used={Math.round(data.current.storageUsedBytes / 1048576)}
            limit={
              data.current.storageLimitBytes === -1
                ? -1
                : Math.round(data.current.storageLimitBytes / 1048576)
            }
            label="Storage (MB)"
          />
          <UsageBar
            used={data.current.kbs}
            limit={data.current.kbsLimit}
            label="Knowledge bases"
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.plans.map((p) => {
          const isCurrent = p.id === data.current.planId;
          const models = data.models.filter((m) => m.tier <= p.maxModelTier);
          return (
            <Card
              key={p.id}
              className={
                isCurrent ? "border-emerald-400 ring-1 ring-emerald-400/40" : ""
              }
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  {isCurrent && (
                    <Badge variant="secondary" className="gap-1">
                      <Check className="h-3 w-3" /> current
                    </Badge>
                  )}
                </div>
                <p className="text-2xl font-semibold">
                  ₹{p.priceInr.toLocaleString("en-IN")}
                  <span className="text-sm font-normal text-muted-foreground">
                    /month
                  </span>
                </p>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <ul className="space-y-1.5 text-muted-foreground">
                  <li className="flex justify-between">
                    <span>Requests / day</span>
                    <span className="font-medium text-foreground">
                      {fmt(p.requestsDay)}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span>Requests / month</span>
                    <span className="font-medium text-foreground">
                      {fmt(p.requestsMonth)}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span>Knowledge bases</span>
                    <span className="font-medium text-foreground">
                      {fmt(p.kbs)}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span>Storage</span>
                    <span className="font-medium text-foreground">
                      {p.storageMb >= 1024
                        ? `${(p.storageMb / 1024).toFixed(0)} GB`
                        : `${p.storageMb} MB`}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span>Seats</span>
                    <span className="font-medium text-foreground">{p.seats}</span>
                  </li>
                </ul>
                <div className="flex flex-wrap gap-1 pt-1">
                  {models.map((m) => (
                    <Badge key={m.id} variant="outline" className="text-[10px]">
                      {m.displayName}
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  {p.features.map((f) => (
                    <Badge key={f} variant="secondary" className="text-[10px]">
                      {f.replace(/_/g, " ")}
                    </Badge>
                  ))}
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full gap-1"
                  variant={isCurrent ? "outline" : "default"}
                  disabled={isCurrent || !!busyPlan}
                  onClick={() => upgrade(p.id)}
                >
                  {busyPlan === p.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {isCurrent ? "Current plan" : `Switch to ${p.name}`}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
