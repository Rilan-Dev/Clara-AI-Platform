"use client";
/**
 * src/components/catalog/KbSelectorPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Workspace sidebar panel that lets users browse and select a KB to chat with.
 *
 * Shows: org → project → KB list with doc count + assistant name.
 * Clicking a KB sets it as the active KB in AssistantProvider context so
 * both text chat and voice use that KB's RAG collection and config.
 */

import { useEffect, useState, useCallback } from "react";
import { useAssistant } from "@/modules/assistant/core";

type KbEntry = {
  id: string;
  name: string;
  description: string | null;
  qdrantCollection: string;
  project: { id: string; name: string };
  org:     { id: string; name: string };
  assistant: {
    name: string;
    avatarUrl: string | null;
    welcomeMessage: string;
    primaryColour: string;
    accentColour: string;
  };
  docCount: number;
  readyCount: number;
};

type GroupedKbs = {
  orgId: string;
  orgName: string;
  projects: {
    projectId: string;
    projectName: string;
    kbs: KbEntry[];
  }[];
};

function groupKbs(kbs: KbEntry[]): GroupedKbs[] {
  const orgMap = new Map<string, GroupedKbs>();
  for (const kb of kbs) {
    if (!orgMap.has(kb.org.id)) {
      orgMap.set(kb.org.id, { orgId: kb.org.id, orgName: kb.org.name, projects: [] });
    }
    const org = orgMap.get(kb.org.id)!;
    let proj = org.projects.find((p) => p.projectId === kb.project.id);
    if (!proj) {
      proj = { projectId: kb.project.id, projectName: kb.project.name, kbs: [] };
      org.projects.push(proj);
    }
    proj.kbs.push(kb);
  }
  return Array.from(orgMap.values());
}

export function KbSelectorPanel() {
  const { activeKbId, setActiveKbId, clearMessages } = useAssistant();

  const [kbs, setKbs]         = useState<KbEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [search, setSearch]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/kbs/all");
      const data = await res.json() as { kbs?: KbEntry[]; error?: string };
      if (data.error) throw new Error(data.error);
      setKbs(data.kbs ?? []);
      // Auto-select first KB with ready docs if nothing selected
      if (!activeKbId && data.kbs && data.kbs.length > 0) {
        const first = data.kbs.find((k) => k.readyCount > 0) ?? data.kbs[0];
        if (first) setActiveKbId(first.id);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [activeKbId, setActiveKbId]);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = search.trim()
    ? kbs.filter((k) =>
        k.name.toLowerCase().includes(search.toLowerCase()) ||
        k.org.name.toLowerCase().includes(search.toLowerCase()) ||
        k.project.name.toLowerCase().includes(search.toLowerCase())
      )
    : kbs;

  const grouped = groupKbs(filtered);
  const activeKb = kbs.find((k) => k.id === activeKbId);

  return (
    <aside className="flex flex-col gap-4">

      {/* Active KB header */}
      {activeKb && (
        <div
          className="rounded-2xl p-4 text-white"
          style={{ background: activeKb.assistant.primaryColour }}
        >
          <div className="flex items-center gap-3 mb-1">
            {activeKb.assistant.avatarUrl ? (
              <img
                src={activeKb.assistant.avatarUrl}
                alt=""
                className="w-8 h-8 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                style={{ background: activeKb.assistant.accentColour, color: activeKb.assistant.primaryColour }}
              >
                {activeKb.assistant.name.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{activeKb.assistant.name}</div>
              <div className="text-xs opacity-75 truncate">{activeKb.name}</div>
            </div>
          </div>
          <p className="text-xs opacity-80 leading-relaxed mt-2 line-clamp-2">
            {activeKb.assistant.welcomeMessage}
          </p>
          <div className="flex items-center gap-3 mt-3 text-xs opacity-70">
            <span>📄 {activeKb.readyCount} docs ready</span>
            <span>·</span>
            <span>{activeKb.project.name}</span>
          </div>
        </div>
      )}

      {/* KB list panel */}
      <div className="rounded-2xl border border-border/60 bg-card/60 overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Knowledge Bases</h3>
            <button
              onClick={() => void load()}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="Refresh"
            >
              ↻
            </button>
          </div>

          {/* Search */}
          {kbs.length > 4 && (
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 mb-2"
            />
          )}
        </div>

        <div className="px-2 pb-3 max-h-[420px] overflow-y-auto space-y-3">
          {loading ? (
            <div className="space-y-2 px-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-xl bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="px-2 py-4 text-xs text-destructive text-center">{error}</div>
          ) : grouped.length === 0 ? (
            <div className="px-2 py-6 text-center">
              <p className="text-xs text-muted-foreground">No knowledge bases found.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create one in the <span className="font-medium">Admin → KBs</span> panel.
              </p>
            </div>
          ) : (
            grouped.map((org) => (
              <div key={org.orgId}>
                {/* Org label — only show if multiple orgs */}
                {grouped.length > 1 && (
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    {org.orgName}
                  </div>
                )}
                {org.projects.map((proj) => (
                  <div key={proj.projectId}>
                    {/* Project label — only show if multiple projects in org */}
                    {org.projects.length > 1 && (
                      <div className="px-2 py-0.5 text-[10px] text-muted-foreground/50 italic">
                        {proj.projectName}
                      </div>
                    )}
                    <div className="space-y-1">
                      {proj.kbs.map((kb) => {
                        const isActive = activeKbId === kb.id;
                        const hasReadyDocs = kb.readyCount > 0;
                        return (
                          <button
                            key={kb.id}
                            onClick={() => {
                              if (!isActive) {
                                clearMessages();
                                setActiveKbId(kb.id);
                              }
                            }}
                            disabled={!hasReadyDocs}
                            className={`w-full text-left rounded-xl px-3 py-2.5 transition-all ${
                              isActive
                                ? "bg-primary text-primary-foreground"
                                : hasReadyDocs
                                ? "hover:bg-muted/60 text-foreground"
                                : "opacity-40 cursor-not-allowed text-muted-foreground"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div
                                  className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5"
                                  style={{
                                    background: isActive ? "currentColor" : kb.assistant.primaryColour,
                                    opacity: isActive ? 0.7 : 1,
                                  }}
                                />
                                <div className="min-w-0">
                                  <div className="text-xs font-medium truncate">{kb.name}</div>
                                  <div className={`text-[10px] ${isActive ? "opacity-70" : "text-muted-foreground"}`}>
                                    {kb.assistant.name}
                                  </div>
                                </div>
                              </div>
                              <div className={`text-[10px] shrink-0 mt-0.5 ${isActive ? "opacity-70" : "text-muted-foreground"}`}>
                                {hasReadyDocs ? `${kb.readyCount} docs` : "No docs"}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
