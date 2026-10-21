"use client";

/**
 * src/features/admin/screens/agent-workspace/publish-screen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * /orgs/[id]/agents/[agentId]/publish — the Deploy area (§12/§19.9).
 *
 * 2026-09 simplification: EVERYDAY publishing is ONE CLICK from the workspace
 * header and the Overview tab (draft changes are versioned + published
 * automatically, then the user is notified). This page now hosts only the
 * advanced deployment controls:
 *   • public / private access for the next publish
 *   • the published-agent explore links (share URLs)
 *   • deployment history + rollback
 *
 * Concepts kept separate: save draft / save version / publish / public access
 * / embed access (enablePublicEmbed is NOT publishing).
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Info, Rocket } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import {
  fetchAgentDeployments,
  generateAgentExploreLink,
  publishAgentVersion,
  rollbackAgent,
  saveAgentVersion,
  type AgentDeploymentDTO,
  type AgentExploreLinkDTO,
} from "@/modules/admin-ui/ai-platform-api";
import { useAgentWorkspaceContext } from "@/features/admin/screens/agent-workspace/workspace-shell";
import { VersionBadge, WorkspaceButton, timeAgo } from "@/components/admin/ai-platform/shared";
import { useAuth, useKbs } from "@/modules/admin-ui/hooks";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { usePlatformFeatures } from "@/features/admin/use-platform-features";

export default function AgentPublishScreen() {
  const { agentId = "" } = useParams<{ agentId: string }>();
  const { user } = useAuth();
  const isAdmin = user?.isSuperAdmin ?? false;
  const { context, refetch: refetchCtx } = useAgentWorkspaceContext(agentId);

  const [deployments, setDeployments] = useState<AgentDeploymentDTO[] | null>(null);
  const [publicAccess, setPublicAccess] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exploreLink, setExploreLink] = useState<AgentExploreLinkDTO | null>(null);
  const [exploreBusy, setExploreBusy] = useState(false);
  const [exploreError, setExploreError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const deploymentsResult = await fetchAgentDeployments(agentId);
      setDeployments(deploymentsResult.deployments);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handler = () => void load();
    window.addEventListener("agent-workspace:refresh", handler);
    return () => window.removeEventListener("agent-workspace:refresh", handler);
  }, [load]);

  // Default the access toggle to whatever the live deployment uses.
  useEffect(() => {
    const active = deployments?.find((d) => d.status === "active");
    if (active) setPublicAccess(active.publicAccess);
  }, [deployments]);

  const deployment = context?.deployment ?? null;
  const currentVersion = context?.currentVersion ?? null;
  const draftEditedSinceVersion =
    context?.draftUpdatedAt != null &&
    (currentVersion == null ||
      new Date(context.draftUpdatedAt).getTime() > new Date(currentVersion.createdAt).getTime());

  const productionUpToDate =
    !!deployment &&
    !!currentVersion &&
    deployment.versionNumber === currentVersion.versionNumber &&
    !draftEditedSinceVersion;

  // One-click publish (same semantics as the header button): draft edits are
  // versioned automatically, then production is pointed at the result. No
  // version picking, no review screens — a toast reports the outcome.
  const publish = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      let versionId = currentVersion?.id ?? null;
      if (draftEditedSinceVersion) {
        const version = await saveAgentVersion(agentId, null);
        versionId = version.id;
      }
      if (!versionId) {
        toast.error("Nothing to publish yet", {
          description: "The current Main draft is not available. Refresh the workspace and try again.",
        });
        return;
      }
      const result = await publishAgentVersion(agentId, versionId, publicAccess);
      toast.success("Agent published", {
        description: `Production is now running ${result.deployment.branchName} · v${result.deployment.versionNumber}.`,
      });
      await load();
      void refetchCtx();
      window.dispatchEvent(new CustomEvent("agent-workspace:refresh"));
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      toast.error("Publish failed", { description: message });
    } finally {
      setBusy(false);
    }
  }, [busy, currentVersion, draftEditedSinceVersion, agentId, publicAccess, load, refetchCtx]);

  const rollback = useCallback(
    async (version: AgentDeploymentDTO) => {
      setBusy(true);
      setError(null);
      try {
        await rollbackAgent(agentId, version.versionId);
        toast.success("Rolled back", {
          description: `Production rolled back to ${version.branchName} · v${version.versionNumber}.`,
        });
        await load();
        void refetchCtx();
        window.dispatchEvent(new CustomEvent("agent-workspace:refresh"));
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [agentId, load, refetchCtx],
  );

  const activeDeployment = deployments?.find((d) => d.status === "active") ?? null;

  const generateLink = useCallback(async () => {
    setExploreBusy(true);
    setExploreError(null);
    try {
      setExploreLink(await generateAgentExploreLink(agentId));
    } catch (err) {
      setExploreError((err as Error).message);
    } finally {
      setExploreBusy(false);
    }
  }, [agentId]);

  const copyUrl = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // clipboard unavailable — the URL is still selectable text.
    }
  }, []);

  // Hosted public published page (/agents/:id) — same-origin absolute URL so
  // it is copy-paste ready behind reverse proxies and custom domains.
  const [publicPageUrl, setPublicPageUrl] = useState(`/agents/${agentId}`);
  useEffect(() => {
    setPublicPageUrl(`${window.location.origin}/agents/${agentId}`);
  }, [agentId]);

  return (
    <div>
      {error && (
        <p className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}

      {/* Everyday publishing lives in the topbar — this page is advanced only. */}
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Publishing is one click.</span> Use the{" "}
          <span className="font-medium text-primary">Publish update</span> button in the top bar next to your profile
          avatar (or the Overview tab) — draft
          changes are versioned and published automatically. The button&apos;s dropdown menu also carries View pending
          changes, Deploy traffic, share links and Discard changes. This page keeps the advanced controls: access mode, share links and
          rollback.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ── Publish + access ──────────────────────────────────────────── */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Publish</h2>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Publishing points production at ONE exact immutable version — drafts never go live.
          </p>

          {loading || !context ? (
            <div className="mt-4 h-40 animate-pulse rounded-xl bg-muted/60" />
          ) : productionUpToDate ? (
            <div className="mt-4 rounded-xl border border-emerald-600/25 bg-emerald-500/5 px-4 py-4">
              <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                <Rocket className="h-4 w-4" /> Production is up to date
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {deployment?.branchName} · v{deployment?.versionNumber} has been live {timeAgo(deployment?.publishedAt ?? null)}
                {deployment?.publishedByName ? ` (by ${deployment.publishedByName})` : ""}. Edit the assistant to stage new changes.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <p className="rounded-xl border border-amber-600/25 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                {draftEditedSinceVersion ? (
                  <>
                    <span className="font-medium text-foreground">Draft changes are waiting.</span> Publishing saves them as
                    v{(currentVersion?.versionNumber ?? 0) + 1} and puts that version live.
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">v{currentVersion?.versionNumber ?? "—"} is not live yet.</span>{" "}
                    Production {deployment ? `runs v${deployment.versionNumber}` : "has never been published"} — publishing brings
                    it current.
                  </>
                )}
              </p>

              <div className="rounded-xl border border-border/70 p-4">
                <p className="text-xs font-medium text-foreground/90">Access for this publish</p>
                <div className="mt-2 flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="public-access"
                      checked={!publicAccess}
                      onChange={() => setPublicAccess(false)}
                      disabled={isAdmin}
                    />
                    Private
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="public-access"
                      checked={publicAccess}
                      onChange={() => setPublicAccess(true)}
                      disabled={isAdmin}
                    />
                    Public
                  </label>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground/80">
                  Embed access is governed separately by the embed API key — publishing does not change embed keys.
                </p>
              </div>

              {!isAdmin ? (
                <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4">
                  <p className="text-[11px] text-muted-foreground/70">
                    {deployment
                      ? `Production will move from v${deployment.versionNumber} → v${draftEditedSinceVersion ? (currentVersion?.versionNumber ?? 0) + 1 : currentVersion?.versionNumber}`
                      : "First publication of this agent."}
                  </p>
                  <WorkspaceButton variant="primary" onClick={publish} disabled={busy}>
                    <Rocket className={cn("h-3.5 w-3.5", busy && "animate-pulse")} />
                    {busy ? "Publishing…" : deployment ? "Publish update" : "Publish"}
                  </WorkspaceButton>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Platform admins can review but not publish.</p>
              )}
            </div>
          )}
        </section>

        {/* ── Access the published agent (explore link) ─────────────────────── */}
        <aside className="h-fit rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Share the published agent</h2>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Generate a shareable URL to explore the live published agent.
          </p>

          {!activeDeployment ? (
            <p className="mt-3 rounded-xl border border-dashed border-border px-3.5 py-4 text-xs text-muted-foreground/70">
              Publish a version first — the explore link only serves published versions.
            </p>
          ) : activeDeployment.publicAccess ? (
            <div className="mt-3 space-y-3">
              {!exploreLink ? (
                <WorkspaceButton variant="primary" onClick={generateLink} disabled={exploreBusy || isAdmin}>
                  {exploreBusy ? "Generating…" : "Generate explore link"}
                </WorkspaceButton>
              ) : (
                <div className="space-y-2.5">
                  <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">Unified preview</p>
                      <div className="flex items-center gap-1.5">
                        <WorkspaceButton variant="ghost" onClick={() => void copyUrl(exploreLink.previewUrl)}>
                          {copied === exploreLink.previewUrl ? "Copied" : "Copy"}
                        </WorkspaceButton>
                        <a
                          href={exploreLink.previewUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-muted/50"
                        >
                          Open
                        </a>
                      </div>
                    </div>
                    <p className="mt-1 break-words [overflow-wrap:anywhere] font-mono text-[11px] leading-relaxed text-muted-foreground/80">{exploreLink.previewUrl}</p>
                  </div>

                  {/* Public published page — always on while access is public. */}
                  <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-600/80">Public page</p>
                      <div className="flex items-center gap-1.5">
                        <WorkspaceButton variant="ghost" onClick={() => void copyUrl(publicPageUrl)}>
                          {copied === publicPageUrl ? "Copied" : "Copy"}
                        </WorkspaceButton>
                        <a
                          href={publicPageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-muted/50"
                        >
                          Open
                        </a>
                      </div>
                    </div>
                    <p className="mt-1 break-words [overflow-wrap:anywhere] font-mono text-[11px] leading-relaxed text-muted-foreground/80">{publicPageUrl}</p>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground/80">
                      The hosted public experience — chat and realtime voice from the published
                      settings only, with plan quotas and rate limits enforced.
                    </p>
                  </div>

                  <p className="text-[11px] text-muted-foreground/80">
                    Serving knowledge base “{exploreLink.kbName}”. The unified preview contains both Chat and Voice. The raw key is shown once — regenerate to rotate it
                    (the previous explore key is revoked automatically).
                  </p>
                  <WorkspaceButton onClick={generateLink} disabled={exploreBusy || isAdmin}>
                    {exploreBusy ? "Regenerating…" : "Regenerate link"}
                  </WorkspaceButton>
                </div>
              )}
              {exploreError && (
                <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
                  {exploreError}
                </p>
              )}
              {isAdmin && (
                <p className="text-[11px] text-muted-foreground/80">
                  Platform admins can view but not generate links — ask the organisation admin.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="rounded-xl border border-amber-600/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-700">
                The published version is PRIVATE — visitors are blocked until you publish with public access ON.
              </p>
              <p className="text-[11px] text-muted-foreground/80">
                Organisation members can still explore it from the workspace preview.
              </p>
            </div>
          )}
        </aside>

        {/* ── Deployment history + rollback ──────────────────────────────────── */}
        <aside className="h-fit rounded-2xl border border-border bg-card p-5 shadow-sm xl:col-span-2">
          <h2 className="text-sm font-semibold text-foreground">Deployments</h2>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Rollback re-publishes a previous immutable version — nothing is deleted. Full version history lives in{" "}
            {context?.agent.orgId ? (
              <a href={`/orgs/${context.agent.orgId}/agents/${agentId}/versions`} className="font-medium text-primary hover:text-primary/80">
                Versions &amp; branches
              </a>
            ) : (
              <span className="font-medium text-muted-foreground">Versions &amp; branches</span>
            )}
            .
          </p>
          {loading ? (
            <div className="mt-4 space-y-2">
              {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/60" />)}
            </div>
          ) : (
            <ul className="mt-4 grid gap-2 md:grid-cols-2">
              {(deployments ?? []).map((d) => (
                <li key={d.id} className="rounded-xl border border-border/70 px-3.5 py-3 text-xs">
                  <p className="flex items-center gap-2 font-medium text-foreground/90">
                    {d.branchName} · v{d.versionNumber}
                    {d.status === "active" && <VersionBadge tone="success">Live</VersionBadge>}
                    {d.status === "superseded" && <VersionBadge tone="muted">Superseded</VersionBadge>}
                  </p>
                  <p className="mt-0.5 text-muted-foreground/70">
                    {d.publishedByName ?? "System"} · {timeAgo(d.publishedAt)}
                    {d.publicAccess ? " · public" : " · private"}
                  </p>
                  {d.status !== "active" && !isAdmin && (
                    <WorkspaceButton variant="ghost" className="mt-1.5" onClick={() => void rollback(d)}>
                      Rollback to this version
                    </WorkspaceButton>
                  )}
                </li>
              ))}
              {deployments?.length === 0 && (
                <li className="rounded-xl border border-dashed border-border px-3.5 py-6 text-center text-xs text-muted-foreground/70 md:col-span-2">
                  No deployments yet.
                </li>
              )}
            </ul>
          )}
        </aside>

        {/* ── Channels — where the published agent actually shows up ─────────── */}
        <ChannelLinks orgId={context?.agent.orgId ?? ""} agentId={agentId} />
      </div>
    </div>
  );
}

/** Embed keys, widget design and phone live per knowledge base; link straight
 *  to them from the place people go right after publishing. */
function ChannelLinks({ orgId, agentId }: { orgId: string; agentId: string }) {
  const features = usePlatformFeatures();
  const { kbs, loading } = useKbs(agentId);
  if (!orgId || loading || kbs.length === 0) return null;
  const links = [
    ...(features.embeddableWidget ? [
      { tab: "deploy", label: "Embed & API keys", hint: "Keys, allowed sites and copy-paste snippets" },
      { tab: "design", label: "Widget design", hint: "Colours, launcher, layout and branding" },
    ] : []),
    { tab: "phone", label: "Phone", hint: "Connect a phone number to this assistant" },
  ];
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm xl:col-span-2" aria-labelledby="publish-channels">
      <h2 id="publish-channels" className="text-sm font-semibold text-foreground">{features.embeddableWidget ? "Connect your channels" : "Phone calls"}</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {features.embeddableWidget ? "Each knowledge base has its own embed keys, widget look and phone line." : "Connect a phone number to the published assistant."}
      </p>
      <ul className="mt-4 space-y-3">
        {kbs.map((kb) => (
          <li key={kb.id} className="rounded-xl border border-border/70 p-3.5">
            <p className="text-sm font-medium text-foreground">{kb.name}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {links.map((l) => (
                <Link
                  key={l.tab}
                  href={`/orgs/${orgId}/agents/${agentId}/knowledge/${kb.id}?tab=${l.tab}`}
                  className="rounded-lg border border-border px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <span className="block text-sm font-medium text-foreground">{l.label}</span>
                  <span className="block text-xs text-muted-foreground">{l.hint}</span>
                </Link>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
