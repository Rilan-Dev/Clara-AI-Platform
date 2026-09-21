/**
 * src/lib/__tests__/subscription-notifications.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Subscription notification queue — the admin deactivation contract.
 *
 * When a platform admin switches an email template OFF (Settings → Email
 * Templates), the business event still happens but the email must not be
 * delivered. The queue keeps an auditable 'suppressed' row instead:
 *
 *   - active template   → pending row + immediate send attempt + status update
 *   - deactivated       → 'suppressed' row, no send attempt at all
 *   - console provider  → marked sent (dev mode must not pile up the queue)
 *   - provider failure  → marked failed with the error for retry/audit
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({ query: vi.fn(async () => []) }));

vi.mock("@/lib/email", () => ({
  sendPlatformEmail: vi.fn(async () => ({ sent: true, provider: "resend" as const })),
  appUrl: (path: string) => `https://clara.example${path}`,
}));

vi.mock("@/lib/email-templates", () => ({
  renderEmailTemplate: vi.fn(),
}));

import { query } from "@/lib/db";
import { sendPlatformEmail } from "@/lib/email";
import { renderEmailTemplate } from "@/lib/email-templates";
import { queueNotification } from "@/lib/subscription-notifications";

const queryMock = vi.mocked(query);
const sendMock = vi.mocked(sendPlatformEmail);
const renderMock = vi.mocked(renderEmailTemplate);

const RENDERED = {
  subject: "Your Clara AI plan has been updated — Acme",
  html: "<p>Plan updated</p>",
  text: "Plan updated",
  source: "db" as const,
};

function callsWith(fragment: string) {
  return queryMock.mock.calls.filter(([sql]) => sql.includes(fragment));
}

function paramsOf(fragment: string): unknown[] {
  const call = callsWith(fragment)[0];
  return call ? (call[1] ?? []) : [];
}

beforeEach(() => {
  vi.clearAllMocks();
  queryMock.mockImplementation(async (sql: string) =>
    sql.includes("RETURNING id") ? [{ id: "n-42" }] : [],
  );
  renderMock.mockResolvedValue({ ...RENDERED });
  sendMock.mockResolvedValue({ sent: true, provider: "resend" });
});

// ── Active template → normal delivery path ───────────────────────────────────

describe("queueNotification — active template", () => {
  it("queues a pending row and attempts delivery", async () => {
    const id = await queueNotification({
      orgId: "org-1",
      orgName: "Acme",
      recipientEmail: "owner@acme.example",
      type: "plan_changed",
      data: { orgName: "Acme", oldPlan: "Starter", newPlan: "Pro" },
    });

    expect(id).toBe("n-42");
    expect(renderMock).toHaveBeenCalledWith("plan_changed", expect.objectContaining({ newPlan: "Pro" }));

    const insert = callsWith("INSERT INTO subscription_notifications")[0];
    expect(insert).toBeTruthy();
    expect(insert![0]).not.toContain("suppressed");
    expect(insert![1]).toContain("plan_changed");

    // Fire-and-forget send runs after the queue insert — wait for it.
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1));
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "owner@acme.example", subject: RENDERED.subject }),
    );

    // Successful send flips the queue row to 'sent'.
    await vi.waitFor(() => {
      expect(callsWith("SET status='sent'").length).toBe(1);
    });
  });

  it("marks the row sent without a send attempt in console (dev) mode", async () => {
    sendMock.mockResolvedValue({ sent: false, provider: "console" });

    await queueNotification({
      orgId: "org-1", orgName: "Acme", recipientEmail: "owner@acme.example",
      type: "trial_converted", data: { orgName: "Acme", planName: "Pro" },
    });

    await vi.waitFor(() => {
      expect(callsWith("SET status='sent'").length).toBe(1);
    });
    // Dev mode must not create retryable failures.
    expect(callsWith("status='failed'").length).toBe(0);
  });

  it("marks the row failed with the provider error for later retry", async () => {
    sendMock.mockResolvedValue({ sent: false, provider: "smtp", error: "535 auth failed" });

    await queueNotification({
      orgId: "org-1", orgName: "Acme", recipientEmail: "owner@acme.example",
      type: "renewal_reminder", data: { orgName: "Acme", planName: "Pro" },
    });

    await vi.waitFor(() => {
      expect(callsWith("SET status='failed'").length).toBe(1);
    });
    expect(paramsOf("SET status='failed'")).toContain("535 auth failed");
  });
});

// ── Deactivated template → suppression path ──────────────────────────────────

describe("queueNotification — deactivated template", () => {
  it("records a 'suppressed' queue row and never sends", async () => {
    renderMock.mockResolvedValue(null); // admin switched the template off

    const id = await queueNotification({
      orgId: "org-1",
      orgName: "Acme",
      recipientEmail: "owner@acme.example",
      type: "payment_failed",
      data: { orgName: "Acme", planName: "Pro" },
    });

    expect(id).toBe("n-42");

    // The event is still auditable in the queue…
    const insert = callsWith("INSERT INTO subscription_notifications")[0];
    expect(insert![0]).toContain("'suppressed'");
    expect(insert![1]).toContain("payment_failed");

    // …but no delivery is attempted, even after the microtask queue drains.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(sendMock).not.toHaveBeenCalled();
    expect(callsWith("SET status='sent'").length).toBe(0);
    expect(callsWith("SET status='failed'").length).toBe(0);
  });
});
