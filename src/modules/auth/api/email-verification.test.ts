/**
 * src/modules/auth/api/email-verification.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Email verification flow — the signup funnel contract:
 *
 *   POST /api/auth/verify-email
 *     - valid token          → marks email_verified, sends welcome email, audited
 *     - invalid/expired      → 400 TOKEN_INVALID, nothing is mutated
 *     - already-verified     → 200 alreadyVerified, token still consumed,
 *                              NO second welcome email
 *
 *   POST /api/auth/resend-verification
 *     - unknown email        → generic 200 (never leaks account existence)
 *     - verified account     → generic 200, no email sent
 *     - unverified account   → new token issued + verification email
 *     - 4th request in 10min → 429 RATE_LIMITED
 *     - empty body + session → authenticated fallback resends (checkout card)
 *
 *   sendVerificationEmail
 *     - verification template deactivated by an admin → falls back to the
 *       welcome email so a brand-new account still gets onboarded.
 *     - explicit origin → the emailed link uses it (never localhost in prod)
 *
 *   sendWelcomeEmailOnce (migration 049 — "welcome on first login")
 *     - first claim wins and sends; second call is a no-op (exactly once)
 *
 *   resolvePublicOrigin / appUrlFor (src/lib/public-origin.ts — REAL, unmocked)
 *     - env var wins; request headers derive the origin; localhost fallback
 *
 * The rate limiter is the REAL in-memory implementation (reset between
 * tests); DB / email / template layers are mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: vi.fn(async () => {}) }));

vi.mock("@/lib/db", () => ({
  query: vi.fn(async () => []),
  execute: vi.fn(async () => {}),
  queryOne: vi.fn(async () => null),
}));

vi.mock("@/lib/email", () => ({
  sendPlatformEmail: vi.fn(async () => ({ sent: true, provider: "resend" as const })),
  appUrl: (path: string) => `https://clara.example${path}`,
  resolvePublicOrigin: vi.fn(() => "https://clara.example"),
  appUrlFor: (path: string) => `https://clara.example${path}`,
}));

vi.mock("@/lib/email-templates", () => ({
  renderEmailTemplate: vi.fn(),
}));

vi.mock("../core/db", () => ({
  getUserByEmail: vi.fn(async () => null),
  writeAuditLog: vi.fn(async () => {}),
}));

vi.mock("../core/rbac", () => ({
  requireAuth: vi.fn(async () => {
    throw new Error("unauthenticated");
  }),
}));

import { query, execute } from "@/lib/db";
import { sendPlatformEmail } from "@/lib/email";
import { renderEmailTemplate } from "@/lib/email-templates";
import { getUserByEmail, writeAuditLog } from "../core/db";
import { requireAuth } from "../core/rbac";
import { resetRateLimits } from "@/lib/rate-limit";
import {
  verifyEmailHandler,
  resendVerificationHandler,
  sendVerificationEmail,
  sendWelcomeEmailOnce,
} from "./email-verification";

const queryMock = vi.mocked(query);
const executeMock = vi.mocked(execute);
const sendMock = vi.mocked(sendPlatformEmail);
const renderMock = vi.mocked(renderEmailTemplate);
const getUserMock = vi.mocked(getUserByEmail);
const auditMock = vi.mocked(writeAuditLog);
const requireAuthMock = vi.mocked(requireAuth);

const RENDERED = {
  subject: "Verify your email for Clara AI",
  html: "<p>verify</p>",
  text: "verify",
  source: "db" as const,
};

const WELCOME_RENDERED = {
  subject: "Welcome to Clara AI, Jane! 🎉",
  html: "<p>welcome</p>",
  text: "welcome",
  source: "db" as const,
};

function makeReq(
  body: unknown,
  opts: { ip?: string; headers?: Record<string, string> } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.ip !== undefined) headers["x-forwarded-for"] = opts.ip;
  Object.assign(headers, opts.headers ?? {});
  return {
    json: async () => body,
    headers: new Headers(headers),
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  renderMock.mockResolvedValue({ ...RENDERED });
  sendMock.mockClear();
});

// ── POST /api/auth/verify-email ───────────────────────────────────────────────

describe("verifyEmailHandler", () => {
  it("verifies the user, consumes the token, audits and sends the welcome email", async () => {
    queryMock
      .mockResolvedValueOnce([
        { id: "tok-1", user_id: "user-1", email: "jane@acme.example", full_name: "Jane", email_verified: false },
      ])
      // welcome-once claim UPDATE … RETURNING id
      .mockResolvedValueOnce([{ id: "user-1" }]);
    renderMock.mockResolvedValueOnce({ ...WELCOME_RENDERED }); // welcome render

    const res = await verifyEmailHandler(makeReq({ token: "abc" }));
    const data = await res.json() as { ok?: boolean; email?: string };

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.email).toBe("jane@acme.example");

    // Token consumed exactly once
    expect(executeMock).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE password_reset_tokens SET used_at"),
      ["tok-1"],
    );
    // users.email_verified flipped
    expect(executeMock).toHaveBeenCalledWith(
      expect.stringContaining("SET email_verified = TRUE"),
      ["user-1"],
    );
    // Audited
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "user.email_verified" }));
    // Welcome email sent (fire-and-forget — drain the microtask queue)
    await vi.waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({ to: "jane@acme.example", subject: WELCOME_RENDERED.subject }),
      ),
    );
    expect(renderMock).toHaveBeenCalledWith("welcome_email", expect.objectContaining({ userName: "Jane" }));
  });

  it("skips the welcome email when the once-flag was already claimed at first login", async () => {
    queryMock
      .mockResolvedValueOnce([
        { id: "tok-3", user_id: "user-1", email: "jane@acme.example", full_name: "Jane", email_verified: false },
      ])
      // claim UPDATE matches nothing → user was already welcomed at login
      .mockResolvedValueOnce([]);

    const res = await verifyEmailHandler(makeReq({ token: "abc" }));

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 10));
    expect(sendMock).not.toHaveBeenCalled();
    expect(renderMock).not.toHaveBeenCalledWith("welcome_email", expect.anything());
  });

  it("looks the token up in the email_verification purpose only", async () => {
    queryMock.mockResolvedValueOnce([]);
    await verifyEmailHandler(makeReq({ token: "abc" }));

    const [sql] = queryMock.mock.calls[0]!;
    expect(sql).toContain("purpose = 'email_verification'");
    expect(sql).toContain("used_at IS NULL");
    expect(sql).toContain("expires_at > now()");
  });

  it("rejects an invalid or expired token with TOKEN_INVALID and mutates nothing", async () => {
    queryMock.mockResolvedValueOnce([]);

    const res = await verifyEmailHandler(makeReq({ token: "stale" }));
    const data = await res.json() as { code?: string };

    expect(res.status).toBe(400);
    expect(data.code).toBe("TOKEN_INVALID");
    expect(executeMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("requires a token (INVALID_INPUT)", async () => {
    const res = await verifyEmailHandler(makeReq({}));
    expect(res.status).toBe(400);
    const data = await res.json() as { code?: string };
    expect(data.code).toBe("INVALID_INPUT");
  });

  it("replies alreadyVerified without re-sending the welcome email", async () => {
    queryMock.mockResolvedValueOnce([
      { id: "tok-2", user_id: "user-1", email: "jane@acme.example", full_name: "Jane", email_verified: true },
    ]);

    const res = await verifyEmailHandler(makeReq({ token: "abc" }));
    const data = await res.json() as { ok?: boolean; alreadyVerified?: boolean };

    expect(res.status).toBe(200);
    expect(data.alreadyVerified).toBe(true);
    // Token still consumed…
    expect(executeMock).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE password_reset_tokens SET used_at"),
      ["tok-2"],
    );
    // …but no second welcome email and no user mutation / audit
    await new Promise((r) => setTimeout(r, 10));
    expect(sendMock).not.toHaveBeenCalled();
    expect(executeMock).not.toHaveBeenCalledWith(
      expect.stringContaining("SET email_verified = TRUE"), expect.anything(),
    );
    expect(auditMock).not.toHaveBeenCalled();
  });
});

// ── POST /api/auth/resend-verification ────────────────────────────────────────

describe("resendVerificationHandler", () => {
  const UNVERIFIED_USER = {
    id: "user-1",
    email: "jane@acme.example",
    fullName: "Jane",
    avatarUrl: null,
    status: "active",
    emailVerified: false,
    isSuperAdmin: false,
    lastLoginAt: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };

  it("issues a fresh token and emails it for an unverified account", async () => {
    getUserMock.mockResolvedValueOnce(UNVERIFIED_USER as never);

    const res = await resendVerificationHandler(makeReq({ email: "jane@acme.example" }));

    expect(res.status).toBe(200);
    // Old unused tokens invalidated, then a new row inserted
    const invalidate = executeMock.mock.calls.find(
      ([sql]) => sql.includes("purpose = 'email_verification'") && sql.includes("SET used_at = now()"),
    );
    expect(invalidate).toBeTruthy();
    const insert = executeMock.mock.calls.find(
      ([sql]) => sql.includes("INSERT INTO password_reset_tokens") && sql.includes("email_verification"),
    );
    expect(insert).toBeTruthy();
    // The verification email itself was sent
    expect(renderMock).toHaveBeenCalledWith("email_verification", expect.objectContaining({ userName: "Jane" }));
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1));
  });

  it("resends for an authenticated session when the body has no email (checkout card)", async () => {
    // The post-checkout verify reminder calls with an empty body — the
    // session identifies the user instead of a typed-in email address.
    requireAuthMock.mockResolvedValueOnce({
      user: UNVERIFIED_USER as never,
      session: { id: "sess-1" } as never,
    });
    getUserMock.mockResolvedValueOnce(UNVERIFIED_USER as never);

    const res = await resendVerificationHandler(makeReq({}));

    expect(res.status).toBe(200);
    expect(requireAuthMock).toHaveBeenCalled();
    expect(renderMock).toHaveBeenCalledWith("email_verification", expect.objectContaining({ userName: "Jane" }));
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1));
  });

  it("returns the same generic 200 for an unknown email and sends nothing", async () => {
    getUserMock.mockResolvedValueOnce(null);

    const res = await resendVerificationHandler(makeReq({ email: "nobody@acme.example" }));
    const data = await res.json() as { ok?: boolean; message?: string };

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(sendMock).not.toHaveBeenCalled();
    expect(renderMock).not.toHaveBeenCalled();
  });

  it("does not email already-verified accounts (same generic 200)", async () => {
    getUserMock.mockResolvedValueOnce({ ...UNVERIFIED_USER, emailVerified: true } as never);

    const res = await resendVerificationHandler(makeReq({ email: "jane@acme.example" }));

    expect(res.status).toBe(200);
    expect(sendMock).not.toHaveBeenCalled();
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("rate limits to 3 requests per 10 minutes per email", async () => {
    getUserMock.mockResolvedValue(UNVERIFIED_USER as never);

    const results: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await resendVerificationHandler(makeReq({ email: "jane@acme.example" }));
      results.push(res.status);
    }

    expect(results).toEqual([200, 200, 200, 429]);
    // The 4th (blocked) request must not have issued another token
    const inserts = executeMock.mock.calls.filter(
      ([sql]) => sql.includes("INSERT INTO password_reset_tokens"),
    );
    expect(inserts).toHaveLength(3);
  });

  it("accepts a missing/invalid body without leaking anything", async () => {
    // requireAuth mock throws (default) → no email, no session → generic 200
    const res = await resendVerificationHandler(makeReq({}));
    expect(res.status).toBe(200);
    expect(getUserMock).not.toHaveBeenCalled();
  });
});

// ── sendVerificationEmail — admin deactivation fallback + origins ─────────────

describe("sendVerificationEmail — template deactivation fallback", () => {
  it("falls back to the welcome email when email_verification is deactivated", async () => {
    renderMock
      .mockResolvedValueOnce(null)                        // email_verification suppressed
      .mockResolvedValueOnce({ ...WELCOME_RENDERED });    // welcome fallback

    const ok = await sendVerificationEmail(
      { id: "user-9", email: "sam@acme.example", fullName: "Sam" },
      "10.0.0.1",
    );

    expect(ok).toBe(false); // verification email NOT sent…
    expect(renderMock).toHaveBeenNthCalledWith(1, "email_verification", expect.anything());
    expect(renderMock).toHaveBeenNthCalledWith(2, "welcome_email", expect.objectContaining({ userName: "Sam" }));
    // …but the welcome email still went out so the account gets onboarded.
    await vi.waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({ to: "sam@acme.example", subject: WELCOME_RENDERED.subject }),
      ),
    );
  });

  it("does not crash (and reports false) when the mail layer blows up", async () => {
    renderMock.mockRejectedValueOnce(new Error("db down"));

    const ok = await sendVerificationEmail(
      { id: "user-9", email: "sam@acme.example", fullName: "Sam" },
      null,
    );

    expect(ok).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("builds the verification link from the caller-supplied origin", async () => {
    renderMock.mockResolvedValueOnce({ ...RENDERED });

    await sendVerificationEmail(
      { id: "user-7", email: "ola@acme.example", fullName: "Ola" },
      null,
      "https://app.clara.example",
    );

    expect(renderMock).toHaveBeenCalledWith(
      "email_verification",
      expect.objectContaining({
        verifyUrl: expect.stringContaining("https://app.clara.example/login/verify-email?token="),
      }),
    );
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1));
  });
});

// ── sendWelcomeEmailOnce — exactly-once (migration 049) ────────────────────────

describe("sendWelcomeEmailOnce", () => {
  it("claims the flag and sends on the first call", async () => {
    queryMock.mockResolvedValueOnce([{ id: "user-1" }]); // claim succeeded
    renderMock.mockResolvedValueOnce({ ...WELCOME_RENDERED });

    const sent = await sendWelcomeEmailOnce(
      { id: "user-1", email: "jane@acme.example", fullName: "Jane" },
      "https://app.clara.example",
    );

    expect(sent).toBe(true);
    // Atomic claim BEFORE sending
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("welcome_email_sent_at IS NULL"),
      ["user-1"],
    );
    // dashboardUrl uses the origin, not localhost
    expect(renderMock).toHaveBeenCalledWith(
      "welcome_email",
      expect.objectContaining({ dashboardUrl: "https://app.clara.example/dashboard" }),
    );
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1));
  });

  it("is a no-op when the flag was already claimed (second login / verify race)", async () => {
    queryMock.mockResolvedValueOnce([]); // claim matched nothing

    const sent = await sendWelcomeEmailOnce(
      { id: "user-1", email: "jane@acme.example", fullName: "Jane" },
    );

    expect(sent).toBe(false);
    expect(renderMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });
});

// ── resolvePublicOrigin / appUrlFor — REAL implementation ──────────────────────

describe("resolvePublicOrigin / appUrlFor (real, from @/lib/public-origin)", () => {
  const ENV_BACKUP = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    if (ENV_BACKUP === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = ENV_BACKUP;
  });

  it("prefers the configured env var over request headers", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://env-configured.example/";
    const { resolvePublicOrigin, appUrlFor } = await import("@/lib/public-origin");

    const req = makeReq({}, { headers: { "x-forwarded-host": "request-host.example" } });
    expect(resolvePublicOrigin(req)).toBe("https://env-configured.example");
    expect(appUrlFor("/login", req)).toBe("https://env-configured.example/login");
  });

  it("derives https origin from x-forwarded-host when the env var is unset", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const { resolvePublicOrigin, appUrlFor } = await import("@/lib/public-origin");

    // Vercel-style proxy headers
    const req = makeReq(
      {},
      { headers: { "x-forwarded-host": "clara.vercel.app", "x-forwarded-proto": "https" } },
    );
    expect(resolvePublicOrigin(req)).toBe("https://clara.vercel.app");
    expect(appUrlFor("", req)).toBe("https://clara.vercel.app"); // no trailing slash
  });

  it("derives the origin from a plain Host header and defaults to https", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const { resolvePublicOrigin } = await import("@/lib/public-origin");

    const req = makeReq({}, { headers: { host: "app.acme.example" } });
    expect(resolvePublicOrigin(req)).toBe("https://app.acme.example");
  });

  it("keeps http for local dev hosts and falls back to localhost without a request", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const { resolvePublicOrigin, appUrlFor } = await import("@/lib/public-origin");

    const localReq = makeReq({}, { headers: { host: "localhost:3000" } });
    expect(resolvePublicOrigin(localReq)).toBe("http://localhost:3000");
    // No request at all (background worker) → dev fallback, not a crash
    expect(resolvePublicOrigin()).toBe("http://localhost:3000");
    expect(appUrlFor("/login")).toBe("http://localhost:3000/login");
  });

  it("joins paths without producing double slashes", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const { appUrlFor } = await import("@/lib/public-origin");

    const req = makeReq({}, { headers: { host: "app.acme.example" } });
    expect(appUrlFor("", req)).toBe("https://app.acme.example");
    expect(appUrlFor("/dashboard", req)).toBe("https://app.acme.example/dashboard");
    expect(appUrlFor("dashboard", req)).toBe("https://app.acme.example/dashboard");
  });
});
