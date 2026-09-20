"use client";

/**
 * src/components/admin/agent-workspace/AgentWorkspaceHeader.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Persistent agent workspace context (§19.2). Always answers:
 *   which agent · which branch · current version · unsaved draft state ·
 *   what is published · the next action.
 *
 *   ← Agents
 *   Clara Sales Assistant
 *   Main · v12 · Published
 *   [Versions] [Publish]
 *   Overview | Assistant & AI | Knowledge | Tools | Versions | Publish
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, GitBranch, Rocket, History } from "lucide-react";
import {
  checkAgentDefaultUpdate,
  fetchAgentWorkspaceContext,
  type AgentWorkspaceContextDTO,
} from "@/modules/admin-ui/ai-platform-api";
import { WorkspaceButton, VersionBadge, timeAgo } from "@/components/admin/ai-platform/shared";
import { cn } from "@/lib/utils";

export type AgentWorkspaceTab = "overview" | "assistant" | "knowledge" | "tools" | "versions" | "publish";

const TABS: Array<{ id: AgentWorkspaceTab; label: string; href: (orgId: string, agentId: string) => string }> = [
  { id: "overview", label: "Overview", href: (o, a) => `/orgs/${o}/agents/${a}` },
  { id: "assistant", label: "Assistant & AI", href: (o, a) => `/orgs/${o}/agents/${a}/config` },
  { id: "knowledge", label: "Knowledge", href: (o, a) => `/orgs/${o}/agents/${a}/knowledge` },
  { id: "tools", label: "Tools", href: (o, a) => `/orgs/${o}/agents/${a}/tools` },
  { id: "versions", label: "Versions", href: (o, a) => `/orgs/${o}/agents/${a}/versions` },
  { id: "publish", label: "Publish", href: (o, a) => `/orgs/${o}/agents/${a}/publish` },
];

export function useAgentWorkspaceContext(agentId: string) {
  const [context, setContext] = useState<AgentWorkspaceContextDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setContext(await fetchAgentWorkspaceContext(agentId));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { context, loading, error, refetch };
}

export function AgentWorkspaceHeader({
  tab,
  context,
  loading,
}: {
  tab: AgentWorkspaceTab;
  context: AgentWorkspaceContextDTO | null;
  loading: boolean;
}) {
  const { id = "", agentId = "" } = useParams<{ id: string; agentId: string }>();
  const router = useRouter();
  const [defaultUpdate, setDefaultUpdate] = useState<{
    agentDefaultVersion: number | null;
    currentPlatformVersion: number | null;
  } | null>(null);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    if (!context?.defaultAssistantUpdate?.updateAvailable) {
      setDefaultUpdate(null);
      return;
    }
    void checkAgentDefaultUpdate(agentId)
      .then((r) =>
        setDefaultUpdate(
          r.updateAvailable
            ? { agentDefaultVersion: r.agentDefaultVersion, currentPlatformVersion: r.currentPlatformVersion }
            : null,
        ),
      )
      .catch(() => setDefaultUpdate(null));
  }, [agentId, context?.defaultAssistantUpdate?.updateAvailable]);

  const agent = context?.agent;
  const deployment = context?.deployment ?? null;
  const currentVersion = context?.currentVersion;
  const draftEditedSinceVersion =
    context?.draftUpdatedAt != null &&
    currentVersion != null &&
    new Date(context.draftUpdatedAt).getTime() > new Date(currentVersion.createdAt).getTime();

  return (
    <header className="sticky top-0 z-30 -mx-4 mb-6 border-b border-border bg-background/85 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href={`/orgs/${id}/agents`}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Agents
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">
              {loading ? "…" : (agent?.name ?? "Agent")}
            </h1>
            {context && (
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 font-medium">
                  <GitBranch className="h-3 w-3" /> Main
                </span>
                <span>·</span>
                <span className="font-medium text-foreground/80">v{currentVersion?.versionNumber ?? 1}</span>
                {draftEditedSinceVersion && <VersionBadge tone="warning">Draft changes</VersionBadge>}
                <span>·</span>
                {deployment ? (
                  <VersionBadge tone="success">Published v{deployment.versionNumber}</VersionBadge>
                ) : (
                  <VersionBadge tone="muted">Not published</VersionBadge>
                )}
              </span>
            )}
          </div>
          {context?.draftUpdatedAt && (
            <p className="mt-1 text-[11px] text-muted-foreground/60">
              Draft saved {timeAgo(context.draftUpdatedAt)}
              {deployment && currentVersion && deployment.versionNumber !== currentVersion.versionNumber
                ? " · production runs an earlier version"
                : ""}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <WorkspaceButton
            variant="secondary"
            onClick={() => router.push(`/orgs/${id}/agents/${agentId}/versions`)}
          >
            <History className="h-3.5 w-3.5" /> Versions
          </WorkspaceButton>
          <WorkspaceButton
            variant={deployment ? "secondary" : "primary"}
            onClick={() => router.push(`/orgs/${id}/agents/${agentId}/publish`)}
          >
            <Rocket className="h-3.5 w-3.5" />
            {deployment ? "Publish update" : "Publish"}
          </WorkspaceButton>
        </div>
      </div>

      <nav className="mt-4 flex items-center gap-1 overflow-x-auto scrollbar-none" aria-label="Agent workspace">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.href(id, agentId)}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.id
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {/* §22 — New platform default available (explicit review/apply, never silent) */}
      {defaultUpdate && !dismissing && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-primary">New platform default available.</span>{" "}
            Your agent was created from v{defaultUpdate.agentDefaultVersion ?? "?"}. Current platform default is
            v{defaultUpdate.currentPlatformVersion ?? "?"}.
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={`/orgs/${id}/agents/${agentId}/versions`}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/30"
            >
              Review changes
            </Link>
            <button
              type="button"
              onClick={() => setDismissing(true)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              Keep current
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
