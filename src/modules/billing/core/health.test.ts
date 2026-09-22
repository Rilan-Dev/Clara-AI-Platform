import { describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted above test bodies by vitest's transform —
// referencing a `const` declared inside the test throws "secret is not
// defined" when the factory runs. vi.hoisted initializes the value before
// the hoisted factory executes.
const { stripeSecret } = vi.hoisted(() => ({
  stripeSecret: "sk_test_abcdefghijklmnopqrstuvwxyz1234567890",
}));

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
    process.env.STRIPE_SECRET_KEY = stripeSecret;
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

    vi.mock("@/lib/stripe", () => ({
      getStripe: () => ({
        balance: {
          retrieve: vi.fn().mockRejectedValue(new Error(`Invalid API Key provided: ${stripeSecret}`)),
        },
      }),
      getStripePriceId: vi.fn().mockReturnValue(null),
    }));

    const { checkStripeGateway } = await import("./health");
    const result = await checkStripeGateway();
    expect(result.status).toBe("down");
    expect(result.error).not.toContain(stripeSecret);
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
