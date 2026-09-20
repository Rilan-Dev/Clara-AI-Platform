"use client";
/**
 * /admin/kbs/[kbId] — KB dashboard
 * Tabs: Documents | Scrape | Analytics | Deploy
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, useCallback } from "react";
import { useKb, useDocuments, useAnalytics, useAgent } from "@/modules/admin-ui/hooks";
import { updateKb } from "@/modules/admin-ui/api";
import { UploadZone } from "@/components/admin/UploadZone";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { AnalyticsDashboard } from "@/components/admin/AnalyticsDashboard";
import { VoicePreviewButton } from "@/components/admin/VoicePreviewModal";
import { ApiKeysManager } from "@/components/admin/ApiKeysManager";
import { ScrapeWizard, ScrapeActiveBanner } from "@/components/admin/ScrapeWizard";
import { Button } from "@/components/ui/button";
import { apiFetchJson } from "@/lib/runtime";
import { isPendingDocumentStuck } from "@/modules/knowledge-bases/core/ingest-queue-state";

export default function KbDashboardPage() {
  const { kbId = "" } = useParams<{ kbId: string }>();
  const { data: kb, loading: kbLoading, refetch: refetchKb } = useKb(kbId);
  const { data: configAgent } = useAgent(kb?.agentId);
  const configHref = kb && configAgent ? `/orgs/${configAgent.orgId}/agents/${kb.agentId}/config` : "#";
  const { docs, loading: docsLoading, upload, remove, reprocess, refetch: refetchDocs } = useDocuments(kbId);
  const { data: analytics, loading: analyticsLoading, refetch: refetchAnalytics } = useAnalytics(kbId);

  const [tab, setTab] = useState<"documents" | "scrape" | "analytics" | "deploy">("documents");
  const [archiving, setArchiving]     = useState(false);
  const [draining, setDraining]       = useState(false);
  const [drainResult, setDrainResult] = useState<string | null>(null);

  const handleDrainQueue = useCallback(async () => {
    setDraining(true);
    setDrainResult(null);
    try {
      const data = await apiFetchJson<{ processed?: number; errors?: number; error?: string }>(
        "/api/worker/ingest?drain=true", { method: "GET" }
      );
      if (data.error) {
        setDrainResult(`Error: ${data.error}`);
      } else {
        setDrainResult(`Processed ${data.processed ?? 0} job(s), ${data.errors ?? 0} error(s)`);
        refetchKb();
        refetchDocs();
      }
    } catch (e) {
      setDrainResult(`Error: ${(e as Error).message}`);
    } finally {
      setDraining(false);
    }
  }, [refetchKb, refetchDocs]);

  const total       = docs.length;
  const ready       = docs.filter((d) => d.status === "ready").length;
  const processing  = docs.filter((d) => d.status === "pending" || d.status === "processing").length;
  const stuck       = docs.filter((d) => isPendingDocumentStuck(d)).length;
  const failed      = docs.filter((d) => d.status === "failed").length;
  const totalChunks = docs.reduce((s, d) => s + (d.chunkCount ?? 0), 0);

  const handleArchiveToggle = useCallback(async () => {
    if (!kb) return;
    const newStatus = kb.status === "active" ? "archived" : "active";
    if (newStatus === "archived") {
      if (!confirm("Archive this knowledge base? Documents and vectors are preserved; uploads will be blocked.")) return;
    }
    setArchiving(true);
    try {
      await updateKb(kbId, { status: newStatus });
      refetchKb();
    } catch { /* ignore */ }
    finally { setArchiving(false); }
  }, [kb, kbId, refetchKb]);

  return (
    <div className="p-8 max-w-5xl">
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/orgs" className="hover:text-foreground transition-colors">Organisations</Link>
        <span>/</span>
        <span className="text-foreground font-medium">{kbLoading ? "…" : kb?.name}</span>
      </nav>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">
              {kbLoading
                ? <span className="inline-block h-7 w-48 rounded bg-muted/50 animate-pulse" />
                : kb?.name}
            </h1>
            {kb && <StatusBadge status={kb.status} />}
          </div>
          {kb?.description && (
            <p className="mt-1 text-sm text-muted-foreground">{kb.description}</p>
          )}
          {kb && (
            <p className="mt-0.5 text-xs text-muted-foreground font-mono">
              Collection: {kb.qdrantCollection}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {kb && <VoicePreviewButton kbId={kb.id} kbName={kb.name} />}
          <Link href={configHref}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Config
            </Button>
          </Link>
          {kb && (
            <Button
              variant={kb.status === "active" ? "outline" : "default"}
              size="sm"
              onClick={handleArchiveToggle}
              disabled={archiving || kbLoading}
              className={kb.status === "active"
                ? "gap-1.5 text-muted-foreground hover:text-destructive hover:border-destructive/40"
                : "gap-1.5 text-success border-success/40 hover:bg-success/10"}
            >
              {archiving ? "…" : kb.status === "active" ? "Archive" : "Restore"}
            </Button>
          )}
        </div>
      </div>

      {kb?.status === "archived" && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-muted bg-muted/20 px-5 py-4">
          <svg className="h-5 w-5 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">This knowledge base is archived.</span>{" "}
            Document uploads and voice sessions are disabled. Click &quot;Restore&quot; to reactivate.
          </p>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Documents"    value={total} />
        <StatCard label="Ready"        value={ready}                      color="success" />
        <StatCard label="Processing"   value={processing}                 color="warning" animate={processing > 0} />
        <StatCard label="Total Chunks" value={totalChunks.toLocaleString()} />
      </div>

      {failed > 0 && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-3">
          <svg className="h-5 w-5 shrink-0 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-sm text-destructive">
            {failed} document{failed > 1 ? "s" : ""} failed — use the &quot;Retry&quot; button on each.
          </p>
        </div>
      )}

      {tab !== "scrape" && <ScrapeActiveBanner kbId={kbId} />}

      <div className="mb-6 flex gap-1 rounded-lg bg-muted/50 p-1 border border-border w-fit">
        {([
          ["documents", "Documents"],
          ["scrape",    "🕷 Scrape"],
          ["analytics", "Analytics"],
          ["deploy",    "🚀 Deploy"],
        ] as const).map(([id, label]) => (
          <button key={id}
            onClick={() => { setTab(id); if (id === "analytics") refetchAnalytics(); }}
            className={`rounded-md px-5 py-1.5 text-sm font-medium transition-all ${
              tab === id
                ? "bg-card text-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "documents" && (
        <div className="space-y-4">
          {stuck > 0 && (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-warning/30 bg-warning/5 px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-warning animate-pulse" />
                <p className="text-sm text-warning">
                  {stuck} document{stuck > 1 ? "s have" : " has"} been waiting in the queue for more than 30 seconds.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleDrainQueue} disabled={draining}
                className="shrink-0 border-warning/40 text-warning hover:bg-warning/10 hover:text-warning">
                {draining ? "Processing…" : "Process queue"}
              </Button>
            </div>
          )}

          {processing > 0 && stuck === 0 && (
            <div className="rounded-xl border border-border bg-muted/20 px-5 py-3">
              <p className="text-sm text-foreground/80">
                {processing} document{processing > 1 ? "s are" : " is"} being processed automatically.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">No action is required. The table checks for updates every 4 seconds.</p>
            </div>
          )}

          {drainResult && (
            <div className={`rounded-xl border px-5 py-3 text-sm ${
              drainResult.startsWith("Error")
                ? "border-destructive/30 bg-destructive/5 text-destructive"
                : "border-success/30 bg-success/5 text-success"
            }`}>
              {drainResult}
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-6 shadow-soft">
            {docsLoading && docs.length === 0
              ? <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="h-12 rounded-lg bg-muted/40 animate-pulse" />)}</div>
              : <UploadZone kbId={kbId} docs={docs} onUpload={upload} onDelete={remove} onReprocess={reprocess} />}
            {processing > 0 && (
              <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
                Polling for updates every 4 seconds…
              </p>
            )}
          </div>
        </div>
      )}

      {tab === "scrape" && (
        <ScrapeWizard kbId={kbId} />
      )}

      {tab === "analytics" && (
        analyticsLoading || !analytics
          ? <div className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                {[1,2,3,4].map((i) => <div key={i} className="h-20 rounded-xl bg-muted/40 animate-pulse" />)}
              </div>
              <div className="h-48 rounded-xl bg-muted/40 animate-pulse" />
            </div>
          : <AnalyticsDashboard analytics={analytics} />
      )}

      {tab === "deploy" && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-soft">
          <ApiKeysManager kbId={kbId} />
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, animate }: {
  label: string; value: string | number; color?: string; animate?: boolean;
}) {
  const colorMap: Record<string, string> = {
    success: "text-success", warning: "text-warning", destructive: "text-destructive",
  };
  return (
    <div className="rounded-xl border border-border bg-muted/20 px-5 py-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${color ? (colorMap[color] ?? "text-foreground") : "text-foreground"} ${animate ? "animate-pulse" : ""}`}>
        {value}
      </p>
    </div>
  );
}
