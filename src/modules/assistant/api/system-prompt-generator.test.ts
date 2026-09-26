import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: vi.fn(async () => ({ user: { id: "u1" } })),
  requireAgentPermission: vi.fn(async () => ({ orgId: "org-1" })),
}));
vi.mock("@/modules/organisations/core/db", () => ({
  getAgentById: vi.fn(async () => ({ id: "agent-1", name: "Clinic Helper" })),
}));
const listKnowledgeBases = vi.fn();
vi.mock("@/modules/knowledge-bases/core/db", () => ({
  listKnowledgeBases: (...a: unknown[]) => listKnowledgeBases(...a),
  getKnowledgeBaseDocumentTitles: vi.fn(async () => ["Visiting hours", "Appointment booking"]),
}));
const scroll = vi.fn();
vi.mock("@/modules/admin/core/vector-store", () => ({ getQdrantClient: () => ({ scroll }) }));
vi.mock("@/modules/ai-core/resolve", () => ({
  resolveAIConfig: vi.fn(async () => ({ provider: "gemini" })),
  toProviderConfig: vi.fn(() => ({ provider: "gemini" })),
}));
vi.mock("@/lib/rate-limit", () => ({
  hit: vi.fn(() => ({ allowed: true, retryAfterSec: 0 })),
  rateLimitResponse: vi.fn(() => ({ body: { error: "rate" }, status: 429, headers: {} })),
}));
const calls: Array<{ system: string; user: string }> = [];
const replies: string[] = [];
vi.mock("@/modules/ai-core/factory", () => ({
  ProviderFactory: {
    getProvider: () => ({
      async *chatStream(messages: Array<{ content: string }>) {
        calls.push({ system: messages[0]!.content, user: messages[1]!.content });
        yield replies.shift() ?? "";
      },
    }),
  },
}));

import { generateSystemPromptHandler } from "./system-prompt-generator";

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/agents/agent-1/system-prompt/generate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

const kb = { id: "kb-1", agentId: "agent-1", name: "Clinic", description: null, qdrantCollection: "c1", status: "active" };

describe("generate system prompt from knowledge base", () => {
  beforeEach(() => {
    calls.length = 0;
    replies.length = 0;
    listKnowledgeBases.mockReset().mockResolvedValue([kb]);
    scroll.mockReset().mockResolvedValue({
      points: [{ payload: { chunk: "Our outpatient clinic is open 8am to 6pm.", title: "Visiting hours" } }],
    });
  });

  it("uses the template the admin picked and grounds it in the knowledge base", async () => {
    replies.push("You are Clinic Helper, the information assistant for the clinic.");
    const res = await generateSystemPromptHandler(req({ template: "clinical", notes: "Keep it short." }), "agent-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ template: "clinical", documentsSampled: 1 });
    expect(body.prompt).toContain("Clinic Helper");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.system).toContain("Clinical / healthcare");
    expect(calls[0]!.system).toContain("Keep it short.");
    expect(calls[0]!.system).toContain("Do NOT include rules about which language");
    expect(calls[0]!.user).toContain("outpatient clinic");
    expect(calls[0]!.user).toContain("Appointment booking");
  });

  it("lets the AI decide the template from the knowledge base content", async () => {
    replies.push('{"template":"clinical","reason":"Healthcare clinic information."}', "```\nYou are the clinic assistant.\n```");
    const res = await generateSystemPromptHandler(req({ template: "auto" }), "agent-1");
    const body = await res.json();
    expect(body).toMatchObject({ template: "clinical", reason: "Healthcare clinic information.", prompt: "You are the clinic assistant." });
    expect(calls).toHaveLength(2);
    expect(calls[0]!.system).toContain("organization_policy");
  });

  it("falls back to a safe template when the classifier reply is unusable", async () => {
    replies.push("not json", "You are the assistant.");
    const body = await (await generateSystemPromptHandler(req({ template: "auto" }), "agent-1")).json();
    expect(body.template).toBe("customer_support");
  });

  it("rejects unknown templates and agents without knowledge", async () => {
    expect((await generateSystemPromptHandler(req({ template: "pirate" }), "agent-1")).status).toBe(400);
    listKnowledgeBases.mockResolvedValue([]);
    expect((await generateSystemPromptHandler(req({ template: "faq" }), "agent-1")).status).toBe(409);
  });
});
