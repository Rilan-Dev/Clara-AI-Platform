"use client";

/**
 * src/features/admin/screens/agent-workspace/overview-screen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * /orgs/[id]/agents/[agentId] — Overview tab: the agent at a glance.
 *
 * 2026-09 revamp — a state-aware command centre:
 *   • shimmer skeletons while anything loads (context, versions,
 *     deployments, knowledge bases each stream in independently)
 *   • a status hero that answers "is production current?" in one look
 *   • quick actions wired to the ONE-CLICK publish + dedicated preview
 *   • live facts (knowledge, languages, voice, versions, deployments)
 *   • a recent-activity timeline and a next-step suggestion
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock,
  ExternalLink,
  FileStack,
  GitBranch,
  Globe,
  History,
  Mic,
  PencilLine,
  Plus,
  Rocket,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useKbs } from "@/modules/admin-ui/hooks";
import {
  fetchAgentDeployments,
  fetchAgentVersions,
  publishAgentVersion,
  saveAgentVersion,
  type AgentDeploymentDTO,
  type AgentVersionDTO,
} from "@/modules/admin-ui/ai-platform-api";
import {
  useAgentWorkspaceContext,
  useAgentsWorkspace,
} from "@/features/admin/screens/agent-workspace/workspace-shell";
import { VersionBadge, WorkspaceButton, timeAgo } from "@/components/admin/ai-platform/shared";
import { cn } from "@/lib/utils";

// ─── Shimmer primitives ──────────────────────────────────────────────────────

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative overflow-hidden rounded-lg bg-muted/70",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-background/60 before:to-transparent",
        className,
      )}
    />
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      {/* Status hero */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="space-y-3">
            <Shimmer className="h-5 w-44" />
            <Shimmer className="h-8 w-72" />
            <Shimmer className="h-4 w-56" />
          </div>
          <div className="flex gap-2">
            <Shimmer className="h-10 w-28" />
            <Shimmer className="h-10 w-36" />
          </div>
        </div>
      </div>
      {/* Facts grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <Shimmer className="h-4 w-24" />
            <Shimmer className="mt-3 h-7 w-16" />
            <Shimmer className="mt-2 h-3 w-32" />
          </div>
        ))}
      </div>
      {/* Two-column detail */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <Shimmer className="h-4 w-32" />
          <div className="mt-4 space-y-3">
            {[0, 1, 2].map((i) => <Shimmer key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <Shimmer className="h-4 w-32" />
          <div className="mt-4 space-y-3">
            {[0, 1, 2, 3].map((i) => <Shimmer key={i} className="h-10 w-full rounded-lg" />)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function AgentOverviewScreen() {
  const { agentId = "" } = useParams<{ agentId: string }>();
  const { orgId } = useAgentsWorkspace();
  const { context, loading, refetch } = useAgentWorkspaceContext(agentId);
  const { kbs, loading: kbsLoading } = useKbs(agentId);

  const [versions, setVersions] = useState<AgentVersionDTO[] | null>(null);
  const [deployments, setDeployments] = useState<AgentDeploymentDTO[] | null>(null);
  const [publishing, setPublishing] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const [versionsResult, deploymentsResult] = await Promise.all([
        fetchAgentVersions(agentId).catch(() => null),
        fetchAgentDeployments(agentId).catch(() => null),
      ]);
      setVersions(versionsResult?.versions ?? []);
      setDeployments(deploymentsResult?.deployments ?? []);
    } catch {
      setVersions([]);
      setDeployments([]);
    }
  }, [agentId]);

  useEffect(() => {
    if (!agentId) return;
    void loadHistory();
  }, [agentId, loadHistory]);

  // Keep this screen in sync with topbar/one-click publishes elsewhere.
  useEffect(() => {
    const handler = () => void loadHistory();
    window.addEventListener("agent-workspace:refresh", handler);
    return () => window.removeEventListener("agent-workspace:refresh", handler);
  }, [loadHistory]);

  const deployment = context?.deployment ?? null;
  const currentVersion = context?.currentVersion ?? null;
  const draft = context?.draftUpdatedAt ? new Date(context.draftUpdatedAt) : null;

  const draftEditedSinceVersion =
    draft != null &&
    currentVersion != null &&
    draft.getTime() > new Date(currentVersion.createdAt).getTime();

  const productionUpToDate =
    !!deployment &&
    !!currentVersion &&
    deployment.versionNumber === currentVersion.versionNumber &&
    !draftEditedSinceVersion;

  const unpublishedVersion =
    currentVersion && (!deployment || deployment.versionNumber !== currentVersion.versionNumber)
      ? currentVersion
      : null;

  const canPublish = !!currentVersion && (!productionUpToDate || !deployment);

  // One-click publish — identical semantics to the topbar cluster button: draft edits
  // become a version automatically, then production is pointed at it.
  const publishNow = useCallback(async () => {
    if (publishing) return;
    setPublishing(true);
    try {
      let versionId = currentVersion?.id ?? null;
      if (draftEditedSinceVersion) {
        const version = await saveAgentVersion(agentId, null);
        versionId = version.id;
      }
      if (!versionId) {
        toast.error("Nothing to publish yet", {
          description: "Save your assistant configuration first — a version is created from the draft.",
        });
        return;
      }
      const result = await publishAgentVersion(agentId, versionId, deployment?.publicAccess ?? true);
      toast.success("Agent published", {
        description: `Production is now running ${result.deployment.branchName} · v${result.deployment.versionNumber}.`,
      });
      await Promise.all([refetch(), loadHistory()]);
      window.dispatchEvent(new CustomEvent("agent-workspace:refresh"));
    } catch (err) {
      toast.error("Publish failed", { description: (err as Error).message });
    } finally {
      setPublishing(false);
    }
  }, [publishing, currentVersion, draftEditedSinceVersion, agentId, deployment?.publicAccess, refetch, loadHistory]);

  // ── Activity timeline: versions + deployments, newest first ───────────────
  const activity = useMemo(() => {
    if (!versions && !deployments) return null;
    const items: Array<{
      key: string;
      kind: "version" | "publish";
      at: string;
      title: string;
      detail: string;
      by: string | null;
    }> = [];
    for (const v of versions ?? []) {
      items.push({
        key: `v-${v.id}`,
        kind: "version",
        at: v.createdAt,
        title: `Version saved · v${v.versionNumber}`,
        detail: v.changeSummary ?? `${v.branchName} branch`,
        by: v.createdByName,
      });
    }
    for (const d of deployments ?? []) {
      items.push({
        key: `d-${d.id}`,
        kind: "publish",
        at: d.publishedAt,
        title: `Published · v${d.versionNumber}${d.status === "active" ? " (live)" : ""}`,
        detail: d.changeSummary ?? `${d.branchName} · ${d.publicAccess ? "public" : "private"}`,
        by: d.publishedByName,
      });
    }
    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 6);
  }, [versions, deployments]);

  const totalVersions = versions?.length ?? 0;
  const totalDeployments = deployments?.length ?? 0;
  const activeKbs = kbs.filter((kb) => kb.status === "active").length;
  const archivedKbs = kbs.length - activeKbs;

  // The provider derives orgId from the URL, but during initial hydration it
  // can briefly be empty. Prefer the authoritative agent context and never
  // emit a malformed /orgs/agents/:agentId URL.
  const resolvedOrgId = orgId || context?.agent.orgId || "";
  const agentBase = resolvedOrgId ? `/orgs/${resolvedOrgId}/agents/${agentId}` : "/orgs";
  const configHref = `${agentBase}/config`;
  const knowledgeHref = `${agentBase}/knowledge`;
  const versionsHref = `${agentBase}/versions`;
  const previewHref = `/preview/agents/${agentId}`;

  return (
    <div>
      {loading ? (
        <div className="space-y-6">
          <OverviewSkeleton />
        </div>
      ) : !context ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-6 py-10 text-center">
          <p className="text-sm font-medium text-destructive">This agent could not be loaded.</p>
          <Link href={`/orgs/${orgId}/agents`} className="mt-3 inline-block text-xs text-muted-foreground underline-offset-2 hover:underline">
            ← Back to agents
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Status hero: production currency at a glance ─────────────── */}
          <section
            className={cn(
              "relative overflow-hidden rounded-2xl border bg-card p-6 shadow-sm",
              productionUpToDate
                ? "border-emerald-600/25"
                : deployment
                  ? "border-amber-600/30"
                  : "border-primary/25",
            )}
          >
            <div
              aria-hidden
              className={cn(
                "absolute inset-x-0 top-0 h-1",
                productionUpToDate
                  ? "bg-gradient-to-r from-emerald-500/70 to-emerald-400/30"
                  : deployment
                    ? "bg-gradient-to-r from-amber-500/70 to-amber-400/30"
                    : "bg-gradient-to-r from-primary/70 to-primary/30",
              )}
            />
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" /> Production status
                </p>
                {deployment ? (
                  <>
                    <h2 className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-lg font-semibold tracking-tight text-foreground">
                      {productionUpToDate ? (
                        <>
                          <Check className="h-5 w-5 text-emerald-500" /> Production is up to date
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-5 w-5 text-amber-500" /> Update ready to publish
                        </>
                      )}
                    </h2>
                    <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
                      {productionUpToDate ? (
                        <>
                          Visitors are served <span className="font-medium text-foreground">Main · v{deployment.versionNumber}</span>
                          {deployment.publishedByName ? ` · published ${timeAgo(deployment.publishedAt)} by ${deployment.publishedByName}` : ` · published ${timeAgo(deployment.publishedAt)}`}
                          {deployment.publicAccess ? " · public" : " · private"}.
                        </>
                      ) : draftEditedSinceVersion ? (
                        <>
                          Draft changes from {timeAgo(context.draftUpdatedAt)} are not live yet — publish to serve them
                          {unpublishedVersion ? ` (v${currentVersion?.versionNumber ?? ""} is also unpublished)` : ""}.
                        </>
                      ) : (
                        <>
                          Main is at <span className="font-medium text-foreground">v{currentVersion?.versionNumber ?? "—"}</span> but
                          production still runs v{deployment.versionNumber} — publish to catch up.
                        </>
                      )}
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="mt-2 flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
                      <Rocket className="h-5 w-5 text-primary" /> Not published yet
                    </h2>
                    <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
                      {currentVersion
                        ? `v${currentVersion.versionNumber} is saved and ready — one click puts this agent in production.`
                        : "Configure the assistant, save a version, then publish to go live."}
                    </p>
                  </>
                )}
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <WorkspaceButton
                  variant="secondary"
                  onClick={() => window.open(previewHref, "_blank", "noopener")}
                  disabled={!deployment}
                  title={deployment ? "Open the published preview in a new tab" : "Publish first to preview"}
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Preview
                </WorkspaceButton>
                {canPublish ? (
                  <WorkspaceButton variant="primary" onClick={publishNow} disabled={publishing}>
                    <Rocket className={cn("h-3.5 w-3.5", publishing && "animate-pulse")} />
                    {publishing ? "Publishing…" : deployment ? "Publish update" : "Publish"}
                  </WorkspaceButton>
                ) : (
                  <WorkspaceButton variant="secondary" onClick={() => void refetch()} title="Production is up to date">
                    <Clock className="h-3.5 w-3.5" /> Up to date
                  </WorkspaceButton>
                )}
              </div>
            </div>

            {/* Version chain strip */}
            <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 font-medium text-muted-foreground">
                <GitBranch className="h-3 w-3" /> Main
              </span>
              <ChevronRight className="h-3 w-3 text-muted-foreground/80" />
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 font-medium text-foreground/80">
                <FileStack className="h-3 w-3" /> v{currentVersion?.versionNumber ?? 1} saved
              </span>
              <ChevronRight className="h-3 w-3 text-muted-foreground/80" />
              {deployment ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium",
                    productionUpToDate
                      ? "border-emerald-600/30 bg-emerald-500/10 text-emerald-600"
                      : "border-amber-600/30 bg-amber-500/10 text-amber-600",
                  )}
                >
                  <Rocket className="h-3 w-3" /> v{deployment.versionNumber} live
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1 font-medium text-muted-foreground/70">
                  Nothing live
                </span>
              )}
              {draftEditedSinceVersion && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 font-medium text-primary">
                  <Sparkles className="h-3 w-3" /> Draft ahead
                </span>
              )}
            </div>
          </section>

          {/* ── Facts grid ────────────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <FactCard
              icon={BookOpen}
              label="Knowledge bases"
              value={kbsLoading ? null : String(kbs.length)}
              hint={kbsLoading ? undefined : `${activeKbs} active${archivedKbs > 0 ? ` · ${archivedKbs} archived` : ""}`}
              href={knowledgeHref}
            />
            <FactCard
              icon={FileStack}
              label="Versions"
              value={versions === null ? null : String(totalVersions)}
              hint={currentVersion ? `Latest: v${currentVersion.versionNumber}` : "No versions yet"}
              href={versionsHref}
            />
            <FactCard
              icon={Rocket}
              label="Deployments"
              value={deployments === null ? null : String(totalDeployments)}
              hint={deployment ? `Live: v${deployment.versionNumber}` : "Never published"}
              href={`${agentBase}/publish`}
            />
            <FactCard
              icon={Clock}
              label="Draft activity"
              value={context.draftUpdatedAt ? timeAgo(context.draftUpdatedAt) : "—"}
              hint={draftEditedSinceVersion ? "Unpublished edits waiting" : "In sync with the latest version"}
              href={configHref}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* ── Knowledge ────────────────────────────────────────────────── */}
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <header className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-foreground">Knowledge</h2>
                <Link href={knowledgeHref} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80">
                  Manage <ArrowUpRight className="h-3 w-3" />
                </Link>
              </header>
              {kbsLoading ? (
                <div className="mt-4 space-y-2.5">
                  {[0, 1, 2].map((i) => <Shimmer key={i} className="h-14 rounded-xl" />)}
                </div>
              ) : kbs.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
                  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                    <Plus className="h-5 w-5 text-primary" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No knowledge bases yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Upload documents so this agent can answer with your content.
                  </p>
                  <Link href={knowledgeHref}>
                    <WorkspaceButton variant="primary" className="mt-3">
                      <Upload className="h-3.5 w-3.5" /> Add knowledge
                    </WorkspaceButton>
                  </Link>
                </div>
              ) : (
                <ul className="mt-4 space-y-2">
                  {kbs.slice(0, 4).map((kb) => (
                    <li key={kb.id}>
                      <Link
                        href={`${agentBase}/knowledge/${kb.id}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-surface px-4 py-3 transition-colors hover:border-primary/30"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span
                            className={cn(
                              "h-2 w-2 shrink-0 rounded-full",
                              kb.status === "active" ? "bg-emerald-500" : "bg-muted-foreground/40",
                            )}
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-foreground">{kb.name}</span>
                            <span className="block truncate text-[11px] text-muted-foreground/70">
                              {kb.description || "Knowledge base"}
                            </span>
                          </span>
                        </span>
                        <VersionBadge tone={kb.status === "active" ? "success" : "muted"}>
                          {kb.status}
                        </VersionBadge>
                      </Link>
                    </li>
                  ))}
                  {kbs.length > 4 && (
                    <li>
                      <Link href={knowledgeHref} className="block rounded-xl border border-dashed border-border px-4 py-2.5 text-center text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground">
                        + {kbs.length - 4} more knowledge base{kbs.length - 4 === 1 ? "" : "s"}
                      </Link>
                    </li>
                  )}
                </ul>
              )}
            </section>

            {/* ── Recent activity ──────────────────────────────────────────── */}
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <header className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
                <Link href={versionsHref} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80">
                  Full history <ArrowUpRight className="h-3 w-3" />
                </Link>
              </header>
              {activity === null ? (
                <div className="mt-4 space-y-3">
                  {[0, 1, 2, 3].map((i) => <Shimmer key={i} className="h-12 rounded-lg" />)}
                </div>
              ) : activity.length === 0 ? (
                <p className="mt-4 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-xs text-muted-foreground">
                  No versions or deployments yet — configure the assistant and save your first version.
                </p>
              ) : (
                <ol className="mt-4 space-y-1">
                  {activity.map((item) => (
                    <li key={item.key} className="flex gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/30">
                      <span
                        className={cn(
                          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                          item.kind === "publish"
                            ? "bg-emerald-500/10 text-emerald-600"
                            : "bg-primary/10 text-primary",
                        )}
                      >
                        {item.kind === "publish" ? <Rocket className="h-3.5 w-3.5" /> : <FileStack className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="text-sm font-medium text-foreground">{item.title}</span>
                          <span className="shrink-0 text-[11px] text-muted-foreground/80">{timeAgo(item.at)}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {item.detail}
                          {item.by ? ` · ${item.by}` : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          {/* ── Next step + quick actions ─────────────────────────────────── */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground">Continue working</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <QuickAction
                href={configHref}
                icon={PencilLine}
                title="Edit assistant & AI"
                desc="System prompt, behaviour, voice and appearance"
              />
              <QuickAction
                href={knowledgeHref}
                icon={BookOpen}
                title="Manage knowledge"
                desc={kbs.length > 0 ? `${kbs.length} knowledge base${kbs.length === 1 ? "" : "s"} attached` : "Add your first documents"}
              />
              <QuickAction
                href={versionsHref}
                icon={History}
                title="Versions & branches"
                desc={`${totalVersions} version${totalVersions === 1 ? "" : "s"} · full history`}
              />
              <QuickAction
                href={deployment ? previewHref : configHref}
                icon={deployment ? Globe : Mic}
                title={deployment ? "Open published preview" : "Set up the voice"}
                desc={deployment ? "See exactly what visitors see" : "Pick the realtime provider and speaker"}
                external={!!deployment}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// ─── Building blocks ─────────────────────────────────────────────────────────

function FactCard({
  icon: Icon,
  label,
  value,
  hint,
  href,
}: {
  icon: typeof BookOpen;
  label: string;
  value: string | null;
  hint?: string;
  href: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground/80" />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        {value == null ? <Shimmer className="h-7 w-16" /> : <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>}
      </div>
      {value != null && hint && <p className="mt-1 truncate text-[11px] text-muted-foreground/70">{hint}</p>}
      {value == null && <Shimmer className="mt-2 h-3 w-28" />}
    </>
  );
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
    >
      {body}
    </Link>
  );
}

function QuickAction({
  href,
  icon: Icon,
  title,
  desc,
  external,
}: {
  href: string;
  icon: typeof BookOpen;
  title: string;
  desc: string;
  external?: boolean;
}) {
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener"
        className="group flex items-start gap-3 rounded-xl border border-border/70 bg-surface px-4 py-3.5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            {title}
            <ExternalLink className="h-3 w-3 text-muted-foreground/80 transition-colors group-hover:text-primary" />
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{desc}</span>
        </span>
      </a>
    );
  }
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-border/70 bg-surface px-4 py-3.5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{desc}</span>
      </span>
    </Link>
  );
}
