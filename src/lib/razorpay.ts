/**
 * src/lib/razorpay.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Razorpay SDK singleton + INR pricing + signature verification helpers.
 *
 * Environment variables (all server-side only):
 *   RAZORPAY_KEY_ID            rzp_test_…  (public key, also sent to browser)
 *   RAZORPAY_KEY_SECRET        …           (server-only secret)
 *   RAZORPAY_WEBHOOK_SECRET    …           (from Razorpay Dashboard webhooks)
 *   NEXT_PUBLIC_RAZORPAY_KEY_ID            (browser-safe copy of KEY_ID)
 */

import Razorpay from "razorpay";
import { createHmac } from "node:crypto";

// ── Singleton ─────────────────────────────────────────────────────────────────

let _razorpay: Razorpay | null = null;

export function getRazorpay(): Razorpay {
  if (_razorpay) return _razorpay;
  const keyId     = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required");
  }
  _razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return _razorpay;
}

// ── INR pricing ───────────────────────────────────────────────────────────────
// Razorpay accepts amounts in paise (1 INR = 100 paise).
// Exchange rate reference: ~₹83/USD (adjust for production).

export const PLAN_AMOUNTS_INR_PAISE: Record<string, number> = {
  starter: 400000,   // ₹4,000
  pro:     1200000,  // ₹12,000
};

export const PLAN_AMOUNTS_INR: Record<string, number> = {
  starter: 4000,
  pro:     12000,
};

export const PLAN_NAMES_INR: Record<string, string> = {
  starter: "Clara AI Starter (Monthly)",
  pro:     "Clara AI Pro (Monthly)",
};

// ── Checkout payment signature verification ───────────────────────────────────
// Called after Razorpay Checkout.js returns a successful payment.
// HMAC-SHA256( orderId + "|" + paymentId, keySecret )

export function verifyRazorpaySignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string
): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET ?? "";
  const body   = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return expected === razorpaySignature;
}

// ── Webhook signature verification ───────────────────────────────────────────
// HMAC-SHA256( rawBody, webhookSecret )

export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signature: string
): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return expected === signature;
}
