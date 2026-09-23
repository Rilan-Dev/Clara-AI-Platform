#!/usr/bin/env python3
"""
Phase 2 patcher — threads `scope: "draft"` (preferDraft) through the server
endpoints the authenticated agent preview uses:

  1. voice-core/api/provider.ts            /api/voice/provider
  2. voice-core/api/sarvam/session.ts      /api/voice/sarvam/session
  3. voice-core/api/sarvam/tts.ts          /api/voice/sarvam/tts
  4. voice-core/api/sarvam/transcribe.ts   /api/voice/sarvam/transcribe (form)
  5. voice-core/api/elevenlabs/session.ts  /api/voice/elevenlabs/session
  6. voice-core/api/elevenlabs/tts.ts      /api/voice/elevenlabs/tts
  7. voice-core/api/elevenlabs/transcribe  /api/voice/elevenlabs/transcribe (form)
  8. voice-core/api/elevenlabs/agent-session.ts (Mode B)
  9. assistant/api/realtime.ts             /api/realtime/session
 10. assistant/api/geminiSession.ts        /api/gemini/session
 11. rag/grounding.ts + assistant/api/rag.ts  /api/rag/search (rag_search tool)

Each patch is assert-exactly-once; any mismatch aborts before writing.
"""
import io, sys

ROOT = "/home/z/my-project/.worktrees/vc/"

def patch(path, pairs):
    p = ROOT + path
    s = io.open(p, newline="").read()
    for old, new in pairs:
        n = s.count(old)
        assert n == 1, f"{path}: expected 1 occurrence of {old[:60]!r}, found {n}"
        s = s.replace(old, new)
    io.open(p, "w", newline="").write(s)
    print(f"patched {path} ({len(pairs)} edit(s))")

DRAFT_DOC = (
    '    // scope:"draft" — the authenticated agent preview resolves against\n'
    '    // the CURRENT Main-branch draft instead of the immutable published\n'
    '    // version (KB overrides apply; the LIVE collection is searched).\n'
)

# 1. /api/voice/provider
patch("src/modules/voice-core/api/provider.ts", [(
    "const resolved = await resolveVoiceConfig({ kbId, surface: \"realtime\" });",
    DRAFT_DOC +
    "    const resolved = await resolveVoiceConfig({ kbId, surface: \"realtime\", preferDraft: body.scope === \"draft\" });"
)])

# 2. /api/voice/sarvam/session
patch("src/modules/voice-core/api/sarvam/session.ts", [(
    "const resolved = await resolveVoiceConfig({ kbId, surface: \"realtime\" });",
    DRAFT_DOC +
    "    const resolved = await resolveVoiceConfig({ kbId, surface: \"realtime\", preferDraft: body.scope === \"draft\" });"
)])

# 3. /api/voice/sarvam/tts
patch("src/modules/voice-core/api/sarvam/tts.ts", [(
    "const resolved = await resolveVoiceConfigCached({ kbId, surface: \"realtime\" });",
    DRAFT_DOC +
    "    const resolved = await resolveVoiceConfigCached({ kbId, surface: \"realtime\", preferDraft: body?.scope === \"draft\" });"
)])

# 4. /api/voice/sarvam/transcribe (multipart form)
patch("src/modules/voice-core/api/sarvam/transcribe.ts", [(
    "const resolved = await resolveVoiceConfigCached({ kbId, surface: \"realtime\" });",
    DRAFT_DOC +
    "    const resolved = await resolveVoiceConfigCached({ kbId, surface: \"realtime\", preferDraft: form.get(\"scope\") === \"draft\" });"
)])

# 5. /api/voice/elevenlabs/session
patch("src/modules/voice-core/api/elevenlabs/session.ts", [(
    "const resolved = await resolveVoiceConfig({ kbId, surface: \"realtime\" });",
    DRAFT_DOC +
    "    const resolved = await resolveVoiceConfig({ kbId, surface: \"realtime\", preferDraft: body.scope === \"draft\" });"
)])

# 6. /api/voice/elevenlabs/tts
patch("src/modules/voice-core/api/elevenlabs/tts.ts", [(
    "const resolved = await resolveVoiceConfigCached({ kbId, surface: \"realtime\" });",
    DRAFT_DOC +
    "    const resolved = await resolveVoiceConfigCached({ kbId, surface: \"realtime\", preferDraft: body?.scope === \"draft\" });"
)])

# 7. /api/voice/elevenlabs/transcribe (multipart form)
patch("src/modules/voice-core/api/elevenlabs/transcribe.ts", [(
    "const resolved = await resolveVoiceConfigCached({ kbId, surface: \"realtime\" });",
    DRAFT_DOC +
    "    const resolved = await resolveVoiceConfigCached({ kbId, surface: \"realtime\", preferDraft: form.get(\"scope\") === \"draft\" });"
)])

# 8. /api/voice/elevenlabs/agent-session (Mode B)
patch("src/modules/voice-core/api/elevenlabs/agent-session.ts", [(
    "const resolved = await resolveVoiceConfig({ kbId, surface: \"realtime\" });",
    DRAFT_DOC +
    "    const resolved = await resolveVoiceConfig({ kbId, surface: \"realtime\", preferDraft: body.scope === \"draft\" });"
)])

# 9. /api/realtime/session (OpenAI realtime)
patch("src/modules/assistant/api/realtime.ts", [(
    "const resolved = await resolveAIConfig({ kbId, surface: \"realtime\" });",
    DRAFT_DOC +
    "      const resolved = await resolveAIConfig({ kbId, surface: \"realtime\", preferDraft: body?.scope === \"draft\" });"
), (
    "const voiceResolved = await resolveVoiceConfig({ kbId, surface: \"realtime\" });",
    "const voiceResolved = await resolveVoiceConfig({ kbId, surface: \"realtime\", preferDraft: body?.scope === \"draft\" });"
)])

# 10. /api/gemini/session
patch("src/modules/assistant/api/geminiSession.ts", [(
    "const resolved = await resolveAIConfig({ kbId, surface: \"realtime\" });",
    DRAFT_DOC +
    "      const resolved = await resolveAIConfig({ kbId, surface: \"realtime\", preferDraft: body?.scope === \"draft\" });"
)])

# 11a. grounding.ts — preferDraft on GroundingRequest + resolution helper
patch("src/modules/rag/grounding.ts", [(
    """async function resolveGroundingAIConfig(kbId: string) {
  const key = `rag-embedding:${kbId}`;
  const cached = groundingResolutionCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = await resolveAIConfig({ kbId, surface: "rag-embedding" });""",
    """async function resolveGroundingAIConfig(kbId: string, preferDraft = false) {
  const key = `rag-embedding:${kbId}|${preferDraft ? "draft" : "live"}`;
  const cached = groundingResolutionCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = await resolveAIConfig({ kbId, surface: "rag-embedding", preferDraft });"""
), (
    """  embeddingOverride?: ProviderConfig;""",
    """  embeddingOverride?: ProviderConfig;
  /**
   * Draft-preview mode (authenticated agent preview): resolve against the
   * CURRENT Main-branch draft and search the LIVE collection instead of the
   * published snapshot. Never set on public/embed surfaces.
   */
  preferDraft?: boolean;"""
)])

# 11b. rag.ts — thread body.scope into groundClaraContext
patch("src/modules/assistant/api/rag.ts", [(
    """        ragMode: body.ragMode,
        topK: body.topK,
        surface: "search",
        admission,
        embeddingOverride: providerOverride,
      });""",
    """        ragMode: body.ragMode,
        topK: body.topK,
        surface: "search",
        admission,
        embeddingOverride: providerOverride,
        preferDraft: body.scope === "draft",
      });"""
)])

print("\nAll Phase 2 endpoint patches applied.")
