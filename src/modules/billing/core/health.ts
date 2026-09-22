import { getStripe, getStripePriceId } from "@/lib/stripe";

export type PaymentGatewayStatus = "up" | "down" | "not_configured";

export type PaymentGatewayHealth = {
  status: PaymentGatewayStatus;
  latencyMs?: number;
  detail?: string;
  error?: string;
  mode?: "test" | "live";
  webhookConfigured: boolean;
  priceChecks?: Record<string, "valid" | "invalid">;
};

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/sk_(?:test|live)_[A-Za-z0-9]+/g, "sk_***")
    .replace(/whsec_[A-Za-z0-9]+/g, "whsec_***");
}

export async function checkStripeGateway(): Promise<PaymentGatewayHealth> {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  const webhookConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());

  if (!key) {
    return {
      status: "not_configured",
      detail: "Stripe secret key is not configured.",
      webhookConfigured,
    };
  }

  if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(key)) {
    return {
      status: "down",
      detail: "Stripe secret key format is invalid.",
      error: "Expected a Stripe secret key beginning with sk_test_ or sk_live_.",
      webhookConfigured,
    };
  }

  const mode = key.startsWith("sk_live_") ? "live" : "test";
  const startedAt = Date.now();

  try {
    const stripe = getStripe();
    await stripe.balance.retrieve();

    const priceChecks: Record<string, "valid" | "invalid"> = {};
    for (const planId of ["starter", "pro"]) {
      const priceId = getStripePriceId(planId);
      if (!priceId) continue;
      try {
        const price = await stripe.prices.retrieve(priceId);
        priceChecks[planId] = price.active ? "valid" : "invalid";
      } catch {
        priceChecks[planId] = "invalid";
      }
    }

    const invalidPrices = Object.entries(priceChecks)
      .filter(([, status]) => status === "invalid")
      .map(([plan]) => plan);

    if (!webhookConfigured) {
      return {
        status: "down",
        latencyMs: Date.now() - startedAt,
        detail: "Stripe API is reachable, but the webhook signing secret is not configured.",
        error: "Stripe webhook verification is unavailable; paid activation cannot be completed safely.",
        mode,
        webhookConfigured: false,
        priceChecks,
      };
    }

    if (invalidPrices.length) {
      return {
        status: "down",
        latencyMs: Date.now() - startedAt,
        detail: `Stripe API is reachable, but configured price IDs are invalid: ${invalidPrices.join(", ")}.`,
        mode,
        webhookConfigured: true,
        priceChecks,
      };
    }

    return {
      status: "up",
      latencyMs: Date.now() - startedAt,
      detail: `Stripe API authenticated (${mode} mode); webhook configured.`,
      mode,
      webhookConfigured: true,
      priceChecks,
    };
  } catch (error) {
    return {
      status: "down",
      latencyMs: Date.now() - startedAt,
      detail: "Stripe API authentication/connectivity check failed.",
      error: safeError(error),
      mode,
      webhookConfigured,
    };
  }
}

export async function checkRazorpayGateway(): Promise<PaymentGatewayHealth> {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim() ?? "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim() ?? "";
  const webhookConfigured = Boolean(process.env.RAZORPAY_WEBHOOK_SECRET?.trim());

  if (!keyId && !keySecret) {
    return {
      status: "not_configured",
      detail: "Razorpay credentials are not configured.",
      webhookConfigured,
    };
  }

  if (!keyId || !keySecret) {
    return {
      status: "down",
      detail: "Razorpay credentials are incomplete.",
      error: "Both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required.",
      webhookConfigured,
    };
  }

  const startedAt = Date.now();
  try {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const response = await fetch("https://api.razorpay.com/v1/orders?count=1", {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(2_500),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        status: "down",
        latencyMs: Date.now() - startedAt,
        detail: "Razorpay API authentication/connectivity check failed.",
        error: `HTTP ${response.status}${body ? `: ${body.slice(0, 160)}` : ""}`,
        webhookConfigured,
      };
    }

    if (!webhookConfigured) {
      return {
        status: "down",
        latencyMs: Date.now() - startedAt,
        detail: "Razorpay API is reachable, but the webhook secret is not configured.",
        error: "Razorpay webhook verification is unavailable; payment activation cannot be completed safely.",
        webhookConfigured: false,
      };
    }

    return {
      status: "up",
      latencyMs: Date.now() - startedAt,
      detail: "Razorpay API authenticated; webhook configured.",
      webhookConfigured: true,
    };
  } catch (error) {
    return {
      status: "down",
      latencyMs: Date.now() - startedAt,
      detail: "Razorpay API authentication/connectivity check failed.",
      error: safeError(error),
      webhookConfigured,
    };
  }
}
