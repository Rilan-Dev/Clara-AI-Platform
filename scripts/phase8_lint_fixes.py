#!/usr/bin/env python3
"""
Phase 8 patcher — fixes the ESLint exhaustive-deps warnings introduced by the
draftMode threading, plus two unused-import warnings.

Robust strategy: for EVERY single-line deps array `}, [ ... ]);` in the voice
hooks, look back to the enclosing useCallback body; if the body references
`options.draftMode` / `opts?.draftMode` and the deps array does not contain
it, append it. This is structural rather than line-number dependent.
"""
import io, re

ROOT = "/home/z/my-project/.worktrees/vc/"
HOOK_FILES = [
    "src/modules/assistant/core/hooks/useVoiceClient.ts",
    "src/modules/assistant/core/hooks/useOpenAIRealtime.ts",
    "src/modules/assistant/core/hooks/useGeminiLive.ts",
    "src/modules/assistant/core/hooks/useElevenLabsVoice.ts",
    "src/modules/assistant/core/hooks/useElevenLabsConvAI.ts",
    "src/modules/assistant/core/hooks/useElevenLabsClaraStream.ts",
    "src/modules/assistant/core/hooks/useElevenLabsSpeechEngine.ts",
    "src/modules/assistant/core/hooks/useSarvamVoice.ts",
]

DEPS_LINE = re.compile(r"^(\s*\}, \[)(.*)(\]\);\s*)$")

def patch_file(path):
    p = ROOT + path
    lines = io.open(p, newline="").read().split("\n")
    changed = 0
    for i, line in enumerate(lines):
        m = DEPS_LINE.match(line)
        if not m:
            continue
        deps_inner = m.group(2)
        # Look back to the nearest useCallback( opener.
        start = None
        for j in range(i - 1, max(i - 400, -1), -1):
            if "useCallback(" in lines[j]:
                start = j
                break
        if start is None:
            continue
        body = "\n".join(lines[start + 1 : i])
        dep = None
        if "opts?.draftMode" in body or "opts.draftMode" in body:
            dep = "opts?.draftMode"
        elif "options.draftMode" in body:
            dep = "options.draftMode"
        if dep is None:
            continue
        if dep in deps_inner:
            continue
        new_inner = deps_inner.rstrip().rstrip(",")
        new_inner = (new_inner + f", {dep}") if new_inner else dep
        lines[i] = m.group(1) + new_inner + m.group(3)
        changed += 1
        print(f"  {path}:{i+1} +{dep}")
    if changed:
        io.open(p, "w", newline="").write("\n".join(lines))
    return changed

total = 0
for f in HOOK_FILES:
    total += patch_file(f)
print(f"\n{total} deps arrays patched")

# ── Unused imports / vars ─────────────────────────────────────────────────────
def patch(path, pairs):
    p = ROOT + path
    s = io.open(p, newline="").read()
    for old, new in pairs:
        n = s.count(old)
        assert n == 1, f"{path}: expected 1 occurrence of {old[:80]!r}, found {n}"
        s = s.replace(old, new)
    io.open(p, "w", newline="").write(s)
    print(f"patched {path}")

patch("src/features/agent-conversation/components/conversation-chat-window.tsx", [(
    'import { cn } from "@/lib/utils";\n', ""
)])
patch("src/features/agent-conversation/lib/chat-stream.ts", [(
    "const { kbId, messages, endpoint, headers, extraBody, signal } = options;",
    "const { kbId, messages, endpoint, extraBody, signal } = options;"
)])
print("\nDone.")
