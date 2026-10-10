#!/usr/bin/env python3
"""Line-ending-preserving patcher: patterns match with LF or CRLF, and each
replacement inherits the exact ending style of the matched text."""
import sys

PATH = "/home/z/my-project/Clara-AI-Platform/src/modules/assistant/api/chat.ts"

with open(PATH, "rb") as f:
    raw = f.read().decode("utf-8")

def sub(text: str, old: str, new: str, label: str) -> str:
    """Try LF and CRLF variants of `old`; replace with `new` in the same style."""
    for eol in ("\n", "\r\n"):
        old_e = old.replace("\n", eol)
        if old_e in text:
            if text.count(old_e) != 1:
                print(f"FAIL: {label} not unique ({text.count(old_e)}x)", file=sys.stderr)
                sys.exit(1)
            new_e = new.replace("\n", eol)
            text = text.replace(old_e, new_e)
            print(f"ok [{eol!r}]: {label}")
            return text
    print(f"FAIL: {label} not found", file=sys.stderr)
    sys.exit(1)

# ── WS-1.1: Mode A usage capture ────────────────────────────────────────────
raw = sub(raw, """      (async () => {
        let answerBuffer = "";
        let streamError: string | null = null;
        const streamT0 = Date.now();
        try {
          const completionStream = provider.chatStream(chatMessages, {
            temperature: resolved.temperature ?? config.temperature,
            maxTokens: resolved.maxTokens ?? config.maxTokens,
          });""", """      (async () => {
        let answerBuffer = "";
        let streamError: string | null = null;
        const streamT0 = Date.now();
        // WS-1.1: provider-reported token usage for the usage-event spine.
        let usage: { promptTokens: number; completionTokens: number } | null = null;
        try {
          const completionStream = provider.chatStream(chatMessages, {
            temperature: resolved.temperature ?? config.temperature,
            maxTokens: resolved.maxTokens ?? config.maxTokens,
            onUsage: (u) => { usage = u; },
          });""", "mode A usage capture")

raw = sub(raw, """        } finally {
          // Persist the AI-generated answer for the platform audit trail.
          void finalizeQueryEvent(eventId, {
            answerText: answerBuffer,
            status: streamError ? "error" : "ok",
            latencyMs: Date.now() - streamT0,
          });
          write({ type: "done" });
          controller.close();
        }""", """        } finally {
          // Persist the AI-generated answer + metering for the platform
          // audit trail and the usage-event spine.
          void finalizeQueryEvent(eventId, {
            answerText: answerBuffer,
            status: streamError ? "error" : "ok",
            latencyMs: Date.now() - streamT0,
            metering: {
              model: resolved.chatModel ?? provider.getModelName("chat"),
              provider: resolved.provider,
              promptTokens: usage?.promptTokens ?? 0,
              completionTokens: usage?.completionTokens ?? 0,
            },
          });
          write({ type: "done" });
          controller.close();
        }""", "mode A finalize metering")

# ── WS-1.1: Mode B usage capture (legacy document chat) ─────────────────────
raw = sub(raw, """        (async () => {
          let streamedAny = false;
          let bufferedAnswer = "";

          try {
            // P1 FIX: use CHAT_MAX_TOKENS (env-configured) instead of 500.
            const completionStream = provider.chatStream(augmentedMessages, {
              temperature: 0,
              maxTokens: CHAT_MAX_TOKENS,
            });""", """        (async () => {
          let streamedAny = false;
          let bufferedAnswer = "";
          // WS-1.1: provider-reported token usage for the usage-event spine.
          let usage: { promptTokens: number; completionTokens: number } | null = null;

          try {
            // P1 FIX: use CHAT_MAX_TOKENS (env-configured) instead of 500.
            const completionStream = provider.chatStream(augmentedMessages, {
              temperature: 0,
              maxTokens: CHAT_MAX_TOKENS,
              onUsage: (u) => { usage = u; },
            });""", "mode B usage capture")

with open(PATH, "wb") as f:
    f.write(raw.encode("utf-8"))

print("chat.ts patched successfully (endings preserved)")
