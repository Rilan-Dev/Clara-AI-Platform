import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { markOutboxFailed } from "@/modules/events/outbox-db";

function authorized(req: NextRequest): boolean {
  const expected = process.env.WORKER_SECRET;
  return Boolean(expected) && req.headers.get("authorization") === `Bearer ${expected}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureMigrated();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  await markOutboxFailed(id, typeof body?.error === "string" ? body.error : "RabbitMQ publication failed");
  return NextResponse.json({ ok: true });
}
