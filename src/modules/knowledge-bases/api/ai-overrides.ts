import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireKbPermission, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import {
  getKbAIOverrides,
  upsertKbAIOverrides,
} from "@/modules/knowledge-bases/core/ai-overrides-db";
import type {
  AIProvider,
  PatchKBAIOverridesInput,
} from "@/modules/ai-core/config-types";
import {
  validateModelField,
  findEmbeddingModel,
  type ModelValidation,
} from "@/modules/ai-core/model-catalog";

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
    // Per-KB AI runtime overrides are platform-owned configuration.
    // Only the platform admin may decide which AI models/providers a KB uses.
    await requireSuperAdmin(auth);
    await requireKbPermission(auth, kbId, "kb:update");

    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) {
      return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const input = buildPatchInput(body);

    // ── WS-0.4: model catalogue validation ────────────────────────────────
    // Reject chat-model ids in the embedding field (and the inverse) before
    // they can silently corrupt retrieval for this KB.
    const effectiveProvider: AIProvider =
      input.provider ?? (await getKbAIOverrides(kbId))?.provider ?? "openai";

    const validations: Array<{ field: string; result: ModelValidation }> = [];
    if (input.chatModel !== undefined) {
      validations.push({
        field: "chatModel",
        result: validateModelField({ field: "chat", model: input.chatModel, provider: effectiveProvider }),
      });
    }
    if (input.embeddingModel !== undefined) {
      validations.push({
        field: "embeddingModel",
        result: validateModelField({ field: "embedding", model: input.embeddingModel, provider: effectiveProvider }),
      });
    }
    const invalid = validations.find((v) => !v.result.ok);
    if (invalid && !invalid.result.ok) {
      return NextResponse.json(
        {
          error: "invalid_model_selection",
          code: invalid.result.code,
          field: invalid.field,
          message: invalid.result.message,
        },
        { status: 400 },
      );
    }

    // ── WS-0.4: embedding-model change guard on embedded KBs ──────────────
    // Changing the embedding model on a KB that already has vectors is only
    // safe when the documents are re-processed (different model ⇒ different
    // vector space, even when dimensions happen to match). Plain saves are
    // refused with remediation copy; "Save & Reprocess Docs" sets the flag.
    if (input.embeddingModel != null && input.embeddingModel !== "") {
      const previous = await getKbAIOverrides(kbId);
      const previousModel = previous?.embeddingModel ?? null;
      const modelChanged = previousModel !== input.embeddingModel;
      const kbHasVectors = await kbHasEmbeddedDocuments(kbId);
      const allowReprocess = body.allowEmbeddingReprocess === true;

      if (modelChanged && kbHasVectors && !allowReprocess) {
        const dim = findEmbeddingModel(input.embeddingModel);
        return NextResponse.json(
          {
            error: "embedding_dimension_change",
            code: "embedding_dimension_change",
            message:
              `Changing the embedding model to “${input.embeddingModel}”` +
              (dim ? ` (${dim.dimension}-dimensional vectors)` : "") +
              " requires re-embedding this knowledge base — existing vectors were " +
              "built with a different model and retrieval will silently degrade. " +
              "Use “Save & Reprocess Docs”, or pass allowEmbeddingReprocess=true if " +
              "you will trigger the re-index workflow separately.",
          },
          { status: 409 },
        );
      }
    }

    const overrides = await upsertKbAIOverrides(kbId, input);
    return NextResponse.json(overrides);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[kb-ai-overrides] patch:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/** True when the KB has at least one document with vectors in Qdrant. */
async function kbHasEmbeddedDocuments(kbId: string): Promise<boolean> {
  try {
    const { query } = await import("@/lib/db");
    const rows = await query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM documents
        WHERE kb_id = $1 AND status IN ('ready','processing','pending')`,
      [kbId],
    );
    return (rows[0]?.count ?? 0) > 0;
  } catch {
    // If the check itself fails, don't block the save — the catalogue
    // validation above is the hard gate.
    return false;
  }
}
