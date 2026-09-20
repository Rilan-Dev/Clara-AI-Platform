import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { getPlatformAssistantDefaultVersion, getPlatformAssistantDefaultsState } from "@/modules/ai-core/assistant-defaults-versions-db";
import { diffAgentConfigs } from "@/modules/agent-versioning/core/diff";
import type { AgentVersionConfig } from "@/modules/agent-versioning/core/types";

/** GET ?a=<n|draft>&b=<n|draft> → semantic persona diff. */

function personaToVersionConfig(persona: {
  assistantName: string;
  avatarUrl: string | null;
  systemPrompt: string;
  welcomeMessage: string;
  outOfScopeReply: string;
  rules: string[];
  temperature?: number;
  maxTokens?: number;
  citeSources?: boolean;
  strictMode?: boolean;
  defaultLanguage: string;
  allowedLanguages: string[];
  alwaysRespondIn: string | null;
  voiceId: string | null;
  voiceSpeed: number | null;
  primaryColour?: string;
  accentColour?: string;
  launcherColour?: string | null;
}): AgentVersionConfig {
  return {
    assistant: {
      assistantName: persona.assistantName,
      avatarUrl: persona.avatarUrl,
      systemPrompt: persona.systemPrompt,
      welcomeMessage: persona.welcomeMessage,
      outOfScopeReply: persona.outOfScopeReply,
      rules: persona.rules,
      temperature: persona.temperature ?? 0.7,
      maxTokens: persona.maxTokens ?? 500,
      citeSources: persona.citeSources ?? true,
      strictMode: persona.strictMode ?? true,
      defaultLanguage: persona.defaultLanguage,
      allowedLanguages: persona.allowedLanguages,
      alwaysRespondIn: persona.alwaysRespondIn,
      voiceId: persona.voiceId ?? "alloy",
      speed: persona.voiceSpeed ?? 1,
      primaryColour: persona.primaryColour ?? "#6366f1",
      accentColour: persona.accentColour ?? "#a5b4fc",
      launcherColour: persona.launcherColour ?? null,
    } as AgentVersionConfig["assistant"],
    ai: {
      provider: null,
      chatModel: null,
      embeddingModel: null,
      realtimeModel: null,
      transcriptionModel: null,
      voiceProvider: null,
      realtimeVoiceProvider: null,
    },
    runtime: { enableVoice: true, enableRealtime: true, enablePublicEmbed: true },
  };
}

export async function GET(req: NextRequest) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const a = req.nextUrl.searchParams.get("a") ?? "draft";
    const b = req.nextUrl.searchParams.get("b") ?? "";
    if (!b) return NextResponse.json({ error: "Query param b is required" }, { status: 400 });

    const resolve = async (ref: string) => {
      if (ref === "draft") {
        const state = await getPlatformAssistantDefaultsState();
        return {
          config: personaToVersionConfig(state.draft?.assistant ?? state.current?.configuration.assistant ?? {
            assistantName: state.defaults.assistantName,
            avatarUrl: state.defaults.avatarUrl,
            systemPrompt: state.defaults.systemPrompt,
            welcomeMessage: state.defaults.welcomeMessage,
            outOfScopeReply: state.defaults.outOfScopeReply,
            rules: state.defaults.rules,
            defaultLanguage: state.defaults.defaultLanguage,
            allowedLanguages: state.defaults.allowedLanguages,
            alwaysRespondIn: state.defaults.alwaysRespondIn,
            voiceId: state.defaults.voiceId,
            voiceSpeed: state.defaults.voiceSpeed,
          }),
          versionNumber: null as number | null,
          label: "Draft",
        };
      }
      const n = Number(ref);
      if (!Number.isInteger(n) || n < 1) throw new Error("Invalid version reference");
      const version = await getPlatformAssistantDefaultVersion(n);
      if (!version) throw new Error(`Version ${n} not found`);
      return { config: personaToVersionConfig(version.configuration.assistant), versionNumber: n, label: `v${n}` };
    };

    const before = await resolve(a);
    const after = await resolve(b);
    const diff = diffAgentConfigs(
      before.config,
      after.config,
      { versionNumber: before.versionNumber, label: before.label },
      { versionNumber: after.versionNumber, label: after.label },
    );
    return NextResponse.json(diff);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/platform/assistant-defaults/diff]", err);
    return NextResponse.json({ error: (err as Error).message || "Failed to build diff" }, { status: 500 });
  }
}
