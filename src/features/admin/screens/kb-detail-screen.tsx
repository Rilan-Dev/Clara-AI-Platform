"use client";

import { KnowledgeIndexPanel } from "@/components/admin/KnowledgeIndexPanel";
import Link from "next/link";
import { useCallback, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { KbTabBar, isKbTab, type KbTab } from "@/features/admin/screens/kb-tab-bar";
import { usePlatformFeatures } from "@/features/admin/use-platform-features";
import { AlertTriangle, BookOpen, Layers3, RefreshCw } from "lucide-react";
import { useAnalytics, useAuth, useDocuments, useKb, useOrg, useAgent } from "@/modules/admin-ui/hooks";
import { updateKb } from "@/modules/admin-ui/api";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ScrapeWizard } from "@/components/admin/ScrapeWizard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { UploadZone } from "@/components/admin/UploadZone";
import { WebSourcesPanel } from "@/components/admin/WebSourcesPanel";
import { AnalyticsDashboard } from "@/components/admin/AnalyticsDashboard";
import { VoicePreviewButton } from "@/components/admin/VoicePreviewModal";
import { ApiKeysManager } from "@/components/admin/ApiKeysManager";
import { WidgetDesignPanel } from "@/components/admin/WidgetDesignPanel";
import { PhoneCallPanel } from "@/components/admin/PhoneCallPanel";
import { Button } from "@/components/ui/button";
import { apiFetchJson } from "@/lib/runtime";
import { isPendingDocumentStuck } from "@/modules/knowledge-bases/core/ingest-queue-state";
import { confirmAction } from "@/components/ui/confirm-dialog";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function KbDashboardPage() {
  const { kbId = "" } = useParams<{ kbId: string }>();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.isSuperAdmin ?? false;
  const features = usePlatformFeatures();
  const { data: kb, loading: kbLoading, refetch: refetchKb } = useKb(kbId);
  const agentId = kb?.agentId ?? searchParams.get("agentId");
  const { data: agent } = useAgent(agentId);
  const orgId = agent?.orgId ?? searchParams.get("orgId");
  const { data: org } = useOrg(orgId);
  const { docs, loading: docsLoading, error: docsError, upload, remove, reprocess, refetch: refetchDocs } = useDocuments(kbId);
  const { data: analytics, loading: analyticsLoading, refetch: refetchAnalytics } = useAnalytics(kbId);

  // The active tab lives in the URL (?tab=design) so it survives refresh,
  // works with Back, and can be linked to from other screens.
  const router = useRouter();
  const pathname = usePathname();
  const requestedTab = searchParams.get("tab");
  const tab: KbTab = isKbTab(requestedTab) &&
    (features.embeddableWidget || (requestedTab !== "deploy" && requestedTab !== "design"))
    ? requestedTab as KbTab : "documents";
  const selectTab = (next: KbTab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "documents") params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    if (next === "analytics") refetchAnalytics();
  };
  const [docSubTab, setDocSubTab] = useState<"uploads" | "web">("uploads");
  const [archiving, setArchiving] = useState(false);
  const [draining, setDraining] = useState(false);
  const [drainResult, setDrainResult] = useState<string | null>(null);

  const handleRetryLoad = useCallback(() => {
    refetchDocs();
  }, [refetchDocs]);

  const total = docs.length;
  const ready = docs.filter((doc) => doc.status === "ready").length;
  const processing = docs.filter((doc) => doc.status === "pending" || doc.status === "processing").length;
  const failedDocs = docs.filter((doc) => doc.status === "failed");
  const failed = failedDocs.length;
  const failedReason = failedDocs.find((doc) => doc.errorMessage)?.errorMessage ?? null;
  const stuck = docs.filter((doc) => isPendingDocumentStuck(doc)).length;
  const totalChunks = docs.reduce((sum, doc) => sum + (doc.chunkCount ?? 0), 0);
  const uploadCount = docs.filter((doc) => doc.sourceType !== "url").length;
  const webCount = docs.filter((doc) => doc.sourceType === "url").length;

  const handleDrainQueue = useCallback(async () => {
    setDraining(true);
    setDrainResult(null);
    try {
      const data = await apiFetchJson<{ processed?: number; errors?: number; error?: string }>(
        "/api/worker/ingest?drain=true",
        { method: "GET" },
      );
      if (data.error) {
        setDrainResult(`Error: ${data.error}`);
      } else {
        setDrainResult(`Processed ${data.processed ?? 0} job(s), ${data.errors ?? 0} error(s)`);
        refetchKb();
        refetchDocs();
      }
    } catch (err) {
      setDrainResult(`Error: ${(err as Error).message}`);
    } finally {
      setDraining(false);
    }
  }, [refetchDocs, refetchKb]);

  const handleArchiveToggle = useCallback(async () => {
    if (!kb) return;
    const nextStatus = kb.status === "active" ? "archived" : "active";
    if (nextStatus === "archived") {
      const ok = await confirmAction({
        title: "Archive this knowledge base?",
        description: "Uploads and voice access are blocked until you restore it. Documents and vectors are kept.",
        confirmLabel: "Archive",
      });
      if (!ok) return;
    }
    setArchiving(true);
    try {
      await updateKb(kbId, { status: nextStatus });
      refetchKb();
    } finally {
      setArchiving(false);
    }
  }, [kb, kbId, refetchKb]);

  const projectHref = orgId && agentId ? `/orgs/${orgId}/agents/${agentId}` : "/orgs";
  // Assistant & AI configuration lives on the agent — link there from the KB.
  const kbConfigHref = orgId && agentId
    ? `/orgs/${orgId}/agents/${agentId}/config`
    : "/settings";

  if (isAdmin) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
        <AdminPageHeader
          icon={BookOpen}
          title={kbLoading ? "Loading knowledge base..." : kb?.name ?? "Knowledge Base"}
          description="Monitor document ingestion, run analytics, preview voice behavior, and manage deployment keys from the main KB workspace."
          breadcrumbs={[
            { label: "Organisations", href: "/orgs" },
            ...(orgId ? [{ label: org?.name ?? "Organisation", href: `/orgs/${orgId}` }] : []),
            ...(orgId && agentId ? [{ label: agent?.name ?? "Agent", href: projectHref }] : []),
            { label: kb?.name ?? "Knowledge Base" },
          ]}
          chips={[
            kb?.status ?? "loading",
            `${total} document${total === 1 ? "" : "s"}`,
            kb?.qdrantCollection ?? "vector collection",
          ]}
          actions={
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:flex-wrap w-full sm:w-auto">
              {kb && <StatusBadge status={kb.status} />}
              {kb && <VoicePreviewButton kbId={kb.id} kbName={kb.name} />}
              <Link href={kbConfigHref}>
                <Button variant="outline" size="sm">Assistant & AI</Button>
              </Link>
              {kb && (
                <Button variant="outline" size="sm" onClick={handleArchiveToggle} disabled={archiving}>
                  {archiving ? "Updating..." : kb.status === "active" ? "Archive" : "Restore"}
                </Button>
              )}
            </div>
          }
        />

        {kb?.status === "archived" && (
          <div className="rounded-2xl border border-amber-600/25 bg-amber-500/10 px-5 py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-medium text-amber-700">This knowledge base is archived.</p>
                <p className="mt-1 text-sm text-amber-700/80">
                  Document uploads, scrape runs, and voice sessions stay blocked until you restore the KB.
                </p>
              </div>
            </div>
          </div>
        )}

        {kb && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">Knowledge Base</div>
              <p className="mt-3 text-sm leading-6 text-foreground/80">
                {kb.description || "No description yet. Add context in the assistant config so operators know what this KB covers."}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground/70">
                <Layers3 className="h-3.5 w-3.5 text-primary" /> Collection
              </div>
              <p className="mt-3 break-words [overflow-wrap:anywhere] font-mono text-xs text-foreground/80">{kb.qdrantCollection}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">Created</div>
              <p className="mt-3 text-sm text-foreground/80">{formatDate(kb.createdAt)}</p>
              {agent?.name ? <p className="mt-2 text-xs text-muted-foreground/70">Agent: {agent.name}</p> : null}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
          {[
            { label: "Documents", value: total },
            { label: "Ready", value: ready },
            { label: "Processing", value: processing },
            { label: "Total Chunks", value: totalChunks.toLocaleString() },
          ].map((item) => (
            <div key={item.label} className="border border-border bg-card rounded-2xl p-3 sm:p-5 shadow-sm">
              <div className="text-xs text-muted-foreground/70 mb-2">{item.label}</div>
              <div className="text-xl sm:text-2xl font-black text-foreground">{item.value}</div>
            </div>
          ))}
        </div>

        <KbTabBar value={tab} onChange={selectTab} embeddableWidgetEnabled={features.embeddableWidget} />

        {tab === "documents" && (
          <div className="space-y-4">
            {!isAdmin && <KnowledgeIndexPanel kbId={kbId} />}
            {docsError && (
              <div className="flex flex-col gap-3 rounded-2xl border border-destructive/25 bg-destructive/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-destructive">
                    Couldn&apos;t load the document list{docsError ? ": " : "."}
                    {docsError}
                  </p>
                  <p className="mt-1 text-xs text-destructive/75">
                    Your documents are safe — this is a temporary server/database hiccup. The list keeps retrying automatically every 4 seconds.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleRetryLoad} className="shrink-0">
                  Retry now
                </Button>
              </div>
            )}
            {stuck > 0 && (
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-amber-600/20 bg-amber-500/10 px-5 py-4">
                <div>
                  <p className="text-sm text-amber-600">
                    {stuck} document{stuck > 1 ? "s have" : " has"} been waiting in the queue for more than 30 seconds.
                  </p>
                  <p className="mt-1 text-xs text-amber-700/75">
                    Automatic processing appears stalled. The table keeps polling every 4 seconds while jobs are pending.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleDrainQueue} disabled={draining}>
                  {draining ? "Processing..." : "Process queue"}
                </Button>
              </div>
            )}

            {processing > 0 && stuck === 0 && (
              <div className="rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
                <p className="text-sm text-muted-foreground">
                  {processing} document{processing > 1 ? "s are" : " is"} being processed automatically.
                </p>
                <p className="mt-1 text-xs text-muted-foreground/70">No action is required. The table checks for status updates every 4 seconds.</p>
              </div>
            )}

            {drainResult && (
              <div className="rounded-2xl border border-border bg-card px-5 py-4 shadow-sm text-sm text-muted-foreground">
                {drainResult}
              </div>
            )}

            {failed > 0 && (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-5 py-4 text-sm text-destructive">
                <p>
                  {failed} document{failed > 1 ? "s" : ""} failed. Retry them after fixing the root cause:
                </p>
                {failedReason && (
                  <p className="mt-1.5 break-words rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 font-mono text-[11px] leading-4 text-destructive/85">
                    {failedReason}
                  </p>
                )}
                <p className="mt-1.5 text-xs text-destructive/70">
                  Expand “Why did this fail?” on a row below for the full error. Each document row offers Retry once the cause is resolved.
                </p>
              </div>
            )}

            <div className="flex gap-1 rounded-lg bg-muted/50 p-1 border border-border/70 w-fit">
              {(["uploads", "web"] as const).map((st) => {
                const label = st === "uploads"
                  ? `Uploaded Files${uploadCount > 0 ? ` (${uploadCount})` : ""}`
                  : `Web Sources${webCount > 0 ? ` (${webCount})` : ""}`;
                return (
                  <button key={st} onClick={() => setDocSubTab(st)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${docSubTab === st
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "text-muted-foreground hover:text-foreground"
                      }`}>
                    {label}
                  </button>
                );
              })}
            </div>

            {docsLoading && docs.length === 0 ? (
              <div className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-12 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : docSubTab === "uploads" ? (
              <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm">
                <UploadZone kbId={kbId} docs={docs} onUpload={upload} onDelete={remove} onReprocess={reprocess} />
                {processing > 0 && (
                  <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground/70">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                    Polling for document status updates every 4 seconds.
                  </p>
                )}
              </div>
            ) : (
              <WebSourcesPanel kbId={kbId} docs={docs} onDelete={remove} onReprocess={reprocess} />
            )}
          </div>
        )}

        {tab === "scrape" && <ScrapeWizard kbId={kbId} />}

        {tab === "analytics" && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            {analyticsLoading || !analytics ? (
              <div className="flex items-center gap-3 text-muted-foreground/70">
                <RefreshCw className="w-4 h-4 animate-spin" /> Loading analytics...
              </div>
            ) : (
              <AnalyticsDashboard analytics={analytics} />
            )}
          </div>
        )}

        {features.embeddableWidget && tab === "deploy" && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <ApiKeysManager kbId={kbId} />
          </div>
        )}

        {features.embeddableWidget && kb?.agentId && tab === "design" && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <WidgetDesignPanel key={`${kbId}:${kb.agentId}`} kbId={kbId} agentId={kb.agentId} />
          </div>
        )}

        {tab === "phone" && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <PhoneCallPanel kbId={kbId} />
          </div>
        )}
      </div>
    );
  }

  // ── Org user view ────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <AdminPageHeader
        icon={BookOpen}
        title={kbLoading ? "Loading knowledge base..." : kb?.name ?? "Knowledge Base"}
        description="Manage documents, run analytics, preview voice behavior, and configure your assistant for this knowledge base."
        breadcrumbs={[
          ...(orgId ? [{ label: org?.name ?? "Organisation", href: `/orgs/${orgId}` }] : []),
          ...(orgId && agentId ? [{ label: agent?.name ?? "Agent", href: projectHref }] : []),
          { label: kb?.name ?? "Knowledge Base" },
        ]}
        chips={[
          kb?.status ?? "loading",
          `${total} document${total === 1 ? "" : "s"}`,
          kb?.qdrantCollection ?? "vector collection",
        ]}
        actions={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:flex-wrap w-full sm:w-auto">
            {kb && <StatusBadge status={kb.status} />}
            {kb && <VoicePreviewButton kbId={kb.id} kbName={kb.name} />}
            <Link href={kbConfigHref}>
              <Button variant="outline" size="sm">Assistant & AI</Button>
            </Link>
            {kb && (
              <Button variant="outline" size="sm" onClick={handleArchiveToggle} disabled={archiving}>
                {archiving ? "Updating..." : kb.status === "active" ? "Archive" : "Restore"}
              </Button>
            )}
          </div>
        }
      />

      {kb?.status === "archived" && (
        <div className="rounded-2xl border border-amber-600/25 bg-amber-500/10 px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium text-amber-700">This knowledge base is archived.</p>
              <p className="mt-1 text-sm text-amber-700/80">
                Document uploads, scrape runs, and voice sessions stay blocked until you restore the KB.
              </p>
            </div>
          </div>
        </div>
      )}

      {kb && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">Knowledge Base</div>
            <p className="mt-3 text-sm leading-6 text-foreground/80">
              {kb.description || "No description yet. Add context in the assistant config so operators know what this KB covers."}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground/70">
              <Layers3 className="h-3.5 w-3.5 text-primary" /> Collection
            </div>
            <p className="mt-3 break-words [overflow-wrap:anywhere] [word-break:normal] font-mono text-xs text-foreground/80">{kb.qdrantCollection}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">Created</div>
            <p className="mt-3 text-sm text-foreground/80">{formatDate(kb.createdAt)}</p>
            {agent?.name ? <p className="mt-2 text-xs text-muted-foreground/70">Agent: {agent.name}</p> : null}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
        {[
          { label: "Documents", value: total },
          { label: "Ready", value: ready },
          { label: "Processing", value: processing },
          { label: "Total Chunks", value: totalChunks.toLocaleString() },
        ].map((item) => (
          <div key={item.label} className="border border-border bg-card rounded-2xl p-3 sm:p-5 shadow-sm">
            <div className="text-xs text-muted-foreground/70 mb-2">{item.label}</div>
            <div className="text-xl sm:text-2xl font-black text-foreground">{item.value}</div>
          </div>
        ))}
      </div>

      <KbTabBar value={tab} onChange={selectTab} embeddableWidgetEnabled={features.embeddableWidget} />

      {tab === "documents" && (
        <div className="space-y-4">
          {!isAdmin && <KnowledgeIndexPanel kbId={kbId} />}
          {docsError && (
            <div className="flex flex-col gap-3 rounded-2xl border border-destructive/25 bg-destructive/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-destructive">
                  Couldn&apos;t load the document list{docsError ? ": " : "."}
                  {docsError}
                </p>
                <p className="mt-1 text-xs text-destructive/75">
                  Your documents are safe — this is a temporary server/database hiccup. The list keeps retrying automatically every 4 seconds.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleRetryLoad} className="shrink-0">
                Retry now
              </Button>
            </div>
          )}
          {stuck > 0 && (
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-amber-600/20 bg-amber-500/10 px-5 py-4">
              <div>
                <p className="text-sm text-amber-600">
                  {stuck} document{stuck > 1 ? "s have" : " has"} been waiting in the queue for more than 30 seconds.
                </p>
                <p className="mt-1 text-xs text-amber-700/75">
                  Automatic processing appears stalled. The table keeps polling every 4 seconds while jobs are pending.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleDrainQueue} disabled={draining}>
                {draining ? "Processing..." : "Process queue"}
              </Button>
            </div>
          )}

          {processing > 0 && stuck === 0 && (
            <div className="rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
              <p className="text-sm text-muted-foreground">
                {processing} document{processing > 1 ? "s are" : " is"} being processed automatically.
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">No action is required. The table checks for status updates every 4 seconds.</p>
            </div>
          )}

          {drainResult && (
            <div className="rounded-2xl border border-border bg-card px-5 py-4 shadow-sm text-sm text-muted-foreground">
              {drainResult}
            </div>
          )}

          {failed > 0 && (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-5 py-4 text-sm text-destructive">
              <p>
                {failed} document{failed > 1 ? "s" : ""} failed. Retry them after fixing the root cause:
              </p>
              {failedReason && (
                <p className="mt-1.5 break-words rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 font-mono text-[11px] leading-4 text-destructive/85">
                  {failedReason}
                </p>
              )}
              <p className="mt-1.5 text-xs text-destructive/70">
                Expand “Why did this fail?” on a row below for the full error. Each document row offers Retry once the cause is resolved.
              </p>
            </div>
          )}

          <div className="flex gap-1 rounded-lg bg-muted/50 p-1 border border-border/70 w-fit">
            {(["uploads", "web"] as const).map((st) => {
              const label = st === "uploads"
                ? `Uploaded Files${uploadCount > 0 ? ` (${uploadCount})` : ""}`
                : `Web Sources${webCount > 0 ? ` (${webCount})` : ""}`;
              return (
                <button key={st} onClick={() => setDocSubTab(st)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${docSubTab === st
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:text-foreground"
                    }`}>
                  {label}
                </button>
              );
            })}
          </div>

          {docsLoading && docs.length === 0 ? (
            <div className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-12 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : docSubTab === "uploads" ? (
            <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm">
              <UploadZone kbId={kbId} docs={docs} onUpload={upload} onDelete={remove} onReprocess={reprocess} />
              {processing > 0 && (
                <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground/70">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Polling for document status updates every 4 seconds.
                </p>
              )}
            </div>
          ) : (
            <WebSourcesPanel kbId={kbId} docs={docs} onDelete={remove} onReprocess={reprocess} />
          )}
        </div>
      )}

      {tab === "scrape" && <ScrapeWizard kbId={kbId} />}

      {tab === "analytics" && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          {analyticsLoading || !analytics ? (
            <div className="flex items-center gap-3 text-muted-foreground/70">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading analytics...
            </div>
          ) : (
            <AnalyticsDashboard analytics={analytics} />
          )}
        </div>
      )}

      {features.embeddableWidget && tab === "deploy" && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <ApiKeysManager kbId={kbId} />
        </div>
      )}

      {features.embeddableWidget && kb?.agentId && tab === "design" && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <WidgetDesignPanel key={`${kbId}:${kb.agentId}`} kbId={kbId} agentId={kb.agentId} />
        </div>
      )}

      {tab === "phone" && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <PhoneCallPanel kbId={kbId} />
        </div>
      )}
    </div>
  );
}
