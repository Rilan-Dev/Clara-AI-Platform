"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MarkdownMessage } from "@/modules/assistant/ui/chat/MarkdownMessage";
import type { AssistantMessageModel } from "@/modules/assistant/core";

import { RoleBadge } from "./RoleBadge";

export function MessageList({
  messages,
  onToggleSources,
  activeSourcesMessageId,
  setActiveSourcesMessageId,
  emptyState,
}: {
  messages: AssistantMessageModel[];
  onToggleSources?: (id: string) => void;
  activeSourcesMessageId?: string | null;
  setActiveSourcesMessageId?: (id: string | null) => void;
  emptyState?: React.ReactNode;
}) {
  const hasMessages = messages.length > 0;

  return (
    <div className="flex-1 px-6 py-6 space-y-4 overflow-y-auto">
      {!hasMessages && (
        emptyState ?? (
          <Card className="border border-[color:var(--color-border)] bg-[color:var(--color-card)]/70 text-sm text-muted-foreground">
            <CardContent className="py-6 space-y-2 text-center">
              <p>Your assistant is ready whenever you are.</p>
              <p>Select a knowledge base from the sidebar, then ask a question.</p>
            </CardContent>
          </Card>
        )
      )}

      {messages.map((message) => {
        const showSources = activeSourcesMessageId === message.id;
        const hasSources = (message.sources?.length ?? 0) > 0;

        return (
          <Card
            key={message.id}
            className="border border-[color:var(--color-border)] bg-[color:var(--color-card)]/80 shadow-sm"
          >
            <CardContent className="space-y-3">
              <div className="flex items-center pt-3">
                <div className="flex justify-start w-full">
                  <RoleBadge role={message.role} />
                </div>
                {message.isStreaming && (
                  <span className="text-xs text-muted-foreground">
                    Streaming...
                  </span>
                )}
              </div>

              <MarkdownMessage
                content={message.content}
                variant={message.role}
              />

              {hasSources && (
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-0 text-sm text-primary hover:text-primary"
                    onClick={() => {
                      if (setActiveSourcesMessageId) {
                        setActiveSourcesMessageId(
                          showSources ? null : message.id
                        );
                      }
                      onToggleSources?.(message.id);
                    }}
                  >
                    {showSources
                      ? "Hide citations"
                      : `Show citations (${message.sources?.length ?? 0})`}
                  </Button>

                  {showSources && (
                    <div className="flex flex-wrap gap-2">
                      {message.sources?.map((source, index) => (
                        <Card
                          key={source.id}
                          className="border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/70 shadow-none"
                        >
                          <CardContent className="p-4 space-y-1">
                            <div className="flex items-start justify-between gap-3">
                              <span className="text-sm font-medium text-foreground">
                                [S{index + 1}] {source.title}
                              </span>
                              {source.url && (
                                <Button
                                  asChild
                                  variant="link"
                                  size="sm"
                                  className="h-auto px-0 text-xs"
                                >
                                  <a
                                    href={source.url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    View
                                  </a>
                                </Button>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {source.snippet}
                            </p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
