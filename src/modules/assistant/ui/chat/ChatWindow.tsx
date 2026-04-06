"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useAssistant } from "@/modules/assistant/core";

import { MessageInput } from "./MessageInput";
import { MessageList } from "./MessageList";

export function ChatWindow({ onOpenVoice }: { onOpenVoice?: () => void }) {
  const {
    activeDocument,
    activeKbId,
    isStreaming,
    messages,
    sendPrompt,
    suggestedPrompts,
  } = useAssistant();
  const [activeSourcesMessageId, setActiveSourcesMessageId] = useState<
    string | null
  >(null);

  // Active when a KB is selected (KB mode) OR a legacy document is selected
  const hasActiveContext = !!activeKbId || !!activeDocument;

  // In KB mode the voice button is enabled as long as a KB is selected
  const canOpenVoice = !!onOpenVoice && hasActiveContext;

  return (
    <Card className="flex h-full flex-col border border-[color:var(--color-border)] bg-[color:var(--color-card)]/70">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 border-b border-[color:var(--color-border)]">
        <div>
          <CardTitle className="text-lg font-semibold text-foreground">
            Conversation Workspace
          </CardTitle>
          <CardDescription className="text-xs uppercase tracking-[0.35em] text-muted-foreground/80">
            Streaming responses with inline citations
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost_primary"
            size="sm"
            onClick={onOpenVoice}
            disabled={!canOpenVoice}
          >
            Voice mode
          </Button>
          {isStreaming && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Generating
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <MessageList
          messages={messages}
          activeSourcesMessageId={activeSourcesMessageId}
          setActiveSourcesMessageId={setActiveSourcesMessageId}
          emptyState={
            !hasActiveContext ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <svg className="w-7 h-7 text-primary/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-foreground">Select a knowledge base</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Choose a knowledge base from the sidebar to start chatting. Your assistant will answer questions using its documents.
                </p>
              </div>
            ) : undefined
          }
        />
        <MessageInput
          onSend={sendPrompt}
          disabled={!hasActiveContext || isStreaming}
          suggestions={suggestedPrompts}
          placeholder={
            activeKbId
              ? "Ask a question about this knowledge base…"
              : activeDocument
              ? `Ask about "${activeDocument.title}"…`
              : "Select a knowledge base to start chatting…"
          }
        />
      </CardContent>
    </Card>
  );
}
