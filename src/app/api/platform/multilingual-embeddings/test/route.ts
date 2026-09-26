/**
 * POST /api/platform/multilingual-embeddings/test (platform admin)
 *
 * Checks the configured multilingual embeddings endpoint end to end: latency,
 * vector size, and that it matches a question to a passage in ANOTHER
 * language (the reason the multilingual index exists).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { ensureMigrated, loadRuntimeSettingsOnStartup } from "@/lib/db/migrate";
import { getMultilingualSettings, scoreThresholdFor } from "@/modules/ai-core/multilingual-embeddings";
import { TeiEmbeddingProvider } from "@/modules/ai-core/providers/tei";

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
  return dot; // vectors are L2-normalised by the provider
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    await loadRuntimeSettingsOnStartup();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const settings = getMultilingualSettings();
    if (!settings.baseUrl) {
      return NextResponse.json({ ok: false, error: "Set MULTILINGUAL_EMBEDDINGS_BASE_URL first." }, { status: 400 });
    }
    const provider = new TeiEmbeddingProvider({ provider: "tei", embeddingModel: settings.model });
    const started = Date.now();
    const question = await provider.embedText("What time does the office open?");
    const latencyMs = Date.now() - started;
    const [answerTamil, unrelated] = await provider.embedBatch([
      "எங்கள் அலுவலகம் காலை 9 மணிக்கு திறக்கப்படும்.",
      "The warranty does not cover accidental damage to the screen.",
    ]);
    const matched = cosine(question, answerTamil!);
    const other = cosine(question, unrelated!);
    const threshold = scoreThresholdFor("tei", settings.model, 0.25);
    return NextResponse.json({
      ok: matched > other,
      model: settings.model,
      dimension: question.length,
      latencyMs,
      crossLingual: { matchingPassage: Number(matched.toFixed(3)), unrelatedPassage: Number(other.toFixed(3)), threshold },
      enabled: settings.enabled,
    });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 502 });
  }
}
