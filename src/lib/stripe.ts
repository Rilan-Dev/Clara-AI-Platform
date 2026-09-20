import Stripe from "stripe";

let _stripe: Stripe | null = null;
let _stripeKey: string | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  if (_stripe && _stripeKey === key) return _stripe;
  _stripe = new Stripe(key, { apiVersion: "2025-02-24.acacia" });
  _stripeKey = key;
  return _stripe;
}

export function getStripePriceId(planId: string): string | null {
  return ({ starter: process.env.STRIPE_PRICE_STARTER, pro: process.env.STRIPE_PRICE_PRO } as Record<string,string|undefined>)[planId] ?? null;
}

export const PLAN_AMOUNTS_CENTS: Record<string, number> = { starter: 4900, pro: 14900 };
export const PLAN_NAMES: Record<string, string> = { starter: "Clara AI Starter", pro: "Clara AI Pro" };

export function getStripeWebhookSecret(): string {
  const value = process.env.STRIPE_WEBHOOK_SECRET;
  if (!value) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  return value;
}

export function appUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
