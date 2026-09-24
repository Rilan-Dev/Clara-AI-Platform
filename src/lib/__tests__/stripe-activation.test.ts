import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const queryMock = vi.fn(async (..._args: unknown[]) => [] as unknown[]);
const queryOneMock = vi.fn(async (..._args: unknown[]) => null as unknown);
vi.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => queryMock(...args),
  queryOne: (...args: unknown[]) => queryOneMock(...args),
}));

import {
  activateFromCheckoutSession,
  invoiceOrgId,
  invoiceSubscriptionId,
  subscriptionPeriod,
} from "@/lib/stripe-activation";

const sub = (extra: Record<string, unknown> = {}) => ({
  id: "sub_1",
  status: "active",
  customer: "cus_1",
  cancel_at_period_end: false,
  metadata: { orgId: "org-1", planId: "pro" },
  items: { data: [{ price: { id: "price_1" } }] },
  ...extra,
}) as unknown as Stripe.Subscription;

describe("version-tolerant Stripe field access", () => {
  it("reads the billing period from the subscription (acacia) or its first item (basil+)", () => {
    expect(subscriptionPeriod(sub({ current_period_start: 10, current_period_end: 20 })).end?.getTime()).toBe(20_000);
    const modern = sub({ items: { data: [{ price: { id: "p" }, current_period_start: 30, current_period_end: 40 }] } });
    expect(subscriptionPeriod(modern).start?.getTime()).toBe(30_000);
    expect(subscriptionPeriod(sub())).toEqual({ start: null, end: null });
  });

  it("finds an invoice's subscription and org on old and new API shapes", () => {
    const legacy = { subscription: "sub_a", subscription_details: { metadata: { orgId: "org-a" } } } as unknown as Stripe.Invoice;
    const modern = { parent: { subscription_details: { subscription: "sub_b", metadata: { orgId: "org-b" } } } } as unknown as Stripe.Invoice;
    expect([invoiceSubscriptionId(legacy), invoiceOrgId(legacy)]).toEqual(["sub_a", "org-a"]);
    expect([invoiceSubscriptionId(modern), invoiceOrgId(modern)]).toEqual(["sub_b", "org-b"]);
  });
});

describe("activateFromCheckoutSession", () => {
  const stripe = { subscriptions: { retrieve: vi.fn(async () => sub({ current_period_start: 1, current_period_end: 2 })) } } as unknown as Stripe;

  beforeEach(() => {
    queryMock.mockClear();
    queryOneMock.mockReset();
    // owner verified
    queryOneMock.mockResolvedValue({ email_verified: true });
  });

  it("activates a completed, paid session and marks the payment verified", async () => {
    const result = await activateFromCheckoutSession(stripe, {
      id: "cs_test_1", status: "complete", payment_status: "paid",
      subscription: "sub_1", metadata: { orgId: "org-1", planId: "pro" },
    } as unknown as Stripe.Checkout.Session);
    expect(result).toEqual({ outcome: "activated", status: "active" });
    const sql = queryMock.mock.calls.map((c) => String(c[0])).join("\n");
    expect(sql).toContain("payment_status = 'paid'");
    // the upsert writes status "active", not "payment_pending"
    expect(queryMock.mock.calls[0]?.[1]).toContain("active");
  });

  it("leaves an unpaid session pending and never downgrades a paid org", async () => {
    const result = await activateFromCheckoutSession(stripe, {
      id: "cs_test_2", status: "open", payment_status: "unpaid",
      subscription: "sub_1", metadata: { orgId: "org-1" },
    } as unknown as Stripe.Checkout.Session);
    expect(result.outcome).toBe("not_paid");
    expect(String(queryMock.mock.calls[0]?.[0])).toContain("payment_status IS DISTINCT FROM 'paid'");
  });

  it("skips sessions without an org", async () => {
    const result = await activateFromCheckoutSession(stripe, {
      id: "cs_test_3", status: "complete", payment_status: "paid", subscription: "sub_1", metadata: {},
    } as unknown as Stripe.Checkout.Session);
    expect(result.outcome).toBe("skipped");
    expect(queryMock).not.toHaveBeenCalled();
  });
});
