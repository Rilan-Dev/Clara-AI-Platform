# Assistant UI Recipes

These examples assume:

```tsx
import { AssistantProvider } from "@/modules/assistant/core";
import {
  ChatWindow,
  MessageList,
  MessageInput,
  FloatingAssistant,
  VoiceChatModal,
} from "@/modules/assistant/ui";
```

Wrap your application once:

```tsx
export function Providers({ children }: { children: React.ReactNode }) {
  return <AssistantProvider>{children}</AssistantProvider>;
}
```

## Minimal Inline Chat

```tsx
"use client";

export function InlineAssistant() {
  const { messages, sendPrompt, isStreaming } = useAssistant();

  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <MessageList messages={messages} />
      <MessageInput
        onSend={sendPrompt}
        disabled={isStreaming}
        suggestions={["Summarise the highlights", "List key exclusions"]}
      />
    </div>
  );
}
```

## Floating Assistant Only

```tsx
export function FloatingOnly() {
  return <FloatingAssistant />;
}
```

This is the drop-in assistant used in `app/layout.tsx`. It renders a glassmorphism chat window when toggled and optionally exposes voice. Pair it with whatever site navigation you like.

## Master–Detail Workspace

```tsx
"use client";

import { useAssistant } from "@/modules/assistant/core";

export default function AssistantWorkspace() {
  const { documents, activeDocument, setActiveDocument } = useAssistant();

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
      <aside className="space-y-2 rounded-3xl border p-4">
        {documents.map((doc) => (
          <button
            key={doc.id}
            onClick={() => setActiveDocument(doc)}
            className={`w-full rounded-2xl border px-3 py-2 text-left ${
              activeDocument?.id === doc.id
                ? "border-sky-300 bg-sky-50"
                : "border-slate-200 hover:border-sky-200"
            }`}
          >
            <p className="text-sm font-semibold">{doc.title}</p>
            <p className="text-xs text-slate-500">
              {doc.originalFilename ?? doc.sourceUrl ?? "Unknown"}
            </p>
          </button>
        ))}
      </aside>
      <section className="flex flex-col rounded-3xl border">
        <ChatWindow />
      </section>
    </div>
  );
}
```

## Custom Voice UI

If you need a bespoke voice interaction, you can use the realtime hooks directly.

```tsx
"use client";

import { useAssistant, useVoiceClient } from "@/modules/assistant/core";

export function CustomVoice() {
  const { activeDocument, overviewFor } = useAssistant();
  const realtime = useVoiceClient({
    documentId: activeDocument?.id,
    documentOverview: activeDocument
      ? overviewFor(activeDocument.id)?.context
      : undefined,
    voiceGreeting: "Hi there! Ask me about the active policy.",
  });

  return (
    <div className="space-y-4 rounded-2xl border p-4">
      <header className="flex items-center justify-between">
        <span>Status: {realtime.status}</span>
        <button onClick={realtime.connect} disabled={realtime.status === "connected"}>
          Connect
        </button>
        <button onClick={realtime.disconnect} disabled={realtime.status !== "connected"}>
          Disconnect
        </button>
      </header>

      <section className="space-y-2">
        {realtime.history.map((turn) => (
          <article key={turn.id} className="rounded-xl border p-3">
            <p className="font-medium">Q: {turn.question}</p>
            <p className="text-sm text-slate-600">A: {turn.answer}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
```

The hook returns controls (`connect`, `disconnect`, `interrupt`) and state (`status`, `isSpeaking`, `history`, `remoteAudioStream`) so you can build completely custom responders.
