import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: vi.fn(async () => ({ user: { id: "u1" } })),
  requireKbPermission: vi.fn(async () => ({ orgId: "org-1" })),
  requireAgentPermission: vi.fn(async () => ({ orgId: "org-1" })),
}));
vi.mock("@/modules/embed/core/validate-embed", () => ({
  validateEmbedRequest: vi.fn(async () => ({ ok: true, ctx: { kbId: "kb-embed", orgId: "org-2", allowedOrigins: ["*"] } })),
  buildCorsHeaders: vi.fn(() => ({})),
}));
vi.mock("@/modules/knowledge-bases/core/db", () => ({
  getAssistantConfigByKb: vi.fn(async () => ({ defaultLanguage: "en", allowedLanguages: ["en", "ta"] })),
  listKnowledgeBases: vi.fn(async () => [{ id: "kb-agent", status: "active" }]),
}));
vi.mock("@/modules/ai-core/resolve", () => ({
  resolveAIConfig: vi.fn(async () => ({ provider: "openai" })),
  toProviderConfig: vi.fn(() => ({ provider: "openai" })),
}));
vi.mock("@/lib/rate-limit", () => ({
  hit: vi.fn(() => ({ allowed: true, retryAfterSec: 0 })),
  rateLimitResponse: vi.fn(() => ({ body: { error: "rate" }, status: 429, headers: {} })),
}));
const translateText = vi.fn();
vi.mock("@/modules/rag/cross-lingual", () => ({ translateText: (...a: unknown[]) => translateText(...a) }));

import { postAgentTranslate, postEmbedTranslate, postTranslate } from "./translate";
import { resolveAIConfig } from "@/modules/ai-core/resolve";
import { getAssistantConfigByKb } from "@/modules/knowledge-bases/core/db";

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/translate", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

describe("message translation API", () => {
  beforeEach(() => translateText.mockReset());

  it("translates into an allowed language with the tenant's chat model", async () => {
    translateText.mockResolvedValue("வணக்கம்");
    const res = await postTranslate(req({ kbId: "kb-1", text: "Hello", targetLanguage: "ta" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ translatedText: "வணக்கம்", language: "ta" });
    expect(translateText).toHaveBeenCalledWith("Hello", "ta", { providerConfig: { provider: "openai" } });
  });

  it("rejects a language the assistant does not allow", async () => {
    const res = await postTranslate(req({ kbId: "kb-1", text: "Hello", targetLanguage: "fr" }));
    expect(res.status).toBe(400);
    expect((await res.json()).allowedLanguages).toEqual(["en", "ta"]);
    expect(translateText).not.toHaveBeenCalled();
  });

  it("embed: uses the credential's KB, never the kbId in the body", async () => {
    translateText.mockResolvedValue("Hola");
    await postEmbedTranslate(req({ kbId: "someone-elses-kb", text: "Hi", targetLanguage: "en" }));
    expect(getAssistantConfigByKb).toHaveBeenLastCalledWith("kb-embed");
  });

  it("validates input", async () => {
    expect((await postTranslate(req({ kbId: "kb-1", text: "", targetLanguage: "ta" }))).status).toBe(400);
    expect((await postTranslate(req({ kbId: "kb-1", text: "x".repeat(7000), targetLanguage: "ta" }))).status).toBe(413);
  });

  it("agent editor: translates the first message into any supported language with the draft model", async () => {
    translateText.mockResolvedValue("مرحبا");
    const res = await postAgentTranslate(req({ text: "Hello", targetLanguage: "ar" }), "agent-1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ translatedText: "مرحبا", language: "ar" });
    expect(resolveAIConfig).toHaveBeenLastCalledWith({ kbId: "kb-agent", surface: "chat", preferDraft: true });
  });

  it("agent editor: rejects unsupported languages and empty text", async () => {
    expect((await postAgentTranslate(req({ text: "Hello", targetLanguage: "xx" }), "agent-1")).status).toBe(400);
    expect((await postAgentTranslate(req({ text: " ", targetLanguage: "ta" }), "agent-1")).status).toBe(400);
    expect(translateText).not.toHaveBeenCalled();
  });
});
