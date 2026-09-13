"use client";

import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Button,
} from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Clock, MessageSquarePlus, Trash2 } from "lucide-react";
import { useAssistant } from "@/modules/assistant/core";

import { MessageInput } from "./MessageInput";
import { MessageList } from "./MessageList";

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
}

export function ChatWindow({ onOpenVoice }: { onOpenVoice?: () => void }) {
  const {
    activeDocument,
    activeKbId,
    isStreaming,
    messages,
    sendPrompt,
    suggestedPrompts,
    sessions,
    activeSessionId,
    loadSession,
    newConversation,
    deleteSession,
  } = useAssistant();
  const [activeSourcesMessageId, setActiveSourcesMessageId] = useState<
    string | null
  >(null);

  // Active when a KB is selected (KB mode) OR a legacy document is selected
  const hasActiveContext = !!activeKbId || !!activeDocument;

  // In KB mode the voice button is enabled as long as a KB is selected
  const canOpenVoice = !!onOpenVoice && hasActiveContext;
  const hasHistory = sessions.length > 0;

  async function handleLoadSession(sessionId: string) {
    if (sessionId === activeSessionId || isStreaming) return;
    await loadSession(sessionId);
  }

  return (
    <Card className="flex h-full flex-col border border-[color:var(--color-border)] bg-[color:var(--color-card)]/70">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 border-b border-[color:var(--color-border)]">
        <div className="min-w-0">
          <CardTitle className="text-lg font-semibold text-foreground">
            Conversation Workspace
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground/80">
            {activeKbId
              ? "Streaming responses with inline citations · history is saved"
              : "Streaming responses with inline citations"}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {activeKbId && hasHistory && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="Conversation history">
                  <Clock className="mr-1.5 h-3.5 w-3.5" /> History
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Recent conversations
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {sessions.map((s) => (
                    <DropdownMenuItem
                      key={s.id}
                      onSelect={(e) => {
                        e.preventDefault();
                        void handleLoadSession(s.id);
                      }}
                      className="group flex items-start gap-2 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div
                          className={`truncate text-xs font-medium ${
                            s.id === activeSessionId ? "text-primary" : "text-foreground"
                          }`}
                        >
                          {s.title}
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {formatRelativeTime(s.updatedAt)}
                        </div>
                      </div>
                      <button
                        aria-label={`Delete conversation: ${s.title}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void deleteSession(s.id);
                        }}
                        className="rounded p-1 text-muted-foreground/60 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </DropdownMenuItem>
                  ))}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => newConversation()}>
                  <MessageSquarePlus className="mr-2 h-3.5 w-3.5" />
                  <span className="text-xs">New conversation</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {activeKbId && !hasHistory && (
            <Button
              variant="ghost"
              size="sm"
              onClick={newConversation}
              disabled={isStreaming}
              aria-label="Start a new conversation"
            >
              <MessageSquarePlus className="mr-1.5 h-3.5 w-3.5" /> New chat
            </Button>
          )}

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
            ) : sessions.length === 0 && messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <MessageSquarePlus className="w-7 h-7 text-primary/60" />
                </div>
                <p className="text-sm font-medium text-foreground">Start a new conversation</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Ask anything about this knowledge base. Conversations are saved automatically and restored when you return.
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
