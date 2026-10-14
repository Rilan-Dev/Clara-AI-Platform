/**
 * Unit tests for the brain (chat-completion) runtime incident capture and the
 * email-delivery meta-incident.
 *
 * Production context: an OpenAI chat-completion 401 (dead key) or 429
 * (billing exhausted) only produced container logs — users saw "The assistant
 * could not complete the answer" while the platform admin saw nothing.
 * recordBrainRuntimeFailure() must classify those failures into actionable
 * incidents that drive the super-admin banner + email, and user aborts must
 * never be recorded. When the email channel itself is broken, the incident
 * must be recorded WITHOUT attempting an email (no recursion).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  query: vi.fn(async (sql: string) => {
    // getSuperAdmins → one active super admin
    if (/FROM users/i.test(sql)) {
      return [{ id: "admin-user-1", email: "admin@example.com" }];
    }
    // notification INSERT ... RETURNING id
    if (/RETURNING id/i.test(sql)) {
      return [{ id: "notif-1" }];
    }
    // incident SELECT existing / UPDATEs → no prior rows
    return [];
  }),
}));

vi.mock("@/lib/email", () => ({
  sendPlatformEmail: vi.fn(async () => ({ sent: true, provider: "console" as const })),
}));

import { query } from "@/lib/db";
import { sendPlatformEmail } from "@/lib/email";
import {
  noteBrainRequestSucceeded,
  recordBrainRuntimeFailure,
  syncPlatformHealthIncidents,
} from "./incidents";

type QueryCall = [sql: string, params?: unknown[]];

function incidentInserts(): QueryCall[] {
  return vi.mocked(query).mock.calls.filter(([sql]) =>
    /INSERT INTO platform_health_incidents/i.test(sql),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordBrainRuntimeFailure — answer-engine incident classification", () => {
  it("classifies a 401 invalid_api_key as a critical credential incident naming the provider", async () => {
    await recordBrainRuntimeFailure(
      new Error("401 Incorrect API key provided: sk-proj-***B6YA."),
      { surface: "KB chat answer", provider: "openai", model: "gpt-4o-mini" },
    );

    const insert = incidentInserts().at(-1);
    expect(insert).toBeDefined();
    const [sql, params] = insert!;
    expect(sql).toMatch(/'failing'/);
    expect(params?.[0]).toBe("ai-brain:openai");
    expect(params?.[1]).toBe("OpenAI answer engine");
    expect(params?.[2]).toBe("critical");
    expect(String(params?.[3])).toContain("API key was rejected");
    expect(String(params?.[3])).toContain("gpt-4o-mini");
  });

  it("classifies a 429 quota/billing failure as critical with recharge guidance", async () => {
    await recordBrainRuntimeFailure(
      new Error("429 exceeded your current quota, please check your plan and billing details"),
      { surface: "embed chat answer", provider: "openai" },
    );

    const insert = incidentInserts().at(-1);
    expect(insert).toBeDefined();
    expect(insert![1]?.[0]).toBe("ai-brain:openai");
    expect(insert![1]?.[2]).toBe("critical");
    expect(String(insert![1]?.[3])).toContain("quota/billing");
  });

  it("passes the resolved provider through (Sarvam brain failures get their own incident key)", async () => {
    await recordBrainRuntimeFailure(
      new Error("401 Unauthorized"),
      { surface: "KB chat answer", provider: "sarvam" },
    );

    const insert = incidentInserts().at(-1);
    expect(insert).toBeDefined();
    expect(insert![1]?.[0]).toBe("ai-brain:sarvam");
    expect(insert![1]?.[1]).toBe("Sarvam answer engine");
  });

  it("infers the provider from the raw error when no context is given", async () => {
    await recordBrainRuntimeFailure(
      new Error("Error: 401 The request is not authorized, generativelanguage.googleapis.com"),
      { surface: "document chat answer" },
    );

    const insert = incidentInserts().at(-1);
    expect(insert).toBeDefined();
    expect(insert![1]?.[0]).toBe("ai-brain:gemini");
    expect(insert![1]?.[1]).toBe("Gemini answer engine");
  });

  it("never records user aborts/cancellations as provider failures", async () => {
    const before = incidentInserts().length;
    await recordBrainRuntimeFailure(
      new Error("AbortError: The operation was aborted"),
      { surface: "KB chat answer", provider: "openai" },
    );
    expect(incidentInserts().length).toBe(before);
  });

  it("classifies network/timeout failures as warning with base-URL guidance", async () => {
    await recordBrainRuntimeFailure(
      new Error("Error: connect ETIMEDOUT 1.2.3.4:443"),
      { surface: "KB chat answer", provider: "openai" },
    );

    const insert = incidentInserts().at(-1);
    expect(insert).toBeDefined();
    expect(insert![1]?.[2]).toBe("warning");
    expect(String(insert![1]?.[3])).toContain("could not be reached");
  });
});

describe("noteBrainRequestSucceeded — incident auto-recovery", () => {
  it("resolves the runtime-failing brain incident for that provider", async () => {
    await recordBrainRuntimeFailure(
      new Error("401 invalid_api_key"),
      { surface: "KB chat answer", provider: "openai" },
    );
    await noteBrainRequestSucceeded("openai");

    // The recovery write: a healthy incident INSERT for the same key.
    const healthy = incidentInserts().filter(([sql]) => /'healthy'/.test(sql));
    expect(healthy.length).toBeGreaterThan(0);
    expect(healthy.at(-1)![1]?.[0]).toBe("ai-brain:openai");
  });
});

describe("email-delivery meta-incident — the notification channel itself", () => {
  it("records an email-delivery incident WITHOUT attempting an email when the provider fails", async () => {
    // Simulate a broken Resend key: every send fails.
    vi.mocked(sendPlatformEmail).mockResolvedValue({
      sent: false,
      provider: "resend" as const,
      error: "401 Invalid Resend API key",
    });

    // A failing health check triggers notifyAdmins → failed email →
    // noteEmailDeliveryFailed → incident recorded with notify:false.
    await syncPlatformHealthIncidents([
      {
        key: "ai-embedding:openai",
        serviceName: "OpenAI embedding",
        healthy: false,
        severity: "critical",
        message: "Embedding request failed: 401 invalid_api_key.",
      },
    ]);

    const emailIncident = incidentInserts().find(([sql, params]) => params?.[0] === "email-delivery:resend");
    expect(emailIncident).toBeDefined();
    expect(String(emailIncident![1]?.[3])).toContain("Admin notification emails are failing");

    // Exactly ONE email attempt: the incident email itself must not be
    // re-sent through the broken channel (no recursion/loop).
    expect(sendPlatformEmail).toHaveBeenCalledTimes(1);
  });
});
