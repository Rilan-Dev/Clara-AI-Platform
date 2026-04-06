"use client";

import { FormEvent, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";

export function MessageInput({
  onSend,
  disabled,
  suggestions,
  placeholder,
}: {
  onSend: (text: string) => Promise<void> | void;
  disabled?: boolean;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const suggestionItems = (suggestions ?? []).filter(Boolean).slice(0, 6);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");
    await onSend(trimmed);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event as unknown as FormEvent<HTMLFormElement>);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-[color:var(--color-border)] bg-[color:var(--color-card)]/70 p-4"
    >
      <div className="flex flex-col rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/80 p-3 shadow-sm">
        <div className="flex w-full">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            placeholder={placeholder ?? "Ask a question about this knowledge base…"}
            disabled={disabled}
            className="min-h-[10%] w-full resize-none bg-transparent"
          />
          <div className="flex items-center justify-between m-2">
            <Button
              type="submit"
              disabled={disabled}
              className="w-12 h-12 rounded-full"
            >
              {/* {disabled ? "Sending..." : "Send Message"} */}
              {disabled ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <Send className="w-6 h-6" />
              )}
            </Button>
          </div>
        </div>
        <div className="pt-2 text-xs hiddenp-2 text-muted-foreground sm:flex">
          <span>Enter to send | Shift+Enter for newline</span>
        </div>
      </div>
      {suggestionItems.length > 0 && (
        <div className="h-32 mt-3 overflow-scroll">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.3em] text-[color:var(--color-muted-foreground)]">
            <span>Suggested starters</span>
            <span className="normal-case tracking-normal text-[color:var(--color-muted-foreground)]/70">
              Tap to send
            </span>
          </div>
          <div className="grid w-full gap-2 mt-3 sm:grid-cols-2">
            {suggestionItems.map((prompt) => (
              <Button
                key={prompt}
                type="button"
                onClick={() => onSend(prompt)}
                disabled={disabled}
                variant="secondary"
                size="sm"
                className="justify-start w-full h-auto min-w-0 py-2 text-sm leading-snug text-left break-words whitespace-normal hyphens-auto"
              >
                {prompt}
              </Button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}
