"use client";

import { useCallback, useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  ShieldCheck,
  ShieldAlert,
  Download,
  Eye,
  Loader2,
  Building2,
  Activity,
  FileClock,
} from "lucide-react";

type AuditRow = {
  id: string;
  seq: number;
  orgName: string;
  actorName: string;
  actorRole: string;
  action: string;
  agentName: string | null;
  model: string | null;
  promptText: string | null;
  answerText: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  redactions: string;
  revealOfId: string | null;
  justification: string | null;
  createdAt: string;
};
type AdminAnalytics = {
  orgs: { orgId: string; orgName: string; plan: string; requests30d: number; costUsd30d: number }[];
  modelLatency: { model: string; requests: number; p50: number; p95: number }[];
  totalRequests30d: number;
  totalCostUsd30d: string;
  planPressure: { plan: string; orgs: number; atLimit: number }[];
  auditRows: number;
  usageEvents: number;
};
type Filters = {
  orgs: { id: string; name: string }[];
  users: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  actions: string[];
};

const ACTION_TONE: Record<string, string> = {
  PROMPT: "bg-emerald-100 text-emerald-800",
  ANSWER: "bg-teal-100 text-teal-800",
  CONFIG: "bg-slate-100 text-slate-700",
  BILLING: "bg-amber-100 text-amber-800",
  REVEAL: "bg-red-100 text-red-800",
};

export function AdminConsole({ userId }: { userId: string }) {
  const { showToast } = useClara();
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [chain, setChain] = useState<{
    ok: boolean;
    checked: number;
    total: number;
    firstBreak?: { reason: string } | null;
    tamper?: boolean;
  } | null>(null);
  const [chainBusy, setChainBusy] = useState(false);
  const [revealRow, setRevealRow] = useState<AuditRow | null>(null);
  const [justification, setJustification] = useState("");
  const [revealBusy, setRevealBusy] = useState(false);

  const loadAnalytics = useCallback(async () => {
    try {
      const res = await api("/api/analytics/admin", userId);
      if (res.ok) setAnalytics(await res.json());
    } catch {
      /* transient */
    }
  }, [userId]);

  const loadAudit = useCallback(
    async (cursor?: string | null, append = false) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ take: "25" });
        if (orgFilter !== "all") params.set("orgId", orgFilter);
        if (actionFilter !== "all") params.set("action", actionFilter);
        if (q.trim()) params.set("q", q.trim());
        if (cursor) params.set("cursor", cursor);
        const res = await api(`/api/audit?${params}`, userId);
        if (res.ok) {
          const body = await res.json();
          setRows((prev) => (append ? [...prev, ...body.rows] : body.rows));
          setNextCursor(body.nextCursor);
          setFilters(body.filters);
        }
      } finally {
        setLoading(false);
      }
    },
    [userId, orgFilter, actionFilter, q]
  );

  useEffect(() => {
    loadAnalytics();
    const t = setInterval(loadAnalytics, 15000);
    return () => clearInterval(t);
  }, [loadAnalytics]);

  useEffect(() => {
    const t = setTimeout(() => loadAudit(null, false), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [loadAudit, q]);

  const verifyChain = async (tamper: boolean) => {
    setChainBusy(true);
    try {
      const res = tamper
        ? await api("/api/audit/verify", userId, { method: "POST" })
        : await api("/api/audit/verify", userId);
      if (res.ok) {
        const body = await res.json();
        setChain(body);
        if (tamper) {
          showToast(
            `Tamper test: chain ${body.chainBrokeAfterTamper ? "broke as expected" : "FAILED to break"} → restored ${body.chainOkAfterRestore ? "OK" : "FAILED"}`,
            body.chainBrokeAfterTamper && body.chainOkAfterRestore ? "success" : "error"
          );
        } else {
          showToast(
            body.ok
              ? `Hash chain verified — ${body.checked} rows intact`
              : `CHAIN BROKEN at seq ${body.firstBreak?.seq}`,
            body.ok ? "success" : "error"
          );
        }
      }
    } finally {
      setChainBusy(false);
    }
  };

  const doReveal = async () => {
    if (!revealRow) return;
    setRevealBusy(true);
    try {
      const res = await api("/api/audit/reveal", userId, {
        method: "POST",
        body: JSON.stringify({ id: revealRow.id, justification }),
      });
      const body = await res.json();
      if (res.ok) {
        showToast(
          `Revealed ${body.originals?.length ?? 0} redaction(s) — REVEAL row written to the chain`,
          "success"
        );
        setRevealRow(null);
        setJustification("");
        loadAudit(null, false);
      } else {
        showToast(body?.error?.message ?? "Reveal refused", "error");
      }
    } finally {
      setRevealBusy(false);
    }
  };

  return (
    <div className="space-y-6 overflow-y-auto p-4 pb-8 md:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold">Platform Admin Console</h1>
          <p className="text-sm text-muted-foreground">
            Cross-organisation monitoring, the tamper-evident audit chain, and
            quota enforcement telemetry.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => verifyChain(false)}
            disabled={chainBusy}
          >
            {chainBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            )}
            Verify hash chain
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => verifyChain(true)}
            disabled={chainBusy}
          >
            <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
            Tamper test
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => {
              const params = new URLSearchParams({ format: "csv" });
              if (orgFilter !== "all") params.set("orgId", orgFilter);
              if (actionFilter !== "all") params.set("action", actionFilter);
              if (q.trim()) params.set("q", q.trim());
              window.open(`/api/audit?${params}`, "_blank");
            }}
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </header>

      {chain && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            chain.ok || chain.chainBrokeAfterTamper
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-300 bg-red-50 text-red-800"
          }`}
          role="status"
        >
          {chain.tamper ? (
            <p>
              <b>Tamper test complete:</b> flipping one character inside a row{" "}
              {chain.chainBrokeAfterTamper
                ? "broke the chain immediately"
                : "did NOT break the chain (unexpected)"}{" "}
              and restoring it brought the chain back to{" "}
              {chain.chainOkAfterRestore ? "valid" : "invalid"}.
            </p>
          ) : (
            <p>
              <b>Chain integrity:</b>{" "}
              {chain.ok
                ? `verified — ${chain.checked} of ${chain.total} rows recomputed intact.`
                : `BROKEN — ${chain.firstBreak?.reason}`}
            </p>
          )}
        </div>
      )}

      {analytics && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              {
                label: "Requests (30d)",
                value: analytics.totalRequests30d.toLocaleString(),
                icon: Activity,
              },
              {
                label: "Est. spend (30d)",
                value: `$${analytics.totalCostUsd30d}`,
                icon: Building2,
              },
              {
                label: "Usage events",
                value: analytics.usageEvents.toLocaleString(),
                icon: FileClock,
              },
              {
                label: "Audit rows",
                value: analytics.auditRows.toLocaleString(),
                icon: ShieldCheck,
              },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <s.icon className="h-4 w-4 text-emerald-600" aria-hidden />
                  </div>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {s.value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Model latency (30d)</CardTitle>
                <CardDescription>
                  p50 / p95 milliseconds per model — spikes surface within one
                  polling cycle
                </CardDescription>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">Model</th>
                      <th className="pb-2 font-medium">Requests</th>
                      <th className="pb-2 font-medium">p50</th>
                      <th className="pb-2 font-medium">p95</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.modelLatency.map((m) => (
                      <tr key={m.model} className="border-b last:border-0">
                        <td className="py-2 font-medium">{m.model}</td>
                        <td className="py-2 tabular-nums">{m.requests}</td>
                        <td className="py-2 tabular-nums">{m.p50} ms</td>
                        <td
                          className={`py-2 tabular-nums ${m.p95 > 4000 ? "font-semibold text-red-600" : ""}`}
                        >
                          {m.p95} ms
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Organisations</CardTitle>
                <CardDescription>
                  Requests and spend per tenant, last 30 days
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {analytics.orgs.map((o) => (
                    <div
                      key={o.orgId}
                      className="flex items-center gap-3 rounded-lg border p-2.5 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{o.orgName}</p>
                        <p className="text-xs text-muted-foreground">
                          {o.plan} plan
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="tabular-nums font-medium">
                          {o.requests30d.toLocaleString()}
                        </p>
                        <p className="text-xs tabular-nums text-muted-foreground">
                          ${o.costUsd30d}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Audit viewer */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Audit log — prompts & answers</CardTitle>
          <CardDescription>
            Immutable, hash-chained records of every user prompt and AI answer
            across all organisations. Redacted content requires a recorded
            justification to reveal; the reveal itself is audited.
          </CardDescription>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Select value={orgFilter} onValueChange={setOrgFilter}>
              <SelectTrigger className="h-9 w-[190px]" aria-label="Filter by organisation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All organisations</SelectItem>
                {filters?.orgs.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="h-9 w-[150px]" aria-label="Filter by action">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {filters?.actions.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search prompt / answer text…"
              className="h-9 w-full sm:w-64"
              aria-label="Search audit text"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
            {loading && rows.length === 0 && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && rows.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No audit rows match these filters.
              </p>
            )}
            {rows.map((r) => {
              const redactions = JSON.parse(r.redactions || "[]") as unknown[];
              return (
                <div key={r.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular-nums text-xs text-muted-foreground">
                      #{r.seq}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${ACTION_TONE[r.action] ?? "bg-muted"}`}
                    >
                      {r.action}
                    </span>
                    <span className="text-xs font-medium">{r.orgName}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.actorName} ({r.actorRole.replace("_", " ")})
                    </span>
                    {r.model && (
                      <Badge variant="outline" className="h-4 px-1 text-[10px]">
                        {r.model}
                      </Badge>
                    )}
                    <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                      {new Date(r.createdAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {(r.promptText || r.answerText) && (
                    <div className="mt-2 space-y-1">
                      {r.promptText && (
                        <p className="line-clamp-2 text-muted-foreground">
                          <span className="font-semibold text-foreground">PROMPT:</span>{" "}
                          {r.promptText}
                        </p>
                      )}
                      {r.answerText && (
                        <p className="line-clamp-2 text-muted-foreground">
                          <span className="font-semibold text-foreground">ANSWER:</span>{" "}
                          {r.answerText}
                        </p>
                      )}
                    </div>
                  )}
                  {r.justification && (
                    <p className="mt-1 rounded bg-red-50 px-2 py-1 text-[11px] text-red-800">
                      Reveal justification: {r.justification}
                    </p>
                  )}
                  {redactions.length > 0 && (
                    <button
                      onClick={() => {
                        setRevealRow(r);
                        setJustification("");
                      }}
                      className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-100"
                    >
                      <Eye className="h-3 w-3" />
                      {redactions.length} redaction(s) — reveal with justification
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {nextCursor && (
            <div className="mt-3 flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => loadAudit(nextCursor, true)}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Load more
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reveal dialog */}
      <Dialog
        open={!!revealRow}
        onOpenChange={(open) => !open && setRevealRow(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reveal redacted content</DialogTitle>
            <DialogDescription>
              Audit row #{revealRow?.seq} · the justification is recorded
              permanently in the hash chain as a REVEAL action.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="Reason for this reveal (ticket ID, compliance case…) — minimum 10 characters"
            rows={3}
            aria-label="Justification"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevealRow(null)}>
              Cancel
            </Button>
            <Button onClick={doReveal} disabled={revealBusy || justification.trim().length < 10}>
              {revealBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              Reveal & record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
