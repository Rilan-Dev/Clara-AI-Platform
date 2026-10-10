#!/usr/bin/env python3
"""Fix TS narrowing on closure-assigned `usage` vars (chat.ts + embed chat)."""
import sys

def patch(path, subs):
    with open(path, "rb") as f:
        raw = f.read().decode("utf-8")
    for eol in ("\r\n", "\n"):
        variants = [(old.replace("\n", eol), new.replace("\n", eol), label) for old, new, label in subs]
        if all(old_e in raw for old_e, _, _ in variants):
            for old_e, new_e, label in variants:
                if raw.count(old_e) != 1:
                    print(f"FAIL: {path}: {label} not unique", file=sys.stderr)
                    sys.exit(1)
                raw = raw.replace(old_e, new_e)
                print(f"ok: {path}: {label}")
            with open(path, "wb") as f:
                f.write(raw.encode("utf-8"))
            return
    print(f"FAIL: {path}: patterns not found with either ending", file=sys.stderr)
    sys.exit(1)

# chat.ts: swap `let usage` + closure writes for a ref object so TS flow
# analysis sees the type instead of narrowing to null/never.
patch("/home/z/my-project/Clara-AI-Platform/src/modules/assistant/api/chat.ts", [
    (
        """        // WS-1.1: provider-reported token usage for the usage-event spine.
        let usage: { promptTokens: number; completionTokens: number } | null = null;
        try {
          const completionStream = provider.chatStream(chatMessages, {
            temperature: resolved.temperature ?? config.temperature,
            maxTokens: resolved.maxTokens ?? config.maxTokens,
            onUsage: (u) => { usage = u; },
          });""",
        """        // WS-1.1: provider-reported token usage for the usage-event spine.
        // (Ref object — TS narrows a closure-written `let` to null at read time.)
        const usageRef: { value: { promptTokens: number; completionTokens: number } | null } = { value: null };
        try {
          const completionStream = provider.chatStream(chatMessages, {
            temperature: resolved.temperature ?? config.temperature,
            maxTokens: resolved.maxTokens ?? config.maxTokens,
            onUsage: (u) => { usageRef.value = u; },
          });""",
        "mode A usageRef",
    ),
    (
        """            metering: {
              model: resolved.chatModel ?? provider.getModelName("chat"),
              provider: resolved.provider,
              promptTokens: usage?.promptTokens ?? 0,
              completionTokens: usage?.completionTokens ?? 0,
            },""",
        """            metering: {
              model: resolved.chatModel ?? provider.getModelName("chat"),
              provider: resolved.provider,
              promptTokens: usageRef.value?.promptTokens ?? 0,
              completionTokens: usageRef.value?.completionTokens ?? 0,
            },""",
        "mode A metering read",
    ),
    (
        """          // WS-1.1: provider-reported token usage for the usage-event spine.
          let usage: { promptTokens: number; completionTokens: number } | null = null;

          try {
            // P1 FIX: use CHAT_MAX_TOKENS (env-configured) instead of 500.
            const completionStream = provider.chatStream(augmentedMessages, {
              temperature: 0,
              maxTokens: CHAT_MAX_TOKENS,
              onUsage: (u) => { usage = u; },
            });""",
        """          // WS-1.1: provider-reported token usage for the usage-event spine.
          const usageRef: { value: { promptTokens: number; completionTokens: number } | null } = { value: null };

          try {
            // P1 FIX: use CHAT_MAX_TOKENS (env-configured) instead of 500.
            const completionStream = provider.chatStream(augmentedMessages, {
              temperature: 0,
              maxTokens: CHAT_MAX_TOKENS,
              onUsage: (u) => { usageRef.value = u; },
            });""",
        "mode B usageRef",
    ),
])

# embed chat route (LF file)
patch("/home/z/my-project/Clara-AI-Platform/src/app/api/embed/chat/route.ts", [
    (
        """    // WS-1.1: provider-reported token usage for the usage-event spine.
    let usage: { promptTokens: number; completionTokens: number } | null = null;
    const completion = provider.chatStream(
      [
        { role: "system", content: systemPrompt },
        ...messages.map((message): ChatMessage => ({
          role: message.role as ChatMessage["role"],
          content: message.content,
        })),
        { role: "system", content: `Knowledge base context:\\n${context}` },
      ],
      { maxTokens, temperature, onUsage: (u) => { usage = u; } },
    );""",
        """    // WS-1.1: provider-reported token usage for the usage-event spine.
    // (Ref object — TS narrows a closure-written `let` to null at read time.)
    const usageRef: { value: { promptTokens: number; completionTokens: number } | null } = { value: null };
    const completion = provider.chatStream(
      [
        { role: "system", content: systemPrompt },
        ...messages.map((message): ChatMessage => ({
          role: message.role as ChatMessage["role"],
          content: message.content,
        })),
        { role: "system", content: `Knowledge base context:\\n${context}` },
      ],
      { maxTokens, temperature, onUsage: (u) => { usageRef.value = u; } },
    );""",
        "embed usageRef",
    ),
    (
        """              metering: {
                model: resolved.chatModel ?? provider.getModelName("chat"),
                provider: resolved.provider,
                promptTokens: usage?.promptTokens ?? 0,
                completionTokens: usage?.completionTokens ?? 0,
              },""",
        """              metering: {
                model: resolved.chatModel ?? provider.getModelName("chat"),
                provider: resolved.provider,
                promptTokens: usageRef.value?.promptTokens ?? 0,
                completionTokens: usageRef.value?.completionTokens ?? 0,
              },""",
        "embed metering read",
    ),
])

print("done")
