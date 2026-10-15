import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const originalKey = process.env.CLARA_EMAIL_VECTOR_API_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.CLARA_EMAIL_VECTOR_API_KEY;
  else process.env.CLARA_EMAIL_VECTOR_API_KEY = originalKey;
});

function request(body: string, token?: string) {
  return new NextRequest("http://localhost/api/internal/email-vectors", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body,
  });
}

describe("POST /api/internal/email-vectors auth and input boundary", () => {
  it("fails closed when the server credential is not configured", async () => {
    delete process.env.CLARA_EMAIL_VECTOR_API_KEY;
    const response = await POST(request(JSON.stringify({ action: "search" })));
    expect(response.status).toBe(503);
  });

  it("rejects missing or incorrect bearer credentials", async () => {
    process.env.CLARA_EMAIL_VECTOR_API_KEY = "a".repeat(40);
    const missing = await POST(request(JSON.stringify({ action: "search" })));
    const incorrect = await POST(request(JSON.stringify({ action: "search" }), "b".repeat(40)));
    expect(missing.status).toBe(401);
    expect(incorrect.status).toBe(401);
  });

  it("rejects malformed JSON before any vector operation", async () => {
    process.env.CLARA_EMAIL_VECTOR_API_KEY = "a".repeat(40);
    const response = await POST(request("{invalid", "a".repeat(40)));
    expect(response.status).toBe(400);
  });

  it("rejects searches without a non-empty account allowlist", async () => {
    process.env.CLARA_EMAIL_VECTOR_API_KEY = "a".repeat(40);
    const response = await POST(request(JSON.stringify({
      action: "search",
      orgId: "org-1",
      allowedAccountIds: [],
      query: "find invoice",
    }), "a".repeat(40)));
    expect(response.status).toBe(400);
  });
});
