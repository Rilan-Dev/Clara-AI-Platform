"use client";

/**
 * Screen-reader announcer for chat surfaces. Streaming text is not announced
 * token by token (that is unusable); instead the latest assistant reply is
 * read once, when it has finished streaming.
 */

import { useEffect, useRef, useState } from "react";

type AnnouncedMessage = { id?: string; role: string; content: string; isStreaming?: boolean };

export function ChatAnnouncer({ messages, label = "Assistant" }: { messages: AnnouncedMessage[]; label?: string }) {
  const [text, setText] = useState("");
  const lastAnnounced = useRef<string | null>(null);

  const last = [...messages].reverse().find((m) => m.role === "assistant");
  const key = last ? `${last.id ?? messages.lastIndexOf(last)}:${last.content.length}` : null;

  useEffect(() => {
    if (!last || last.isStreaming || !last.content.trim() || key === lastAnnounced.current) return;
    lastAnnounced.current = key;
    setText(`${label}: ${last.content.slice(0, 1200)}`);
  }, [key, last, label]);

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {text}
    </div>
  );
}
