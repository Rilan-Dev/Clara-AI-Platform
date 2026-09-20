import { NextRequest, NextResponse } from "next/server";
import {
  listOrganisationLanguages,
  listOrganisationVoices,
  upsertOrganisationLanguage,
  upsertOrganisationVoice,
} from "@/modules/organisations/core/catalog-db";
import type { AIProvider } from "@/modules/ai-core/config-types";

type Params = { params: Promise<{ orgId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { orgId } = await params;
  try {
    const [languages, voices] = await Promise.all([
      listOrganisationLanguages(orgId),
      listOrganisationVoices(orgId),
    ]);
    return NextResponse.json({ languages, voices });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const { orgId } = await params;
  try {
    const body = await req.json() as Record<string, unknown>;
    if (body.kind === "language") {
      return NextResponse.json(await upsertOrganisationLanguage(orgId, {
        code: String(body.code ?? ""), name: String(body.name ?? ""),
        nativeName: body.nativeName == null ? null : String(body.nativeName),
        enabled: body.enabled !== false,
      }));
    }
    if (body.kind === "voice") {
      const provider = body.provider === "gemini" ? "gemini" : body.provider === "openai" ? "openai" : null;
      if (!provider) return NextResponse.json({ error: "provider must be openai or gemini" }, { status: 400 });
      return NextResponse.json(await upsertOrganisationVoice(orgId, {
        provider: provider as AIProvider,
        voiceId: String(body.voiceId ?? ""), name: String(body.name ?? ""),
        enabled: body.enabled !== false,
        metadata: body.metadata && typeof body.metadata === "object" ? body.metadata as Record<string, unknown> : {},
      }));
    }
    return NextResponse.json({ error: "kind must be language or voice" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
