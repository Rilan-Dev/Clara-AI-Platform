import Razorpay from "razorpay";
import { createHmac } from "node:crypto";

let _razorpay: Razorpay | null = null;
let _razorpayKeyId: string | null = null;
let _razorpayKeySecret: string | null = null;

export function getRazorpay(): Razorpay {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required");
  if (_razorpay && _razorpayKeyId === keyId && _razorpayKeySecret === keySecret) return _razorpay;
  _razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
  _razorpayKeyId = keyId; _razorpayKeySecret = keySecret;
  return _razorpay;
}

export const PLAN_AMOUNTS_INR_PAISE: Record<string, number> = { starter: 400000, pro: 1200000 };
export const PLAN_AMOUNTS_INR: Record<string, number> = { starter: 4000, pro: 12000 };
export const PLAN_NAMES_INR: Record<string, string> = { starter: "Clara AI Starter (Monthly)", pro: "Clara AI Pro (Monthly)" };

export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET ?? "";
  return createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex") === signature;
}
export function verifyRazorpayWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  return createHmac("sha256", secret).update(rawBody).digest("hex") === signature;
}
