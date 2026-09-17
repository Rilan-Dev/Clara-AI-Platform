import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { getPlatformAIDefaults } from "@/modules/ai-core/resolve";
import { resolveVoiceConfig } from "@/modules/ai-core/voice-resolve";

export async function postVoiceProvider(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const kbId = typeof body.kbId === "string" ? body.kbId.trim() : null;

    if (!kbId) {
      const defaults = getPlatformAIDefaults();
      return NextResponse.json({
        provider: defaults.provider,
        voiceProvider: defaults.provider,
        flags: {
          voiceEnabled: true,
          realtimeEnabled: true,
        },
      });
    }

    await ensureMigrated();
    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) {
      return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
    }

    // Full voice-surface resolution (kb → agent → org → env, allow-lists,
    // kill switch, surface flags) — same guards the session endpoints apply.
    const resolved = await resolveVoiceConfig({ kbId, surface: "realtime" });

    return NextResponse.json({
      provider: resolved.brain.provider,
      // Voice-provider axis: 'elevenlabs' routes the browser to the hybrid
      // pipeline; openai/gemini keep their existing realtime paths.
      voiceProvider: resolved.voiceProvider,
      flags: {
        voiceEnabled: resolved.brain.flags.voiceEnabled,
        realtimeEnabled: resolved.brain.flags.realtimeEnabled,
      },
    });
  } catch (error) {
    console.error("[voice-provider] post:", error);
    // Surface resolution failures (disabled voice, not-allowed provider, kill
    // switch) as a 400 the client can render directly — same contract the
    // realtime session endpoints use.
    const message = (error as Error).message ?? "Voice configuration could not be resolved.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
