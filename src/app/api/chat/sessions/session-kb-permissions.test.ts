import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireKbPermission: vi.fn(),
  query: vi.fn(),
  ensureMigrated: vi.fn(),
}));

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: mocks.ensureMigrated }));
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireKbPermission: mocks.requireKbPermission,
}));
vi.mock("@/lib/db", () => ({ pool: { query: mocks.query } }));

import { GET as listSessions, POST as createSession } from "./route";
import { GET as readSession } from "./[sessionId]/route";
import { POST as addMessages } from "./[sessionId]/messages/route";

const makeRequest = (path: string, body?: unknown) =>
  new NextRequest("http://localhost" + path, body === undefined
    ? { method: "GET" }
    : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const params = { params: Promise.resolve({ sessionId: "session-owned" }) };
const ownedSession = { id: "session-owned", kb_id: "kb-private", title: "Conversation", created_at: new Date(0), updated_at: new Date(0) };
const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

describe("chat-session knowledge base permission boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureMigrated.mockResolvedValue(undefined);
    mocks.requireAuth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.requireKbPermission.mockResolvedValue(undefined);
    mocks.query.mockResolvedValue({ rowCount: 1, rows: [ownedSession] });
  });

  it("does not create a session for a KB the requester cannot read", async () => {
    mocks.requireKbPermission.mockRejectedValueOnce(forbidden());
    const response = await createSession(makeRequest("/api/chat/sessions", { kbId: "kb-private" }));
    expect(response.status).toBe(403);
    expect(mocks.requireKbPermission).toHaveBeenCalledWith(expect.anything(), "kb-private", "kb:read");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("preserves valid tenant-scoped session creation", async () => {
    const response = await createSession(makeRequest("/api/chat/sessions", { kbId: "kb-private", title: "Conversation" }));
    expect(response.status).toBe(201);
    expect((await response.json()).session.kbId).toBe("kb-private");
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO chat_sessions"),
      ["user-1", "kb-private", "Conversation"],
    );
  });

  it("does not list saved KB sessions after the user loses KB access", async () => {
    mocks.requireKbPermission.mockRejectedValueOnce(forbidden());
    const response = await listSessions(makeRequest("/api/chat/sessions?kbId=kb-private"));
    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("continues listing active KB sessions for an authorized user", async () => {
    const response = await listSessions(makeRequest("/api/chat/sessions?kbId=kb-private"));
    expect(response.status).toBe(200);
    expect((await response.json()).sessions).toHaveLength(1);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("WHERE user_id = $1"), ["user-1", "kb-private"]);
  });

  it("does not return a saved transcript when KB access was revoked", async () => {
    mocks.requireKbPermission.mockRejectedValueOnce(forbidden());
    const response = await readSession(makeRequest("/api/chat/sessions/session-owned"), params);
    expect(response.status).toBe(403);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("user_id = $2"), ["session-owned", "user-1"]);
  });

  it("does not persist new messages in a revoked KB session", async () => {
    mocks.requireKbPermission.mockRejectedValueOnce(forbidden());
    const response = await addMessages(makeRequest("/api/chat/sessions/session-owned/messages", {
      messages: [{ id: "message-1", role: "user", content: "hello" }],
    }), params);
    expect(response.status).toBe(403);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("kb_id FROM chat_sessions"), ["session-owned", "user-1"]);
  });

  it("keeps authorized message inserts and timestamps scoped to the owner", async () => {
    const response = await addMessages(makeRequest("/api/chat/sessions/session-owned/messages", {
      messages: [{ id: "message-1", role: "user", content: "hello" }],
    }), params);
    expect(response.status).toBe(201);
    expect(mocks.requireKbPermission).toHaveBeenCalledWith(expect.anything(), "kb-private", "kb:read");
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO chat_messages"), expect.arrayContaining(["message-1", "session-owned"]));
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("SET updated_at = now() WHERE id = $1 AND user_id = $2"), ["session-owned", "user-1"]);
  });
});
