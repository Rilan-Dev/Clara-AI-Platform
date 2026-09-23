"use client";

/**
 * src/components/admin/ai-platform/DefaultAssistantWorkspace.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform Admin → AI Platform → Default Assistant.
 *
 * The Default Assistant is a reusable BASELINE/TEMPLATE (§22): "Used when
 * creating new agents". The workspace separates:
 *   - an explicit mutable DRAFT (edits never touch existing agents);
 *   - immutable VERSIONS with a timeline, semantic diffs and
 *     restore-as-new-version (§7, §23);
 * and reuses the SAME ConfigEditor as the agent "Assistant & AI" page —
 * Identity / Behaviour / Language / Voice / Preview tabs, identical design
 * and functionality — so platform defaults are managed exactly like an
 * agent's assistant configuration.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchDefaultAssistantDiff,
  fetchDefaultAssistantState,
  fetchDefaultAssistantVersions,
  putDefaultAssistantDraft,
  restoreDefaultAssistantVersion,
  saveDefaultAssistantVersion,
  type DefaultAssistantPersona,
  type DefaultAssistantStateDTO,
  type DefaultAssistantVersionDTO,
  type SemanticDiffDTO,
} from "@/modules/admin-ui/ai-platform-api";
import type { AssistantConfig } from "@/modules/admin-ui/api";
import { ConfigEditor } from "@/components/admin/ConfigEditor";
import {
  ContextDrawer,
  DiffViewer,
  VersionBadge,
  WorkspaceButton,
  WorkspaceTabs,
  timeAgo,
} from "./shared";

type View = "draft" | "versions";

// Fallbacks for pre-042 versions/drafts that carry no generation or branding
// fields — identical to the assistant_configs SQL column defaults so agents
// created from the default behave the same either way.
const PERSONA_FALLBACKS = {
  temperature: 0.7,
  maxTokens: 500,
  citeSources: true,
  strictMode: true,
  primaryColour: "#6366f1",
  accentColour: "#a5b4fc",
  launcherColour: null as string | null,
  voiceId: "alloy",
  voiceSpeed: 1.0,
} as const;

function personaFromState(state: DefaultAssistantStateDTO | null): DefaultAssistantPersona | null {
  if (!state) return null;
  return (
    state.draft?.assistant ??
    state.current?.configuration.assistant ?? {
      assistantName: state.defaults.assistantName,
      avatarUrl: state.defaults.avatarUrl,
      systemPrompt: state.defaults.systemPrompt,
      welcomeMessage: state.defaults.welcomeMessage,
      outOfScopeReply: state.defaults.outOfScopeReply,
      rules: state.defaults.rules,
      temperature: state.defaults.temperature,
      maxTokens: state.defaults.maxTokens,
      citeSources: state.defaults.citeSources,
      strictMode: state.defaults.strictMode,
      defaultLanguage: state.defaults.defaultLanguage,
      allowedLanguages: state.defaults.allowedLanguages,
      alwaysRespondIn: state.defaults.alwaysRespondIn,
      voiceId: state.defaults.voiceId,
      voiceSpeed: state.defaults.voiceSpeed,
      primaryColour: state.defaults.primaryColour,
      accentColour: state.defaults.accentColour,
      launcherColour: state.defaults.launcherColour,
    }
  );
}

export function DefaultAssistantWorkspace() {
  const [view, setView] = useState<View>("draft");
  const [state, setState] = useState<DefaultAssistantStateDTO | null>(null);
  const [versions, setVersions] = useState<DefaultAssistantVersionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diff, setDiff] = useState<SemanticDiffDTO | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<DefaultAssistantVersionDTO | null>(null);
  const [saveSummary, setSaveSummary] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stateResult, versionsResult] = await Promise.all([
        fetchDefaultAssistantState(),
        fetchDefaultAssistantVersions(),
      ]);
      setState(stateResult);
      setVersions(versionsResult.versions);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The ConfigEditor consumes the agent AssistantConfig shape — fed from the
  // DRAFT (falls back to the current version / singleton defaults).
  const editorValue = useMemo<AssistantConfig | null>(() => {
    const persona = personaFromState(state);
    if (!persona || !state) return null;
    return {
      id: state.defaults.id,
      agentId: "platform-default",
      assistantName: persona.assistantName,
      avatarUrl: persona.avatarUrl,
      systemPrompt: persona.systemPrompt,
      voiceGreeting: "",
      welcomeMessage: persona.welcomeMessage,
      outOfScopeReply: persona.outOfScopeReply,
      rules: persona.rules,
      temperature: persona.temperature ?? PERSONA_FALLBACKS.temperature,
      maxTokens: persona.maxTokens ?? PERSONA_FALLBACKS.maxTokens,
      citeSources: persona.citeSources ?? PERSONA_FALLBACKS.citeSources,
      strictMode: persona.strictMode ?? PERSONA_FALLBACKS.strictMode,
      defaultLanguage: persona.defaultLanguage,
      allowedLanguages: persona.allowedLanguages,
      alwaysRespondIn: persona.alwaysRespondIn,
      voiceId: persona.voiceId ?? PERSONA_FALLBACKS.voiceId,
      speed: persona.voiceSpeed ?? PERSONA_FALLBACKS.voiceSpeed,
      primaryColour: persona.primaryColour ?? PERSONA_FALLBACKS.primaryColour,
      accentColour: persona.accentColour ?? PERSONA_FALLBACKS.accentColour,
      launcherColour: persona.launcherColour ?? "",
      createdAt: state.draftUpdatedAt ?? state.defaults.updatedAt,
      updatedAt: state.draftUpdatedAt ?? state.defaults.updatedAt,
    };
  }, [state]);

  const saveDraft = useCallback(
    async (data: Partial<AssistantConfig>): Promise<AssistantConfig> => {
      if (!editorValue) throw new Error("Default assistant not loaded");
      const persona = personaFromState(state);
      const base: DefaultAssistantPersona = {
        assistantName: data.assistantName ?? editorValue.assistantName,
        avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl : (persona?.avatarUrl ?? null),
        systemPrompt: data.systemPrompt ?? editorValue.systemPrompt,
        welcomeMessage: data.welcomeMessage ?? editorValue.welcomeMessage,
        outOfScopeReply: data.outOfScopeReply ?? editorValue.outOfScopeReply,
        rules: data.rules ?? editorValue.rules,
        temperature: data.temperature ?? editorValue.temperature,
        maxTokens: data.maxTokens ?? editorValue.maxTokens,
        citeSources: data.citeSources ?? editorValue.citeSources,
        strictMode: data.strictMode ?? editorValue.strictMode,
        defaultLanguage: data.defaultLanguage ?? editorValue.defaultLanguage,
        allowedLanguages: data.allowedLanguages ?? editorValue.allowedLanguages,
        alwaysRespondIn: data.alwaysRespondIn !== undefined ? data.alwaysRespondIn : (persona?.alwaysRespondIn ?? null),
        voiceId: data.voiceId !== undefined ? data.voiceId : (persona?.voiceId ?? null),
        voiceSpeed: data.speed !== undefined ? data.speed : (persona?.voiceSpeed ?? null),
        primaryColour: data.primaryColour ?? editorValue.primaryColour,
        accentColour: data.accentColour ?? editorValue.accentColour,
        launcherColour: data.launcherColour !== undefined ? data.launcherColour || null : (persona?.launcherColour ?? null),
      };
      const next = await putDefaultAssistantDraft(base);
      setState(next);
      return { ...editorValue, ...data };
    },
    [editorValue, state],
  );

  const openDiff = useCallback(async (a: string, b: string) => {
    setDiffOpen(true);
    setDiff(null);
    try {
      setDiff(await fetchDefaultAssistantDiff(a, b));
    } catch (err) {
      setDiff({
        from: { versionNumber: null, label: a },
        to: { versionNumber: null, label: b },
        sections: [],
        changeCount: 0,
        hasChanges: false,
      });
      setError((err as Error).message);
    }
  }, []);

  const saveVersion = useCallback(async () => {
    setBusy(true);
    try {
      await saveDefaultAssistantVersion(saveSummary.trim() || null);
      setSaveSummary("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [saveSummary, load]);

  const confirmRestore = useCallback(async () => {
    if (!restoreTarget) return;
    setBusy(true);
    try {
      await restoreDefaultAssistantVersion(restoreTarget.versionNumber);
      setRestoreTarget(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [restoreTarget, load]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-2xl bg-muted/60" />
        <div className="h-96 animate-pulse rounded-2xl bg-muted/60" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}

      {/* Baseline header (§22) */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Default Assistant</h3>
            {state?.currentVersion != null && <VersionBadge tone="primary">v{state.currentVersion} · Current</VersionBadge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Used when creating new agents — same editor as an agent&apos;s Assistant &amp; AI page. Later changes
            never modify existing agents; they are offered an explicit review/apply update instead.
          </p>
        </div>
        <WorkspaceTabs
          tabs={[
            { id: "draft" as const, label: state?.draft ? "Edit draft" : "Draft" },
            { id: "versions" as const, label: "Versions", count: versions.length },
          ]}
          active={view}
          onChange={setView}
        />
      </div>

      {view === "draft" && (
        <div className="space-y-5">
          {state?.draft && state?.currentVersion != null && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Edits auto-save into the draft
                {state.draftUpdatedAt ? ` · saved ${timeAgo(state.draftUpdatedAt)}` : ""}.
                Saving a version makes them the new current default.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={saveSummary}
                  onChange={(e) => setSaveSummary(e.target.value)}
                  placeholder="Change summary (optional)"
                  className="w-full max-w-52 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40"
                />
                <WorkspaceButton variant="primary" onClick={saveVersion} disabled={busy}>
                  Save version
                </WorkspaceButton>
              </div>
            </div>
          )}
          {editorValue ? (
            <ConfigEditor
              config={editorValue}
              contextName="the platform default assistant"
              onSave={saveDraft}
            />
          ) : (
            <p className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-6 text-center text-sm text-destructive">
              Default assistant could not be loaded.
            </p>
          )}
        </div>
      )}

      {view === "versions" && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground">Version history</h3>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Versions are immutable. Restoring creates a NEW version — history is never deleted.
          </p>
          <ul className="mt-4 space-y-2.5">
            {versions.map((version, index) => {
              const isCurrent = version.versionNumber === state?.currentVersion;
              const previous = versions[index + 1];
              return (
                <li
                  key={version.versionNumber}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-foreground/90">
                      <span className={isCurrent ? "text-primary" : "text-muted-foreground/50"}>●</span>
                      v{version.versionNumber}
                      {isCurrent && <VersionBadge tone="success">Current</VersionBadge>}
                      {version.versionNumber === 1 && <VersionBadge tone="muted">Initial</VersionBadge>}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground/70">
                      {version.changeSummary ?? "—"} · {version.createdByName ?? "System"} · {timeAgo(version.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {previous && (
                      <WorkspaceButton
                        variant="ghost"
                        onClick={() => void openDiff(String(previous.versionNumber), String(version.versionNumber))}
                      >
                        Compare v{previous.versionNumber} → v{version.versionNumber}
                      </WorkspaceButton>
                    )}
                    {state?.draft && (
                      <WorkspaceButton variant="ghost" onClick={() => void openDiff(String(version.versionNumber), "draft")}>
                        vs Draft
                      </WorkspaceButton>
                    )}
                    {!isCurrent && (
                      <WorkspaceButton variant="secondary" onClick={() => setRestoreTarget(version)} disabled={busy}>
                        Restore
                      </WorkspaceButton>
                    )}
                  </div>
                </li>
              );
            })}
            {versions.length === 0 && (
              <li className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground/70">
                No versions yet — save the first version from the draft.
              </li>
            )}
          </ul>
        </div>
      )}

      <ContextDrawer
        open={diffOpen}
        onClose={() => setDiffOpen(false)}
        title="Version diff"
        subtitle="Field-aware comparison — raw JSON is never shown."
      >
        <DiffViewer diff={diff} />
      </ContextDrawer>

      <ContextDrawer
        open={restoreTarget != null}
        onClose={() => setRestoreTarget(null)}
        title={restoreTarget ? `Restore v${restoreTarget.versionNumber}?` : ""}
        subtitle={
          restoreTarget
            ? `This will create v${(versions[0]?.versionNumber ?? 0) + 1} using v${restoreTarget.versionNumber}'s configuration. No history will be deleted.`
            : ""
        }
        footer={
          <div className="flex items-center justify-end gap-2.5">
            <WorkspaceButton onClick={() => setRestoreTarget(null)}>Cancel</WorkspaceButton>
            <WorkspaceButton variant="primary" onClick={confirmRestore} disabled={busy}>
              Restore as new version
            </WorkspaceButton>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          The restored configuration also becomes the working draft. Agents created from the older
          default version are never touched.
        </p>
      </ContextDrawer>
    </div>
  );
}
