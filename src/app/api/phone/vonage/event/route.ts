/**
 * POST /api/phone/vonage/event
 * Vonage call event webhook — acknowledge only, no AI logic.
 */
import { NextResponse } from "next/server";

export async function POST(): Promise<NextResponse> {
  return NextResponse.json({ ok: true });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true });
}
