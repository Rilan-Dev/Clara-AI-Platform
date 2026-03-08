# Clara Assistant Module

Clara’s conversational assistant is packaged under `src/modules/assistant`. It is split into two layers so you can embed the intelligence in any React/Next.js surface without pulling in UI you do not want.

## Package Layout

| Path | Description |
| --- | --- |
| `src/modules/assistant/core` | Headless context, hooks, and models. No UI or styling. |
| `src/modules/assistant/ui` | Ready-to-use React components for chat and voice surfaces. Depends on the core layer. |

> Import from `@/modules/assistant/core` when you only need the data layer, or from `@/modules/assistant/ui` when you want the default interface.

## Core Exports

```ts
import {
  AssistantProvider,
  useAssistant,
  useVoiceClient,
  useAudioVisualizer,
  KnowledgeDocumentModel,
  AssistantMessageModel,
} from "@/modules/assistant/core";
```

- **AssistantProvider** – React context provider that orchestrates document loading, streaming chat completions, and state management.
- **useAssistant** – Hook that exposes documents, messages, stream status, etc.
- **useVoiceClient / useAudioVisualizer** – Hooks used by the voice interface; you can consume them directly if you are building your own UI.
- **Models** – Value objects (e.g. `KnowledgeDocumentModel`) ensure predictable shapes when interacting with external data.

## UI Exports

```ts
import {
  ChatWindow,
  MessageList,
  MessageInput,
  VoiceChatModal,
  FloatingAssistant,
} from "@/modules/assistant/ui";
```

These components assume that an `AssistantProvider` is present somewhere above them in the React tree.

## Quick Start (Headless Integration)

```tsx
// app/providers.tsx
import { AssistantProvider } from "@/modules/assistant/core";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <AssistantProvider>{children}</AssistantProvider>;
}
```

```tsx
// app/my-page/page.tsx
"use client";

import { useAssistant } from "@/modules/assistant/core";

export default function MyAssistantPage() {
  const { messages, sendPrompt } = useAssistant();

  return (
    <div className="space-y-3">
      <button onClick={() => sendPrompt("Summarise this document")}>
        Summarise
      </button>
      <pre>{JSON.stringify(messages, null, 2)}</pre>
    </div>
  );
}
```

## Quick Start (Default UI)

```tsx
// app/layout.tsx
import { AssistantProvider } from "@/modules/assistant/core";
import { FloatingAssistant } from "@/modules/assistant/ui";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AssistantProvider>
          {children}
          <FloatingAssistant />
        </AssistantProvider>
      </body>
    </html>
  );
}
```

```tsx
// app/workspace/page.tsx
"use client";

import { ChatWindow } from "@/modules/assistant/ui";

export default function Workspace() {
  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <ChatWindow />
      {/* Add any sidebars or metadata panels you like */}
    </div>
  );
}
```

## Voice Usage Example

```tsx
"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useAssistant } from "@/modules/assistant/core";
import { ChatWindow } from "@/modules/assistant/ui";

const VoiceChatModal = dynamic(
  () => import("@/modules/assistant/ui/voice/VoiceChatModal"),
  { ssr: false },
);

export default function VoiceEnabledWorkspace() {
  const { activeDocument, overviewFor } = useAssistant();
  const [voiceOpen, setVoiceOpen] = useState(false);

  return (
    <>
      <ChatWindow onOpenVoice={() => setVoiceOpen(true)} />
      {voiceOpen && (
        <VoiceChatModal
          documentId={activeDocument?.id ?? null}
          overviewContext={
            activeDocument ? overviewFor(activeDocument.id)?.context : undefined
          }
          onClose={() => setVoiceOpen(false)}
        />
      )}
    </>
  );
}
```

---

See `docs/assistant/ui-examples.md` for more detailed UI composition patterns.
