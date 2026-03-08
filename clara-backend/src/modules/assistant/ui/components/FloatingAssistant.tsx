"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAssistant } from "@/modules/assistant/core";
import { MessageInput, MessageList } from "@/modules/assistant/ui/chat";

// ── KB entry returned by /api/kbs/all ────────────────────────────────────────
type KbEntry = {
  id: string;
  name: string;
  description: string | null;
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

// ── Small KB selector dropdown rendered inside the floating card header ───────
function KbSelector({
  kbs,
  activeKbId,
  onSelect,
}: {
  kbs: KbEntry[];
  activeKbId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = kbs.find((k) => k.id === activeKbId) ?? null;

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted/70 transition-colors max-w-[160px]"
        title="Choose knowledge base"
      >
        <span
          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: active?.assistant.primaryColour ?? "#6366f1" }}
        />
        <span className="truncate">
          {active ? active.assistant.name : "Choose KB…"}
        </span>
        <svg
          className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-1.5 z-50 w-64 rounded-xl border border-border bg-card shadow-xl overflow-hidden"
          >
            {kbs.length === 0 ? (
              <div className="px-4 py-5 text-center text-xs text-muted-foreground">
                No knowledge bases found.<br />
                Create one in <span className="font-semibold">Admin → KBs</span>.
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto py-1">
                {/* Group by project */}
                {Array.from(
                  kbs.reduce((map, kb) => {
                    const key = `${kb.org.name} / ${kb.project.name}`;
                    if (!map.has(key)) map.set(key, []);
                    map.get(key)!.push(kb);
                    return map;
                  }, new Map<string, KbEntry[]>())
                ).map(([groupLabel, groupKbs]) => (
                  <div key={groupLabel}>
                    {/* Group header */}
                    <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                      {groupLabel}
                    </div>
                    {groupKbs.map((kb) => {
                      const isActive = kb.id === activeKbId;
                      const hasReady = kb.readyCount > 0;
                      return (
                        <button
                          key={kb.id}
                          type="button"
                          disabled={!hasReady}
                          onClick={() => { onSelect(kb.id); setOpen(false); }}
                          className={`w-full text-left px-3 py-2 flex items-start gap-2.5 transition-colors
                            ${isActive ? "bg-primary/10 text-primary" : ""}
                            ${hasReady ? "hover:bg-muted/60 cursor-pointer" : "opacity-40 cursor-not-allowed"}
                          `}
                        >
                          {/* Colour dot */}
                          <span
                            className="inline-block w-2 h-2 rounded-full mt-1 flex-shrink-0"
                            style={{ background: kb.assistant.primaryColour }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold truncate text-foreground">
                              {kb.assistant.name}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {kb.name}
                              {hasReady
                                ? ` · ${kb.readyCount} doc${kb.readyCount !== 1 ? "s" : ""}`
                                : " · No docs ready"}
                            </div>
                          </div>
                          {isActive && (
                            <svg className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main FloatingAssistant ────────────────────────────────────────────────────
export function FloatingAssistant() {
  const {
    messages,
    isStreaming,
    activeDocument,
    activeKbId,
    setActiveKbId,
    clearMessages,
    overviewFor,
    sendPrompt,
    suggestedPrompts,
    setKbSuggestedPrompts,
    language,
  } = useAssistant();

  const [open, setOpen] = useState(false);
  const [activeSourcesMessageId, setActiveSourcesMessageId] = useState<string | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);

  // ── KB list ──────────────────────────────────────────────────────────────
  const [kbs, setKbs] = useState<KbEntry[]>([]);
  const [kbsLoaded, setKbsLoaded] = useState(false);

  const loadKbs = useCallback(async () => {
    try {
      const res  = await fetch("/api/kbs/all");
      const data = await res.json() as { kbs?: KbEntry[] };
      const list = data.kbs ?? [];
      setKbs(list);
      // Auto-select first ready KB if nothing is selected
      if (!activeKbId && list.length > 0) {
        const first = list.find((k) => k.readyCount > 0) ?? list[0];
        if (first) setActiveKbId(first.id);
      }
    } catch {
      /* fail silently — KB selector will just be empty */
    } finally {
      setKbsLoaded(true);
    }
  }, [activeKbId, setActiveKbId]);

  // Load KBs once on mount (and whenever the floating panel opens)
  useEffect(() => {
    void loadKbs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload when the panel opens so the list is fresh
  useEffect(() => {
    if (open && !kbsLoaded) void loadKbs();
  }, [open, kbsLoaded, loadKbs]);

  // ── Active KB metadata ────────────────────────────────────────────────────
  const activeKb = kbs.find((k) => k.id === activeKbId) ?? null;

  // ── Push KB-specific suggested prompts into context when KB changes ───────
  // This replaces any stale document-based suggestions with ones that are
  // relevant to the selected KB's name and assistant name.
  useEffect(() => {
    if (!activeKb) return;
    const kbName = activeKb.name;
    const aiName = activeKb.assistant.name;
    const kbSuggestions = [
      `What are the key topics covered in "${kbName}"?`,
      `Give me a summary of the most important information in "${kbName}".`,
      `What can ${aiName} help me with?`,
      `What should I know about "${kbName}"?`,
      `Walk me through the highlights of "${kbName}".`,
      `What are the most frequently asked questions about "${kbName}"?`,
    ];
    setKbSuggestedPrompts(kbSuggestions);
  }, [activeKb?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handle KB switch ──────────────────────────────────────────────────────
  const handleSelectKb = useCallback(
    (id: string) => {
      if (id !== activeKbId) {
        clearMessages();
        setActiveKbId(id);
      }
    },
    [activeKbId, clearMessages, setActiveKbId]
  );

  // ── Chat enabled when a KB is selected (or a legacy document is active) ──
  const canChat = Boolean(activeKbId) || Boolean(activeDocument);

  // ── Voice modal ───────────────────────────────────────────────────────────
  const VoiceChatModal = useMemo(
    () => dynamic(() => import("@/modules/assistant/ui/voice/VoiceChatModal"), { ssr: false }),
    []
  );

  const voiceGreeting = activeDocument
    ? overviewFor(activeDocument.id)?.voiceIntro ??
      `You are speaking with Clara about "${activeDocument.title}". Ask a question and I will cite this document.`
    : undefined;

  const handleToggle = () => {
    setOpen((prev) => {
      if (prev) setActiveSourcesMessageId(null);
      return !prev;
    });
  };

  // ── Header subtitle ───────────────────────────────────────────────────────
  const subtitle = activeKb
    ? activeKb.name
    : activeDocument
    ? activeDocument.title
    : "Select a knowledge base to start";

  const assistantDisplayName = activeKb
    ? activeKb.assistant.name
    : "Clara Assistant";

  const accentColour = activeKb?.assistant.primaryColour ?? undefined;

  return (
    <>
      {/* ── FAB button ── */}
      <motion.div
        className="fixed z-40 bottom-6 right-6"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 26 }}
      >
        <div className="relative">
          <motion.span
            className="absolute inset-0 rounded-full bg-primary/20"
            animate={{ scale: [1, 1.35, 1], opacity: [0.45, 0, 0.45] }}
            transition={{ duration: 2.6, repeat: Infinity }}
          />
          <Button
            type="button"
            size="icon-lg"
            onClick={handleToggle}
            style={accentColour ? { background: accentColour } : undefined}
            className="relative z-10 text-lg font-semibold transition rounded-full shadow-lg h-14 w-14 bg-gradient-to-br from-primary via-secondary to-primary text-primary-foreground shadow-primary/40 hover:scale-105 focus-visible:ring-4 focus-visible:ring-primary/40"
          >
            {isStreaming ? (
              <motion.span
                className="inline-flex w-2 h-2 rounded-full bg-primary-foreground"
                animate={{ scale: [1, 1.6, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            ) : (
              <span>AI</span>
            )}
          </Button>
        </div>
      </motion.div>

      {/* ── Floating card ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed bottom-24 right-6 z-40 w-[min(92vw,420px)]"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
          >
            <Card className="flex h-[85vh] flex-col border border-[color:var(--color-border)] bg-background shadow-2xl">

              {/* ── Header ── */}
              <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-[color:var(--color-border)] px-4 py-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Avatar — uses KB colour if available */}
                  <div
                    className="flex items-center justify-center w-10 h-10 text-base font-semibold rounded-xl flex-shrink-0 text-primary-foreground"
                    style={
                      accentColour
                        ? { background: accentColour }
                        : { background: "linear-gradient(135deg, var(--primary), var(--secondary))" }
                    }
                  >
                    {assistantDisplayName.charAt(0).toUpperCase()}
                  </div>

                  {/* Name + subtitle */}
                  <div className="flex flex-col min-w-0">
                    <CardTitle className="text-base font-semibold leading-tight truncate">
                      {assistantDisplayName}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground truncate">
                      {subtitle}
                    </p>
                  </div>

                  {/* Streaming indicator */}
                  {isStreaming && (
                    <motion.span
                      className="relative inline-flex w-2 h-2 flex-shrink-0"
                      animate={{ scale: [1, 1.4, 1] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                    >
                      <span className="absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping bg-primary/40" />
                      <span className="relative inline-flex w-2 h-2 rounded-full bg-primary" />
                    </motion.span>
                  )}
                </div>

                {/* ── Controls row ── */}
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  {/* KB selector dropdown */}
                  <KbSelector
                    kbs={kbs}
                    activeKbId={activeKbId}
                    onSelect={handleSelectKb}
                  />

                  {/* Voice button */}
                  <Button
                    type="button"
                    variant={canChat ? "ghost_primary" : "ghost"}
                    size="sm"
                    onClick={() => setVoiceOpen(true)}
                    title={canChat ? "Open voice assistant" : "Select a KB to enable voice"}
                  >
                    Voice
                  </Button>

                  {/* Close */}
                  <Button type="button" variant="ghost" size="sm" onClick={handleToggle}>
                    Close
                  </Button>
                </div>
              </CardHeader>

              {/* ── Body ── */}
              <CardContent className="flex flex-col flex-1 min-h-0 p-0">
                {/* Empty state — no KB selected yet */}
                {!canChat && kbsLoaded && (
                  <div className="flex flex-col items-center justify-center flex-1 gap-3 px-6 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center text-2xl">
                      📚
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        No knowledge base selected
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        Use the <span className="font-medium text-foreground">Choose KB…</span> dropdown above to select a project knowledge base to chat with.
                      </p>
                    </div>
                    {kbs.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No knowledge bases found — create one in{" "}
                        <Link href="/admin/orgs" className="text-primary hover:underline">
                          Admin → Orgs
                        </Link>
                        .
                      </p>
                    )}
                  </div>
                )}

                {/* Chat — shown when KB or document is active */}
                {canChat && (
                  <>
                    <MessageList
                      messages={messages}
                      activeSourcesMessageId={activeSourcesMessageId}
                      setActiveSourcesMessageId={setActiveSourcesMessageId}
                    />
                    <MessageInput
                      onSend={sendPrompt}
                      disabled={isStreaming}
                      suggestions={suggestedPrompts}
                      placeholder={
                        activeKb
                          ? `Ask ${activeKb.assistant.name} a question…`
                          : "Ask a question about this knowledge base…"
                      }
                    />
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Voice modal ── */}
      {voiceOpen && (
        <VoiceChatModal
          kbId={activeKbId ?? null}
          documentId={!activeKbId ? (activeDocument?.id ?? null) : null}
          overviewContext={
            activeDocument ? overviewFor(activeDocument.id)?.context : undefined
          }
          voiceGreeting={voiceGreeting}
          language={language}
          suggestedPrompts={canChat ? suggestedPrompts : undefined}
          onClose={() => setVoiceOpen(false)}
        />
      )}
    </>
  );
}
