import { describe, expect, it, vi } from "vitest";

describe("payment gateway health checks", () => {
  it("reports Stripe as not configured when no secret exists", async () => {
    vi.resetModules();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const { checkStripeGateway } = await import("./health");
    const result = await checkStripeGateway();
    expect(result.status).toBe("not_configured");
    expect(result.webhookConfigured).toBe(false);
  });

  it("rejects malformed Stripe secret keys before making an API call", async () => {
    vi.resetModules();
    process.env.STRIPE_SECRET_KEY = "pk_test_not_a_secret";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const { checkStripeGateway } = await import("./health");
    const result = await checkStripeGateway();
    expect(result.status).toBe("down");
    expect(result.error).toContain("sk_test_");
  });

  it("does not expose a Stripe secret when the SDK reports an invalid key", async () => {
    vi.resetModules();
    const secret = "sk_test_abcdefghijklmnopqrstuvwxyz1234567890";
    process.env.STRIPE_SECRET_KEY = secret;
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

    vi.mock("@/lib/stripe", () => ({
      getStripe: () => ({
        balance: {
          retrieve: vi.fn().mockRejectedValue(new Error(`Invalid API Key provided: ${secret}`)),
        },
      }),
      getStripePriceId: vi.fn().mockReturnValue(null),
    }));

    const { checkStripeGateway } = await import("./health");
    const result = await checkStripeGateway();
    expect(result.status).toBe("down");
    expect(result.error).not.toContain(secret);
    expect(result.error).toContain("sk_***");
  });

  it("reports Razorpay as not configured when both credentials are absent", async () => {
    vi.resetModules();
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    const { checkRazorpayGateway } = await import("./health");
    const result = await checkRazorpayGateway();
    expect(result.status).toBe("not_configured");
  });
});
