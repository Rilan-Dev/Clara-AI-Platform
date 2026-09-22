"use client";

import dynamic from "next/dynamic";
import { JSX, useMemo, useState } from "react";
import { useAssistant } from "@/modules/assistant/core";
import { ChatWindow } from "@/modules/assistant/ui/chat";
import { KbSelectorPanel } from "@/components/catalog/KbSelectorPanel";
import OnboardingGate from "../components/onboarding-gate";

export default function WorkspacePage(): JSX.Element {
  const { activeDocument, activeKbId, overviewFor } = useAssistant();
  const [voiceOpen, setVoiceOpen] = useState(false);

  const VoiceChatModal = useMemo(
    () => dynamic(() => import("@/modules/assistant/ui/voice/VoiceChatModal"), { ssr: false }),
    [],
  );

  // Voice modal uses kbId when a KB is selected (preferred), else falls back
  // to the legacy activeDocument.id path.
  const activeVoiceGreeting = activeDocument
    ? overviewFor(activeDocument.id)?.voiceIntro ??
      `You're speaking with Clara about "${activeDocument.title}".\nAsk a question and I'll cite this document.`
    : undefined;

  return (
    <>
      <OnboardingGate />
      <div className="relative flex min-h-[calc(100dvh-64px)] flex-col overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-48 right-[12%] h-80 w-80 rounded-full bg-primary/20 blur-[160px]" />
        <div className="absolute bottom-[-160px] left-[18%] h-96 w-96 rounded-full bg-secondary/15 blur-[180px]" />
      </div>

      <div className="flex w-full flex-1 flex-col gap-3 sm:gap-6 px-3 sm:px-6 py-4 sm:py-6 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] lg:grid lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        {/* Mobile: app-style KB chip rail above the chat (the full panel
            stays below on lg+). */}
        <div className="lg:hidden">
          <KbSelectorPanel variant="chips" />
        </div>
        <ChatWindow onOpenVoice={() => setVoiceOpen(true)} />
        {/* KbSelectorPanel replaces the old CatalogSidebar. It:
            1. Fetches all active KBs from /api/kbs/all
            2. Lets users pick which KB to talk to
            3. Stores the selection in AssistantProvider context (activeKbId)
            4. Both text chat and voice automatically use the selected KB */}
        <div className="hidden lg:block">
          <KbSelectorPanel />
        </div>
      </div>

      {voiceOpen && (
        <VoiceChatModal
          // KB mode: pass kbId — the voice session loads the KB's AssistantConfig
          // Legacy mode: fall back to documentId if no KB selected
          kbId={activeKbId ?? null}
          documentId={!activeKbId ? (activeDocument?.id ?? null) : null}
          overviewContext={activeDocument ? overviewFor(activeDocument.id)?.context : undefined}
          voiceGreeting={activeVoiceGreeting}
          onClose={() => setVoiceOpen(false)}
        />
      )}
      </div>
    </>
  );
}
