"use client";
/**
 * VoicePreviewModal — admin voice preview wired to a kbId-scoped realtime session.
 * The /api/realtime/session endpoint loads assistant config from the KB's DB row
 * when kbId is provided, so voice/language/instructions match saved settings.
 */
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const VoiceChatModal = dynamic(
  () => import("@/modules/assistant/ui/voice/VoiceChatModal"),
  { ssr: false }
);

type Props = { kbId: string; kbName: string; onClose: () => void };

export function VoicePreviewModal({ kbId, kbName, onClose }: Props) {
  return (
    <VoiceChatModal
      kbId={kbId}
      documentId={null}
      voiceGreeting={`Previewing "${kbName}" — ask a test question to verify voice and context.`}
      onClose={onClose}
    />
  );
}

// ── Trigger button ─────────────────────────────────────────────────────────────

export function VoicePreviewButton({ kbId, kbName }: { kbId: string; kbName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
        </svg>
        Preview Voice
      </Button>
      {open && (
        <VoicePreviewModal kbId={kbId} kbName={kbName} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
