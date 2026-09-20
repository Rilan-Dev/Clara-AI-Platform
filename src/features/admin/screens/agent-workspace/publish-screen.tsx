"use client";

/**
 * src/features/admin/screens/agent-workspace/publish-screen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * /orgs/[id]/agents/[agentId]/publish — the Deploy area (§12/§19.9).
 *
 * Publish review clearly shows: branch, version, currently deployed version,
 * changes since deployment, validation status, and the explicit publish
 * action. After publishing: "Production is now running Main · vN".
 *
 * Concepts kept separate: save draft / save version / publish / public access
 * / embed access (enablePublicEmbed is NOT publishing).
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  fetchAgentDeployments,
  fetchAgentVersions,
  fetchPublishReview,
  generateAgentExploreLink,
  publishAgentVersion,
  rollbackAgent,
  saveAgentVersion,
  type AgentDeploymentDTO,
  type AgentExploreLinkDTO,
  type AgentVersionDTO,
  type PublishReviewDTO,
} from "@/modules/admin-ui/ai-platform-api";
import { AgentWorkspaceHeader, useAgentWorkspaceContext } from "@/components/admin/agent-workspace/AgentWorkspaceHeader";
import { ContextDrawer, DiffViewer, VersionBadge, WorkspaceButton, timeAgo } from "@/components/admin/ai-platform/shared";
import { useAuth } from "@/modules/admin-ui/hooks";

export default function AgentPublishScreen() {
  const { agentId = "" } = useParams<{ agentId: string }>();
  const { user } = useAuth();
  const isAdmin = user?.isSuperAdmin ?? false;
  const { context, loading: ctxLoading, refetch: refetchCtx } = useAgentWorkspaceContext(agentId);

  const [versions, setVersions] = useState<AgentVersionDTO[]>([]);
  const [deployments, setDeployments] = useState<AgentDeploymentDTO[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [review, setReview] = useState<PublishReviewDTO | null>(null);
  const [publicAccess, setPublicAccess] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishedMessage, setPublishedMessage] = useState<string | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [exploreLink, setExploreLink] = useState<AgentExploreLinkDTO | null>(null);
  const [exploreBusy, setExploreBusy] = useState(false);
  const [exploreError, setExploreError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [versionsResult, deploymentsResult] = await Promise.all([
        fetchAgentVersions(agentId),
        fetchAgentDeployments(agentId),
      ]);
      setVersions(versionsResult.versions);
      setDeployments(deploymentsResult.deployments);
      const current = context?.currentVersion?.id ?? versionsResult.versions[0]?.id ?? null;
      setSelectedVersionId((prev) => prev ?? current);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [agentId, context?.currentVersion?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedVersionId) {
      setReview(null);
      return;
    }
    void fetchPublishReview(agentId, selectedVersionId)
      .then(setReview)
      .catch((err) => setError((err as Error).message));
  }, [agentId, selectedVersionId]);

  const publish = useCallback(async () => {
    if (!selectedVersionId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await publishAgentVersion(agentId, selectedVersionId, publicAccess);
      setPublishedMessage(
        `Production is now running ${result.deployment.branchName} · v${result.deployment.versionNumber}`,
      );
      await load();
      void refetchCtx();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [agentId, selectedVersionId, publicAccess, load, refetchCtx]);

  const rollback = useCallback(
    async (version: AgentVersionDTO) => {
      setBusy(true);
      setError(null);
      try {
        await rollbackAgent(agentId, version.id);
        setPublishedMessage(`Production rolled back to ${version.branchName} · v${version.versionNumber}`);
        await load();
        void refetchCtx();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
    }
    },
    [agentId, load, refetchCtx],
  );

  const saveVersionFromDraft = useCallback(async () => {
    setBusy(true);
    try {
      const version = await saveAgentVersion(agentId, null);
      setSelectedVersionId(version.id);
      await load();
      void refetchCtx();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [agentId, load, refetchCtx]);

  const activeDeployment = deployments.find((d) => d.status === "active") ?? null;

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
      // clipboard unavailable (permissions / insecure context) — the URL is
      // still selectable text, so failing silently is fine.
    }
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <AgentWorkspaceHeader tab="publish" context={context} loading={ctxLoading} />

      {error && (
        <p className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}
      {publishedMessage && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-emerald-600/30 bg-emerald-500/10 px-4 py-3">
          <p className="text-sm font-medium text-emerald-700">{publishedMessage}</p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ── Publish review (§19.9) ─────────────────────────────────────────── */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Publish</h2>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Publishing points production at ONE exact immutable version. Drafts never go live.
          </p>

          {loading ? (
            <div className="mt-4 h-64 animate-pulse rounded-xl bg-muted/60" />
          ) : versions.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-border px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground/70">No versions yet — save one from the draft first.</p>
              {!isAdmin && (
                <WorkspaceButton variant="primary" className="mt-3" onClick={saveVersionFromDraft} disabled={busy}>
                  Save draft as v1
                </WorkspaceButton>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-5">
              <label className="block">
                <span className="text-xs font-medium text-foreground/90">Version to publish</span>
                <select
                  value={selectedVersionId ?? ""}
                  onChange={(e) => setSelectedVersionId(e.target.value || null)}
                  className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.branchName} · v{v.versionNumber}
                      {context?.deployment?.versionId === v.id ? " (currently deployed)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              {review && (
                <>
                  <dl className="grid gap-3 rounded-xl border border-border/70 bg-muted/20 p-4 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground/60">Branch</dt>
                      <dd className="mt-0.5 font-medium text-foreground">{review.version.branchName}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground/60">Version</dt>
                      <dd className="mt-0.5 font-medium text-foreground">v{review.version.versionNumber}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground/60">Currently deployed</dt>
                      <dd className="mt-0.5 font-medium text-foreground">
                        {review.deployment ? `v${review.deployment.versionNumber} · ${timeAgo(review.deployment.publishedAt)}` : "Not published"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground/60">Change summary</dt>
                      <dd className="mt-0.5 font-medium text-foreground">{review.version.changeSummary ?? "—"}</dd>
                    </div>
                  </dl>

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-foreground/90">Changes since last publish</p>
                      <WorkspaceButton variant="ghost" onClick={() => setDiffOpen(true)}>
                        View details
                      </WorkspaceButton>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {(review.changesSinceDeployment?.sections ?? [])
                        .filter((s) => s.changes.length > 0)
                        .map((s) => (
                          <li key={s.key} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="text-emerald-600">✓</span> {s.title}
                            <span className="text-muted-foreground/60">({s.changes.length})</span>
                          </li>
                        ))}
                      {review.changesSinceDeployment &&
                        review.changesSinceDeployment.changeCount === 0 &&
                        review.deployment && (
                          <li className="text-xs text-muted-foreground/70">No changes since the deployed version.</li>
                        )}
                      {!review.deployment && (
                        <li className="text-xs text-muted-foreground/70">First publication of this agent.</li>
                      )}
                    </ul>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-foreground/90">Validation</p>
                    <ul className="mt-2 space-y-1.5">
                      {review.validation.checks.map((check) => (
                        <li key={check.key} className="flex items-center gap-2 text-xs">
                          <span className={check.passed ? "text-emerald-600" : "text-destructive"}>{check.passed ? "✓" : "✗"}</span>
                          <span className="text-foreground/80">{check.label}</span>
                          {check.detail && <span className="text-muted-foreground/60">— {check.detail}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-xl border border-border/70 p-4">
                    <p className="text-xs font-medium text-foreground/90">Public access</p>
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
                    <p className="mt-2 text-[11px] text-muted-foreground/60">
                      Embed access is governed separately by the embed API key — publishing does not change embed keys.
                    </p>
                  </div>

                  {!isAdmin && (
                    <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4">
                      <p className="text-[11px] text-muted-foreground/70">
                        {review.validation.ok
                          ? `Ready — production will run ${review.version.branchName} · v${review.version.versionNumber}`
                          : "Resolve the validation issues before publishing."}
                      </p>
                      <WorkspaceButton
                        variant="primary"
                        onClick={publish}
                        disabled={busy || !review.validation.ok || review.deployment?.versionId === review.version.id}
                      >
                        {review.deployment?.versionId === review.version.id
                          ? `v${review.version.versionNumber} is live`
                          : `Publish v${review.version.versionNumber}`}
                      </WorkspaceButton>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>

        {/* ── Access the published agent (explore link) ─────────────────────── */}
        <aside className="h-fit rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Access the published agent</h2>
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
                  {(
                    [
                      { label: "Chat widget", url: exploreLink.widgetUrl },
                      { label: "Voice page", url: exploreLink.voiceUrl },
                    ] as const
                  ).map(({ label, url }) => (
                    <div key={label} className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">{label}</p>
                        <div className="flex items-center gap-1.5">
                          <WorkspaceButton variant="ghost" onClick={() => void copyUrl(url)}>
                            {copied === url ? "Copied" : "Copy"}
                          </WorkspaceButton>
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-muted/50"
                          >
                            Open
                          </a>
                        </div>
                      </div>
                      <p className="mt-1 break-all font-mono text-[11px] leading-relaxed text-muted-foreground/80">{url}</p>
                    </div>
                  ))}
                  <p className="text-[11px] text-muted-foreground/60">
                    Serving knowledge base “{exploreLink.kbName}”. The raw key is shown once — regenerate to rotate it
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
                <p className="text-[11px] text-muted-foreground/60">
                  Platform admins can view but not generate links — ask the organisation admin.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="rounded-xl border border-amber-600/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-700">
                The published version is PRIVATE — visitors are blocked until you publish with public access ON.
              </p>
              <p className="text-[11px] text-muted-foreground/60">
                Organisation members can still explore it from the workspace preview.
              </p>
            </div>
          )}
        </aside>

        {/* ── Deployment history + rollback ──────────────────────────────────── */}
        <aside className="h-fit rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Deployments</h2>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Rollback re-publishes a previous immutable version — nothing is deleted.
          </p>
          <ul className="mt-4 space-y-2">
            {deployments.map((deployment) => (
              <li key={deployment.id} className="rounded-xl border border-border/70 px-3.5 py-3 text-xs">
                <p className="flex items-center gap-2 font-medium text-foreground/90">
                  {deployment.branchName} · v{deployment.versionNumber}
                  {deployment.status === "active" && <VersionBadge tone="success">Live</VersionBadge>}
                  {deployment.status === "superseded" && <VersionBadge tone="muted">Superseded</VersionBadge>}
                </p>
                <p className="mt-0.5 text-muted-foreground/70">
                  {deployment.publishedByName ?? "System"} · {timeAgo(deployment.publishedAt)}
                  {deployment.publicAccess ? " · public" : " · private"}
                </p>
                {deployment.status !== "active" && !isAdmin && (
                  <WorkspaceButton variant="ghost" className="mt-1.5" onClick={() => void rollback({ id: deployment.versionId } as AgentVersionDTO)}>
                    Rollback to this version
                  </WorkspaceButton>
                )}
              </li>
            ))}
            {deployments.length === 0 && (
              <li className="rounded-xl border border-dashed border-border px-3.5 py-6 text-center text-xs text-muted-foreground/70">
                No deployments yet.
              </li>
            )}
          </ul>
        </aside>
      </div>

      <ContextDrawer open={diffOpen} onClose={() => setDiffOpen(false)} title="Changes since last publish" subtitle="Field-aware comparison.">
        <DiffViewer diff={review?.changesSinceDeployment ?? null} emptyLabel="No changes since the deployed version." />
      </ContextDrawer>
    </div>
  );
}
