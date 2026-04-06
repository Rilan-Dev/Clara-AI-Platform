"use client";
/**
 * /admin/kbs/[kbId]/config — Assistant config editor + snapshot history sidebar
 *
 * Layout:
 *   ┌─────────────────────────────┬──────────────────────┐
 *   │  ConfigEditor (5-tab)        │  SnapshotHistory     │
 *   │  Identity / Behaviour /      │  (last 5 versions,   │
 *   │  Language / Voice / Preview  │   restore / save)    │
 *   └─────────────────────────────┴──────────────────────┘
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useKb, useConfig, useKBAIOverrides, useSnapshots } from "@/modules/admin-ui/hooks";
import { ConfigEditor } from "@/components/admin/ConfigEditor";
import { KBAIOverridesEditor } from "@/components/admin/KBAIOverridesEditor";
import { SnapshotHistory } from "@/components/admin/SnapshotHistory";
import { VoicePreviewButton } from "@/components/admin/VoicePreviewModal";

export default function KbConfigPage() {
  const { kbId = "" } = useParams<{ kbId: string }>();
  const { data: kb, loading: kbLoading } = useKb(kbId);
  const { config, loading: configLoading, save, refetch: refetchConfig } = useConfig(kbId);
  const {
    overrides,
    loading: overridesLoading,
    error: overridesError,
    save: saveOverrides,
  } = useKBAIOverrides(kbId);
  const { snapshots, loading: snapsLoading, saveSnapshot, restore, refetch: refetchSnaps } = useSnapshots(kbId);

  const loading = kbLoading || configLoading;

  /** When a snapshot is restored, reload both the config and snapshot list. */
  async function handleRestore(snapshotId: string) {
    const result = await restore(snapshotId);
    refetchConfig();
    refetchSnaps();
    return result;
  }

  return (
    <div className="p-8">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/orgs" className="hover:text-foreground transition-colors">
          Organisations
        </Link>
        <span>/</span>
        <Link href={`/admin/kbs/${kbId}`} className="hover:text-foreground transition-colors">
          {kbLoading ? "…" : kb?.name}
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Config</span>
      </nav>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Assistant Configuration</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Customise identity, behaviour, language, voice, and preview the live system prompt.
          </p>
        </div>
        {kb && <VoicePreviewButton kbId={kb.id} kbName={kb.name} />}
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6 items-start">
        {/* ── Left: config editor (grows) ──────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {loading && (
            <div className="space-y-4">
              <div className="h-10 rounded-lg bg-muted/40 animate-pulse" />
              <div className="h-40 rounded-xl bg-muted/40 animate-pulse" />
              <div className="h-28 rounded-xl bg-muted/40 animate-pulse" />
              <div className="h-12 rounded-xl bg-muted/40 animate-pulse" />
            </div>
          )}

          {!loading && config && kb && (
            <ConfigEditor
              config={config}
              kbName={kb.name}
              onSave={save}
            />
          )}

          {!loading && !config && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-8 text-center">
              <p className="font-medium text-destructive">
                Assistant config not found for this knowledge base.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                This may happen if the KB was created before the config migration ran. Re-run migrations.
              </p>
            </div>
          )}
        </div>

        {/* ── Right: snapshot history (fixed width) ──────────────────────── */}
        <div className="w-72 shrink-0 sticky top-8">
          {snapsLoading ? (
            <div className="space-y-2">
              <div className="h-10 rounded-lg bg-muted/40 animate-pulse" />
              <div className="h-36 rounded-xl bg-muted/40 animate-pulse" />
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

      <div className="mt-8">
        {overridesLoading ? (
          <div className="space-y-3">
            <div className="h-12 rounded-xl bg-muted/40 animate-pulse" />
            <div className="h-72 rounded-xl bg-muted/40 animate-pulse" />
          </div>
        ) : kb ? (
          <KBAIOverridesEditor
            kbName={kb.name}
            overrides={overrides}
            onSave={saveOverrides}
          />
        ) : null}
        {overridesError && (
          <p className="mt-3 text-sm text-destructive">{overridesError}</p>
        )}
      </div>
    </div>
  );
}
