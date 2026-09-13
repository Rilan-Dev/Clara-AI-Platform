"use client";

import { useParams } from "next/navigation";
import { Bot, Sparkles } from "lucide-react";
import { useAuth, useConfig, useOrg, useAgent, useSnapshots, useKbs } from "@/modules/admin-ui/hooks";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ConfigEditor } from "@/components/admin/ConfigEditor";
import { SnapshotHistory } from "@/components/admin/SnapshotHistory";
import { VoicePreviewButton } from "@/components/admin/VoicePreviewModal";

/**
 * /orgs/[id]/agents/[agentId]/config — the AGENT-owned "Assistant & AI"
 * configuration (Identity / Behaviour / Language / Voice / Preview) plus
 * widget design and config snapshots. Knowledge bases hold content only —
 * the assistant configuration lives here, on the agent.
 */
export default function AgentConfigPage() {
  const { id = "", agentId = "" } = useParams<{ id: string; agentId: string }>();
  const { user } = useAuth();
  const isAdmin = user?.isSuperAdmin ?? false;
  const { data: org } = useOrg(id);
  const { data: agent } = useAgent(agentId);
  const { config, loading: configLoading, save, refetch: refetchConfig } = useConfig(agentId);
  const { snapshots, loading: snapsLoading, saveSnapshot, restore, refetch: refetchSnaps } = useSnapshots(agentId);
  // Voice preview runs a realtime session scoped to a KB (the runtime resolves
  // the KB's agent config) — use the agent's first KB.
  const { kbs } = useKbs(agentId);
  const previewKb = kbs[0];

  async function handleRestore(snapshotId: string) {
    const result = await restore(snapshotId);
    refetchConfig();
    refetchSnaps();
    return result;
  }

  const loading = configLoading || !agent;

  if (isAdmin) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
        <AdminPageHeader
          icon={Bot}
          title="Assistant & AI Configuration"
          description="View assistant behavior and runtime configuration for this agent."
          breadcrumbs={[
            { label: "Organisations", href: "/orgs" },
            { label: org?.name ?? "Organisation", href: `/orgs/${id}` },
            { label: agent?.name ?? "Agent", href: `/orgs/${id}/agents/${agentId}` },
            { label: "Assistant & AI" },
          ]}
          chips={[
            agent?.name ?? "Agent settings",
            config?.voiceId ?? "voice preview ready",
          ]}
          actions={previewKb ? <VoicePreviewButton kbId={previewKb.id} kbName={previewKb.name} /> : undefined}
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-8 min-w-0">
            {loading ? (
              <div className="space-y-3">
                <div className="h-12 rounded-2xl bg-white/[0.04] animate-pulse" />
                <div className="h-[32rem] rounded-2xl bg-white/[0.04] animate-pulse" />
              </div>
            ) : config ? (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 sm:p-6">
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
                <p className="font-medium">Assistant config not found for this agent.</p>
                <p className="mt-2 text-sm text-rose-100/75">
                  This agent was created without an assistant config row. Re-run migrations, then refresh this page and try again.
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
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 sm:p-6">
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
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
      <AdminPageHeader
        icon={Bot}
        title="Assistant & AI Configuration"
        description="Tune the assistant for this agent — personality, welcome message, languages and voice. Every knowledge base under this agent uses this configuration. AI models and providers are set by the platform admin."
        breadcrumbs={[
          { label: org?.name ?? "Organisation", href: `/orgs/${id}` },
          { label: agent?.name ?? "Agent", href: `/orgs/${id}/agents/${agentId}` },
          { label: "Assistant & AI" },
        ]}
        chips={[
          agent?.name ?? "Agent settings",
          config?.voiceId ?? "voice preview ready",
        ]}
        actions={previewKb ? <VoicePreviewButton kbId={previewKb.id} kbName={previewKb.name} /> : undefined}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-8 min-w-0">
          {loading ? (
            <div className="space-y-3">
              <div className="h-12 rounded-2xl bg-white/[0.04] animate-pulse" />
              <div className="h-[32rem] rounded-2xl bg-white/[0.04] animate-pulse" />
            </div>
          ) : config ? (
            <ConfigEditor config={config} contextName={agent?.name ?? "this agent"} onSave={save} />
          ) : (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-6 py-8 text-center text-rose-300">
              <p className="font-medium">Assistant config not found for this agent.</p>
              <p className="mt-2 text-sm text-rose-100/75">
                This agent was created without an assistant config row. Re-run migrations, then refresh this page and try again.
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
