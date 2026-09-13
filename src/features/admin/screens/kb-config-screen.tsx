"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Bot, Sparkles } from "lucide-react";
import { useAuth, useConfig, useKb, useOrg, useProject, useSnapshots } from "@/modules/admin-ui/hooks";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ConfigEditor } from "@/components/admin/ConfigEditor";
import { SnapshotHistory } from "@/components/admin/SnapshotHistory";
import { VoicePreviewButton } from "@/components/admin/VoicePreviewModal";

export default function KbConfigPage() {
  const { kbId = "" } = useParams<{ kbId: string }>();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.isSuperAdmin ?? false;
  const { data: kb, loading: kbLoading } = useKb(kbId);
  const projectId = kb?.projectId ?? searchParams.get("projectId");
  const { data: project } = useProject(projectId);
  const orgId = project?.orgId ?? searchParams.get("orgId");
  const { data: org } = useOrg(orgId);
  const { config, loading: configLoading, save, refetch: refetchConfig } = useConfig(kbId);
  const { snapshots, loading: snapsLoading, saveSnapshot, restore, refetch: refetchSnaps } = useSnapshots(kbId);

  async function handleRestore(snapshotId: string) {
    const result = await restore(snapshotId);
    refetchConfig();
    refetchSnaps();
    return result;
  }

  const loading = kbLoading || configLoading;
  const kbHref = orgId && projectId
    ? `/kbs/${kbId}?orgId=${orgId}&projectId=${projectId}`
    : `/kbs/${kbId}`;

  if (isAdmin) {
    return (
      <div className="p-6 lg:p-8 space-y-8">
        <AdminPageHeader
          icon={Bot}
          title="Assistant & AI Configuration"
          description="View assistant behavior and runtime overrides for this knowledge base."
          breadcrumbs={[
            { label: "Organisations", href: "/orgs" },
            ...(orgId ? [{ label: org?.name ?? "Organisation", href: `/orgs/${orgId}` }] : []),
            ...(orgId && projectId ? [{ label: project?.name ?? "Project", href: `/orgs/${orgId}/projects/${projectId}` }] : []),
            { label: kb?.name ?? "Knowledge Base", href: kbHref },
            { label: "Assistant & AI" },
          ]}
          chips={[
            kb?.name ?? "KB settings",
            config?.voiceId ?? "voice preview ready",
          ]}
          actions={kb ? <VoicePreviewButton kbId={kb.id} kbName={kb.name} /> : undefined}
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-8 min-w-0">
            {loading ? (
              <div className="space-y-3">
                <div className="h-12 rounded-2xl bg-white/[0.04] animate-pulse" />
                <div className="h-[32rem] rounded-2xl bg-white/[0.04] animate-pulse" />
              </div>
            ) : config && kb ? (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 p-3">
                    <Bot className="w-5 h-5 text-indigo-300" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-white">Assistant Configuration</h2>
                    <p className="text-sm text-white/40 mt-1">
                      Platform admins can view assistant behavior but cannot edit it.
                    </p>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
                    <div className="flex flex-col gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-white/35">System Prompt</p>
                        <p className="mt-2 text-sm text-white/75 whitespace-pre-wrap">
                          {config.systemPrompt || "No system prompt configured."}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-white/35">Welcome Message</p>
                        <p className="mt-2 text-sm text-white/75">
                          {config.welcomeMessage || "No welcome message configured."}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-white/35">Voice Greeting</p>
                        <p className="mt-2 text-sm text-white/75">
                          {config.voiceGreeting || "No voice greeting configured."}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-6 py-8 text-center text-rose-300">
                <p className="font-medium">Assistant config not found for this knowledge base.</p>
                <p className="mt-2 text-sm text-rose-100/75">
                  This usually means the KB predates the assistant-config migration.
                </p>
              </div>
            )}
          </div>

          <div className="xl:sticky xl:top-8 h-fit">
            <div className="mb-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 text-sm text-white/50">
              <div className="flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-cyan-300 mt-0.5" />
                <p>
                  Platform admins can view configuration snapshots but cannot manage them.
                </p>
              </div>
            </div>
            {snapsLoading ? (
              <div className="space-y-3">
                <div className="h-12 rounded-2xl bg-white/[0.04] animate-pulse" />
                <div className="h-48 rounded-2xl bg-white/[0.04] animate-pulse" />
              </div>
            ) : (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 p-3">
                    <Sparkles className="w-5 h-5 text-indigo-300" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-white">Configuration Snapshots</h2>
                    <p className="text-sm text-white/40 mt-1">
                      Platform admins can view snapshots but cannot create or restore them.
                    </p>
                  </div>
                </div>

                <div className="mt-6">
                  {snapshots.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
                      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
                        <Sparkles className="w-6 h-6 text-indigo-300" />
                      </div>
                      <p className="font-medium text-white">No snapshots yet</p>
                      <p className="text-sm text-white/40 mt-1">
                        Platform admins can view snapshots but cannot create them.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {snapshots.map((snapshot) => (
                        <div key={snapshot.id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-5 py-4">
                          <p className="font-medium text-white">{snapshot.label}</p>
                          <p className="text-xs text-white/30 mt-1">
                            Created {new Date(snapshot.createdAt).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-8">
      <AdminPageHeader
        icon={Bot}
        title="Assistant & AI Configuration"
        description="Tune assistant behavior for this knowledge base — personality, welcome message, languages and voice. AI models and providers are set by the platform admin."
        breadcrumbs={[
          { label: "Organisations", href: "/orgs" },
          ...(orgId ? [{ label: org?.name ?? "Organisation", href: `/orgs/${orgId}` }] : []),
          ...(orgId && projectId ? [{ label: project?.name ?? "Project", href: `/orgs/${orgId}/projects/${projectId}` }] : []),
          { label: kb?.name ?? "Knowledge Base", href: kbHref },
          { label: "Assistant & AI" },
        ]}
        chips={[
          kb?.name ?? "KB settings",
          config?.voiceId ?? "voice preview ready",
        ]}
        actions={kb ? <VoicePreviewButton kbId={kb.id} kbName={kb.name} /> : undefined}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-8 min-w-0">
          {loading ? (
            <div className="space-y-3">
              <div className="h-12 rounded-2xl bg-white/[0.04] animate-pulse" />
              <div className="h-[32rem] rounded-2xl bg-white/[0.04] animate-pulse" />
            </div>
          ) : config && kb ? (
            <ConfigEditor config={config} kbName={kb.name} onSave={save} />
          ) : (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-6 py-8 text-center text-rose-300">
              <p className="font-medium">Assistant config not found for this knowledge base.</p>
              <p className="mt-2 text-sm text-rose-100/75">
                This usually means the KB predates the assistant-config migration. Re-run migrations, then refresh this page and try again.
              </p>
            </div>
          )}
        </div>

        <div className="xl:sticky xl:top-8 h-fit">
          <div className="mb-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 text-sm text-white/50">
            <div className="flex items-start gap-3">
              <Sparkles className="w-4 h-4 text-cyan-300 mt-0.5" />
              <p>
                AI models and providers are managed centrally by the platform admin. Your assistant uses the platform default configuration for chat, embeddings and voice.
              </p>
            </div>
          </div>
          {snapsLoading ? (
            <div className="space-y-3">
              <div className="h-12 rounded-2xl bg-white/[0.04] animate-pulse" />
              <div className="h-48 rounded-2xl bg-white/[0.04] animate-pulse" />
            </div>
          ) : (
            <SnapshotHistory
              snapshots={snapshots}
              onSave={saveSnapshot}
              onRestore={handleRestore}
              onRefetch={refetchSnaps}
            />
          )}
        </div>
      </div>
    </div>
  );
}
