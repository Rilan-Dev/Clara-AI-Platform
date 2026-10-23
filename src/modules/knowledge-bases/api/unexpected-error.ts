import { NextResponse } from "next/server";

/**
 * Keep database, Qdrant, embedding-provider and upload internals in server
 * logs. Knowledge-base CRUD and document routes are organisation-facing.
 * Known 400/404/403 cases are returned directly by the respective handlers.
 */
export function unexpectedKnowledgeApiError(
  error: unknown,
  operation: "knowledge-base" | "documents",
): NextResponse {
  console.error(`[knowledge-api] ${operation} unexpected failure:`, error);
  return NextResponse.json(
    {
      error: operation === "knowledge-base"
        ? "The knowledge-base request could not be completed. Please try again later or contact support."
        : "The document request could not be completed. Please try again later or contact support.",
    },
    { status: 500, headers: { "Cache-Control": "private, no-store" } },
  );
}
