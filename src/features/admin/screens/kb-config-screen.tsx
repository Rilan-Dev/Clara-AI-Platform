"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Bot, Sparkles } from "lucide-react";
import { reprocessAllDocuments } from "@/modules/admin-ui/api";
import { useConfig, useKb, useKBAIOverrides, useOrg, useProject, useSnapshots } from "@/modules/admin-ui/hooks";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ConfigEditor } from "@/components/admin/ConfigEditor";
import { KBAIOverridesEditor } from "@/components/admin/KBAIOverridesEditor";
import { SnapshotHistory } from "@/components/admin/SnapshotHistory";
import { VoicePreviewButton } from "@/components/admin/VoicePreviewModal";

export default function KbConfigPage() {
  const { kbId = "" } = useParams<{ kbId: string }>();
  const searchParams = useSearchParams();
  const { data: kb, loading: kbLoading } = useKb(kbId);
  const projectId = kb?.projectId ?? searchParams.get("projectId");
  const { data: project } = useProject(projectId);
  const orgId = project?.orgId ?? searchParams.get("orgId");
  const { data: org } = useOrg(orgId);
  const { config, loading: configLoading, save, refetch: refetchConfig } = useConfig(kbId);
  const { overrides, loading: overridesLoading, error: overridesError, save: saveOverrides } = useKBAIOverrides(kbId);
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

  return (
    <div className="p-6 lg:p-8 max-w-7xl space-y-8">
      <AdminPageHeader
        icon={Bot}
        title="Assistant & AI Configuration"
        description="Tune assistant behavior, preview the system prompt, and update KB-specific runtime overrides with document reprocessing when embedding routes change."
        breadcrumbs={[
          { label: "Organisations", href: "/orgs" },
          ...(orgId ? [{ label: org?.name ?? "Organisation", href: `/orgs/${orgId}` }] : []),
          ...(orgId && projectId ? [{ label: project?.name ?? "Project", href: `/orgs/${orgId}/projects/${projectId}` }] : []),
          { label: kb?.name ?? "Knowledge Base", href: kbHref },
          { label: "Assistant & AI" },
        ]}
        chips={[
          kb?.name ?? "KB settings",
          overrides?.provider ?? "inherited provider",
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

          {overridesLoading ? (
            <div className="space-y-3">
              <div className="h-12 rounded-2xl bg-white/[0.04] animate-pulse" />
              <div className="h-[24rem] rounded-2xl bg-white/[0.04] animate-pulse" />
            </div>
          ) : kb ? (
            <KBAIOverridesEditor
              kbName={kb.name}
              overrides={overrides}
              onSave={saveOverrides}
              onSaveAndReprocess={async (payload) => {
                await saveOverrides(payload);
                return reprocessAllDocuments(kbId);
              }}
            />
          ) : null}
          {overridesError && <p className="text-sm text-rose-400">{overridesError}</p>}
        </div>

        <div className="xl:sticky xl:top-8 h-fit">
          <div className="mb-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 text-sm text-white/50">
            <div className="flex items-start gap-3">
              <Sparkles className="w-4 h-4 text-cyan-300 mt-0.5" />
              <p>
                Save + Reprocess immediately re-queues documents when embedding routing changes, so retrieval stays aligned with the active provider and vector dimension.
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
