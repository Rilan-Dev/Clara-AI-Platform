/**
 * src/lib/stripe.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Stripe SDK singleton + plan-to-price mappings.
 *
 * Environment variables (all server-side only):
 *   STRIPE_SECRET_KEY          sk_test_…   or sk_live_…
 *   STRIPE_WEBHOOK_SECRET      whsec_…     (from `stripe listen` or Dashboard)
 *   STRIPE_PRICE_STARTER       price_…     (monthly recurring price for Starter)
 *   STRIPE_PRICE_PRO           price_…     (monthly recurring price for Pro)
 *   NEXT_PUBLIC_APP_URL        https://…   (used to build redirect URLs)
 */

import Stripe from "stripe";

// ── Singleton ─────────────────────────────────────────────────────────────────

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  _stripe = new Stripe(key, { apiVersion: "2025-02-24.acacia" });
  return _stripe;
}

// ── Plan → Stripe Price ID mapping ───────────────────────────────────────────
// Set these in your .env via the Dashboard or `stripe prices create` CLI.
// Free plan has no Stripe price (no checkout needed).

export function getStripePriceId(planId: string): string | null {
  const map: Record<string, string | undefined> = {
    starter: process.env.STRIPE_PRICE_STARTER,
    pro:     process.env.STRIPE_PRICE_PRO,
  };
  return map[planId] ?? null;
}

// ── Plan amounts in USD cents (fallback if env Price IDs missing) ─────────────

export const PLAN_AMOUNTS_CENTS: Record<string, number> = {
  starter: 4900,   // $49.00
  pro:     14900,  // $149.00
};

export const PLAN_NAMES: Record<string, string> = {
  starter: "Clara AI Starter",
  pro:     "Clara AI Pro",
};

// ── Webhook secret ────────────────────────────────────────────────────────────

export function getStripeWebhookSecret(): string {
  const s = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  return s;
}

// ── App base URL helper ───────────────────────────────────────────────────────

export function appUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
