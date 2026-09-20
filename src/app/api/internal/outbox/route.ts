import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { claimOutboxEvents } from "@/modules/events/outbox-db";

function authorized(req: NextRequest): boolean {
  const expected = process.env.WORKER_SECRET;
  if (!expected) return false;
  return req.headers.get("authorization") === `Bearer ${expected}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureMigrated();

  const requested = Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);
  const events = await claimOutboxEvents(Number.isFinite(requested) ? requested : 20);

  return NextResponse.json({
    events: events.map((event) => ({
      id: event.id,
      type: event.event_type,
      aggregateType: event.aggregate_type,
      aggregateId: event.aggregate_id,
      routingKey: event.routing_key,
      payload: event.payload,
      attempts: event.attempts,
      createdAt: event.created_at,
    })),
  });
}
