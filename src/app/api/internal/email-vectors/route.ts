import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  deleteEmailMessageVectors,
  purgeEmailAccountVectors,
  purgeEmailOrgVectors,
  searchEmailVectors,
  updateEmailVectorMetadata,
  upsertEmailVectors,
  type EmailVectorChunk,
  type EmailVectorMetadata,
} from "@/modules/email-vectors/core/email-vector-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const expected = process.env.CLARA_EMAIL_VECTOR_API_KEY?.trim() ?? "";
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  // Do not accidentally expose an unauthenticated internal API in an
  // environment where the service credential was never provisioned.
  if (expected.length < 32 || supplied.length === 0) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown, max = 512): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!authorized(request)) {
    return errorResponse(
      process.env.CLARA_EMAIL_VECTOR_API_KEY?.trim() ? "Unauthorized" : "Email vector service is not configured",
      process.env.CLARA_EMAIL_VECTOR_API_KEY?.trim() ? 401 : 503,
    );
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 2_000_000) return errorResponse("Request body exceeds 2 MB", 413);
    body = JSON.parse(raw);
  } catch {
    return errorResponse("A valid JSON request body is required", 400);
  }
  if (!isRecord(body) || !nonEmptyString(body.action, 40)) return errorResponse("action is required", 400);

  try {
    switch (body.action) {
      case "upsert": {
        const metadata = body.metadata;
        const chunks = body.chunks;
        if (!isRecord(metadata) ||
            !nonEmptyString(metadata.orgId, 128) ||
            !nonEmptyString(metadata.accountId, 256) ||
            !nonEmptyString(metadata.messageId, 512) ||
            !nonEmptyString(metadata.sourceId, 512) ||
            !(metadata.receivedAt === null || (nonEmptyString(metadata.receivedAt, 80) && Number.isFinite(Date.parse(metadata.receivedAt)))) ||
            !Array.isArray(chunks) || chunks.length > 200) {
          return errorResponse("Invalid metadata or chunks", 400);
        }
        if (metadata.sender !== undefined && !nonEmptyString(metadata.sender, 1024)) return errorResponse("Invalid sender", 400);
        if (metadata.subject !== undefined && !nonEmptyString(metadata.subject, 2048)) return errorResponse("Invalid subject", 400);
        if (metadata.labels !== undefined && (!Array.isArray(metadata.labels) || metadata.labels.length > 100 || metadata.labels.some((v) => !nonEmptyString(v, 256)))) {
          return errorResponse("Invalid labels", 400);
        }

        const normalizedChunks: EmailVectorChunk[] = [];
        const seenIndices = new Set<number>();
        for (const item of chunks) {
          if (!isRecord(item) ||
              !nonEmptyString(item.text, 12_000) ||
              !Number.isInteger(item.chunkIndex) ||
              Number(item.chunkIndex) < 0 ||
              !nonEmptyString(item.sourceId, 512)) {
            return errorResponse("Each chunk requires text, a non-negative integer chunkIndex, and sourceId", 400);
          }
          if (seenIndices.has(Number(item.chunkIndex))) return errorResponse("chunkIndex values must be unique", 400);
          seenIndices.add(Number(item.chunkIndex));
          normalizedChunks.push({ text: item.text, chunkIndex: Number(item.chunkIndex), sourceId: item.sourceId });
        }

        const result = await upsertEmailVectors({
          metadata: metadata as unknown as EmailVectorMetadata,
          chunks: normalizedChunks,
        });
        return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
      }

      case "search": {
        if (!nonEmptyString(body.orgId, 128) ||
            !Array.isArray(body.allowedAccountIds) ||
            body.allowedAccountIds.length < 1 ||
            body.allowedAccountIds.length > 100 ||
            body.allowedAccountIds.some((id) => !nonEmptyString(id, 256)) ||
            new Set(body.allowedAccountIds).size !== body.allowedAccountIds.length ||
            !nonEmptyString(body.query, 2000)) {
          return errorResponse("orgId, query, and a non-empty unique allowedAccountIds list are required", 400);
        }
        const limit = body.limit === undefined ? 8 : Number(body.limit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 20) return errorResponse("limit must be an integer from 1 to 20", 400);
        const results = await searchEmailVectors({
          orgId: body.orgId,
          allowedAccountIds: body.allowedAccountIds as string[],
          query: body.query,
          limit,
        });
        return NextResponse.json({ ok: true, results }, { headers: { "Cache-Control": "no-store" } });
      }

      case "update_metadata": {
        if (!nonEmptyString(body.orgId, 128) ||
            !nonEmptyString(body.accountId, 256) ||
            !nonEmptyString(body.messageId, 512) ||
            !isRecord(body.metadata)) {
          return errorResponse("orgId, accountId, messageId, and metadata are required", 400);
        }
        const metadata: { sender?: string; subject?: string; labels?: string[]; receivedAt?: string; sourceId?: string } = {};
        if (body.metadata.sender !== undefined) {
          if (!nonEmptyString(body.metadata.sender, 1024)) return errorResponse("Invalid sender", 400);
          metadata.sender = body.metadata.sender;
        }
        if (body.metadata.subject !== undefined) {
          if (!nonEmptyString(body.metadata.subject, 2048)) return errorResponse("Invalid subject", 400);
          metadata.subject = body.metadata.subject;
        }
        if (body.metadata.sourceId !== undefined) {
          if (!nonEmptyString(body.metadata.sourceId, 512)) return errorResponse("Invalid sourceId", 400);
          metadata.sourceId = body.metadata.sourceId;
        }
        if (body.metadata.receivedAt !== undefined) {
          if (!nonEmptyString(body.metadata.receivedAt, 80) || !Number.isFinite(Date.parse(body.metadata.receivedAt))) return errorResponse("Invalid receivedAt", 400);
          metadata.receivedAt = body.metadata.receivedAt;
        }
        if (body.metadata.labels !== undefined) {
          if (!Array.isArray(body.metadata.labels) || body.metadata.labels.length > 100 || body.metadata.labels.some((v) => !nonEmptyString(v, 256))) return errorResponse("Invalid labels", 400);
          metadata.labels = body.metadata.labels as string[];
        }
        if (Object.keys(metadata).length === 0) return errorResponse("At least one supported metadata field is required", 400);
        await updateEmailVectorMetadata({
          orgId: body.orgId,
          accountId: body.accountId,
          messageId: body.messageId,
          metadata,
        });
        return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
      }

      case "delete_message": {
        if (!nonEmptyString(body.orgId, 128) || !nonEmptyString(body.accountId, 256) || !nonEmptyString(body.messageId, 512)) {
          return errorResponse("orgId, accountId, and messageId are required", 400);
        }
        await deleteEmailMessageVectors(body.orgId, body.accountId, body.messageId);
        return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
      }

      case "purge_account": {
        if (!nonEmptyString(body.orgId, 128) || !nonEmptyString(body.accountId, 256)) {
          return errorResponse("orgId and accountId are required", 400);
        }
        await purgeEmailAccountVectors(body.orgId, body.accountId);
        return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
      }

      case "purge_org": {
        if (!nonEmptyString(body.orgId, 128)) return errorResponse("orgId is required", 400);
        await purgeEmailOrgVectors(body.orgId);
        return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
      }

      default:
        return errorResponse("Unsupported action", 400);
    }
  } catch (error) {
    // Do not return provider, database, Qdrant, or request data to the caller.
    console.error("[email-vectors] operation failed", {
      action: body.action,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return errorResponse("Email vector operation failed", 502);
  }
}
