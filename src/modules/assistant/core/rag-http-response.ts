/**
 * A failed RAG HTTP request must never be presented as "no matching policy".
 * Every voice transport goes through this response check. Do not expose
 * upstream body contents, error traces, credentials or tenant identifiers.
 */
export async function readGroundedRagResponse(response: Response): Promise<Record<string, any>> {
  if (!response.ok) {
    const code = response.status;
    const message = code === 401 || code === 403
      ? "Knowledge-base access is not authorized for this session."
      : code === 404
        ? "The knowledge retrieval endpoint or document was not found."
        : code === 429
          ? "Knowledge retrieval is temporarily rate limited."
          : code >= 500
            ? "Knowledge retrieval is temporarily unavailable."
            : "Knowledge retrieval could not complete.";
    throw new Error(message + " (HTTP " + code + ")");
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new Error("Knowledge retrieval returned an unreadable response.");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Knowledge retrieval returned an invalid response.");
  }
  if ((payload as { error?: unknown }).error) {
    throw new Error("Knowledge retrieval returned a failure without a successful result.");
  }
  return payload as Record<string, any>;
}
