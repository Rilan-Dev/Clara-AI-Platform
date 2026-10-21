import { describe, expect, it } from "vitest";
import { publicKnowledgeProcessingError as present } from "./public-processing-error";

const quotaResponse =
  'Embedding failed (gemini/gemini-embedding-001 @ generativelanguage.googleapis.com): ' +
  '{"error":{"code":429,"message":"Quota exceeded for metric: embed_content_free_tier_requests; ' +
  'Please retry in 21.205s","status":"RESOURCE_EXHAUSTED","details":[{"retryDelay":"21s"}]}}';

describe("tenant-safe knowledge processing errors", () => {
  it("hides all vendor quota diagnostics and preserves a useful re-index next action", () => {
    const message = present(quotaResponse, "reindex");
    expect(message).toContain("Resume later");
    expect(message).toContain("existing index remains available");
    for (const privateDetail of ["gemini", "generativelanguage", "quota", "429", "21.205", "RESOURCE_EXHAUSTED", "embed_content"]) {
      expect(message?.toLowerCase()).not.toContain(privateDetail.toLowerCase());
    }
  });

  it("explains document processing service limits without exposing provider data", () => {
    const message = present(quotaResponse, "document");
    expect(message).toContain("Retry later");
    expect(message).toContain("temporarily at capacity");
    expect(message).not.toContain("gemini");
    expect(message).not.toContain("429");
    expect(message).not.toContain("quota");
  });

  it("redacts other provider errors including credential failures and URLs", () => {
    const message = present(
      'Embedding failed (vendor/model @ api.example.net): HTTP 401 invalid API key sk-secret-exposed',
      "document",
    );
    expect(message).toContain("temporarily unavailable");
    expect(message).not.toContain("sk-secret-exposed");
    expect(message).not.toContain("api.example.net");
  });

  it("uses a generic message for unknown raw exceptions without echoing them", () => {
    const message = present("Stack: at internalEndpoint (secret-token)", "document");
    expect(message).toContain("Please try Retry");
    expect(message).not.toContain("secret-token");
  });

  it("preserves empty/null non-errors", () => {
    expect(present(null, "document")).toBeNull();
    expect(present("", "reindex")).toBeNull();
  });
});
