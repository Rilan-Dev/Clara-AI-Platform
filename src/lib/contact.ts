/**
 * src/lib/contact.ts
 * Public "Request a demo" form → support inbox.
 *
 * The contact page used to fake success without sending anything. This
 * handler validates the lead, rate-limits per IP, and delivers it through the
 * platform email provider to CLARA_SUPPORT_EMAIL. The visitor only sees
 * success when delivery actually succeeded.
 */

import { NextRequest, NextResponse } from "next/server";
import { sendPlatformEmail } from "@/lib/email";
import { hit, rateLimitResponse } from "@/lib/rate-limit";

export const CONTACT_RATE = { limit: 5, windowMs: 60 * 60 * 1000 };

const PLANS = new Set(["starter", "pro", "enterprise"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ContactLead = {
  name: string;
  email: string;
  company: string;
  plan: string;
  message: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function field(body: Record<string, unknown>, key: string, max: number): string {
  const value = body[key];
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Returns the cleaned lead, or an error message for the visitor. */
export function parseContactLead(body: Record<string, unknown>): ContactLead | { error: string } {
  const lead: ContactLead = {
    name: field(body, "name", 120),
    email: field(body, "email", 200),
    company: field(body, "company", 160),
    plan: field(body, "plan", 20),
    message: field(body, "message", 4000),
  };
  if (!lead.name) return { error: "Please enter your name." };
  if (!EMAIL_RE.test(lead.email)) return { error: "Please enter a valid work email." };
  if (!lead.company) return { error: "Please enter your company." };
  if (!PLANS.has(lead.plan)) lead.plan = "pro";
  return lead;
}

export function renderContactEmail(lead: ContactLead): { subject: string; html: string } {
  const row = (label: string, value: string) =>
    `<p><strong>${label}:</strong> ${escapeHtml(value) || "—"}</p>`;
  return {
    subject: `New demo request: ${lead.company} (${lead.plan})`,
    html: [
      "<p>A visitor requested a demo from the Clara AI contact page.</p>",
      row("Name", lead.name),
      row("Email", lead.email),
      row("Company", lead.company),
      row("Interested plan", lead.plan),
      `<p><strong>Message:</strong></p><p style="white-space:pre-wrap">${escapeHtml(lead.message) || "—"}</p>`,
    ].join("\n"),
  };
}

export async function postContact(request: NextRequest): Promise<NextResponse> {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip") ?? "unknown";
  const gate = hit(`contact:ip:${ip}`, CONTACT_RATE.limit, CONTACT_RATE.windowMs);
  if (!gate.allowed) {
    const rl = rateLimitResponse(gate.retryAfterSec, "Too many messages. Please try again later.");
    return NextResponse.json(rl.body, { status: rl.status, headers: rl.headers });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  // Honeypot: real visitors never fill the hidden "website" field. Pretend
  // success so bots get no signal.
  if (field(body, "website", 200)) return NextResponse.json({ ok: true });

  const lead = parseContactLead(body);
  if ("error" in lead) return NextResponse.json({ error: lead.error }, { status: 400 });

  const recipient = process.env.CLARA_SUPPORT_EMAIL?.trim();
  if (!recipient) {
    console.error("[contact] CLARA_SUPPORT_EMAIL is not configured — lead not delivered", lead.email);
    return NextResponse.json(
      { error: "Our contact form is temporarily unavailable." },
      { status: 503 },
    );
  }

  const { subject, html } = renderContactEmail(lead);
  const result = await sendPlatformEmail({ to: recipient, subject, html });
  if (!result.sent) {
    console.error("[contact] delivery failed:", result.error ?? "provider rejected message");
    return NextResponse.json(
      { error: "We couldn't send your message. Please try again." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
