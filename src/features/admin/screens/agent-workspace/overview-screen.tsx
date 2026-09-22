"use client";

/**
 * /orgs/[id]/agents/[agentId] — Overview tab: current state at a glance
 * (production version, draft freshness, knowledge, next action).
 */

import { useParams } from "next/navigation";
import Link from "next/link";
import { useKbs } from "@/modules/admin-ui/hooks";
import { useAgentWorkspaceContext, useAgentsWorkspace } from "@/features/admin/screens/agent-workspace/workspace-shell";
import { VersionBadge, WorkspaceButton, timeAgo } from "@/components/admin/ai-platform/shared";

export default function AgentOverviewScreen() {
  const { agentId = "" } = useParams<{ agentId: string }>();
  const { orgId } = useAgentsWorkspace();
  const { context, refetch } = useAgentWorkspaceContext(agentId);
  const { kbs } = useKbs(agentId);

  const deployment = context?.deployment ?? null;
  const currentVersion = context?.currentVersion ?? null;
  const agentBase = `/orgs/${orgId}/agents/${agentId}`;

  return (
    <div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Production</h2>
          {deployment ? (
            <div className="mt-3 space-y-2 text-sm">
              <p className="flex items-center gap-2">
                <VersionBadge tone="success">Live</VersionBadge>
                <span className="font-medium text-foreground">
                  {deployment.branchName} · v{deployment.versionNumber}
                </span>
              </p>
              <p className="text-xs text-muted-foreground/70">
                Published {timeAgo(deployment.publishedAt)} by {deployment.publishedByName ?? "System"}
                {deployment.publicAccess ? " · public" : " · private"}
              </p>
              <p className="text-xs text-muted-foreground/70">
                Latest Main version is v{currentVersion?.versionNumber ?? "—"}
                {deployment.versionNumber !== currentVersion?.versionNumber
                  ? " — publish to bring production up to date."
                  : " — production is up to date."}
              </p>
            </div>
          ) : (
            <div className="mt-3">
              <p className="text-sm text-muted-foreground">
                This agent is not published yet. Save a version and publish it to put it in production.
              </p>
              <Link href={`${agentBase}/publish`}>
                <WorkspaceButton variant="primary" className="mt-3">Publish</WorkspaceButton>
              </Link>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Knowledge</h2>
          <p className="mt-1 text-xs text-muted-foreground/70">
            {kbs.length} knowledge base{kbs.length === 1 ? "" : "s"} attached to this agent.
          </p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {kbs.slice(0, 5).map((kb) => (
              <li key={kb.id} className="flex items-center justify-between gap-3">
                <Link href={`${agentBase}/knowledge/${kb.id}`} className="truncate text-foreground/90 hover:text-primary">
                  {kb.name}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground/60">{kb.status}</span>
              </li>
            ))}
            {kbs.length === 0 && <li className="text-xs text-muted-foreground/70">No knowledge bases yet.</li>}
          </ul>
          <Link href={`${agentBase}/knowledge`}>
            <WorkspaceButton variant="secondary" className="mt-3">Manage knowledge</WorkspaceButton>
          </Link>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold text-foreground">Draft</h2>
          <p className="mt-1 text-xs text-muted-foreground/70">
            {context?.draftUpdatedAt
              ? `Saved ${timeAgo(context.draftUpdatedAt)} — edit in Assistant & AI, then save a version.`
              : "No draft activity yet."}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Refresh
          </button>
        </section>
      </div>
    </div>
  );
}
