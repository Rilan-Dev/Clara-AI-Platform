import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireKbPermission } from "@/modules/auth/core/rbac";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import {
  getKbAIOverrides,
  upsertKbAIOverrides,
} from "@/modules/knowledge-bases/core/ai-overrides-db";
import type {
  AIProvider,
  PatchKBAIOverridesInput,
} from "@/modules/ai-core/config-types";

function parseProvider(value: unknown): AIProvider | null {
  return value === "openai" || value === "gemini" ? value : null;
}

function parseOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function buildPatchInput(body: Record<string, unknown>): PatchKBAIOverridesInput {
  const input: PatchKBAIOverridesInput = {};
  const provider = parseProvider(body.provider);
  if (body.provider === null || provider) input.provider = provider;

  const chatModel = parseOptionalString(body.chatModel);
  if (chatModel !== undefined) input.chatModel = chatModel;

  const embeddingModel = parseOptionalString(body.embeddingModel);
  if (embeddingModel !== undefined) input.embeddingModel = embeddingModel;

  const realtimeModel = parseOptionalString(body.realtimeModel);
  if (realtimeModel !== undefined) input.realtimeModel = realtimeModel;

  const transcriptionModel = parseOptionalString(body.transcriptionModel);
  if (transcriptionModel !== undefined) input.transcriptionModel = transcriptionModel;

  const disableVoice = parseOptionalBoolean(body.disableVoice);
  if (disableVoice !== undefined) input.disableVoice = disableVoice;

  const disablePublicEmbed = parseOptionalBoolean(body.disablePublicEmbed);
  if (disablePublicEmbed !== undefined) input.disablePublicEmbed = disablePublicEmbed;

  return input;
}

export async function getKBAIOverridesHandler(
  req: NextRequest,
  kbId: string,
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "kb:read");

    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) {
      return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
    }

    const overrides = await getKbAIOverrides(kbId);
    return NextResponse.json(overrides ?? null);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function patchKBAIOverridesHandler(
  req: NextRequest,
  kbId: string,
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "kb:update");

    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) {
      return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const overrides = await upsertKbAIOverrides(kbId, buildPatchInput(body));
    return NextResponse.json(overrides);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[kb-ai-overrides] patch:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
