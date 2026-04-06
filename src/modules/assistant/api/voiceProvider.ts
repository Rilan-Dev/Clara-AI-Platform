import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { getPlatformAIDefaults, resolveAIConfig } from "@/modules/ai-core/resolve";

export async function postVoiceProvider(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const kbId = typeof body.kbId === "string" ? body.kbId.trim() : null;

    if (!kbId) {
      const defaults = getPlatformAIDefaults();
      return NextResponse.json({
        provider: defaults.provider,
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

    const resolved = await resolveAIConfig({ kbId, surface: "chat" });
    return NextResponse.json({
      provider: resolved.provider,
      flags: {
        voiceEnabled: resolved.flags.voiceEnabled,
        realtimeEnabled: resolved.flags.realtimeEnabled,
      },
    });
  } catch (error) {
    console.error("[voice-provider] post:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
