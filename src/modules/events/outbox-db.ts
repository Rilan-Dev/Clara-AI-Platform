import { pool, type PoolClient } from "@/lib/db";

export type OutboxInsert = {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  dedupeKey?: string;
  routingKey: string;
  payload: unknown;
};

export async function insertOutboxEvent(
  client: PoolClient,
  event: OutboxInsert,
): Promise<void> {
  await client.query(
    `INSERT INTO event_outbox
       (id, event_type, aggregate_type, aggregate_id, dedupe_key, routing_key, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
     ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
    [
      event.id,
      event.eventType,
      event.aggregateType,
      event.aggregateId,
      event.dedupeKey ?? null,
      event.routingKey,
      JSON.stringify(event.payload),
    ],
  );
}

type OutboxRow = {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  routing_key: string;
  payload: unknown;
  attempts: number;
  created_at: string;
};

export async function claimOutboxEvents(limit: number): Promise<OutboxRow[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit) || 20, 1), 100);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE event_outbox
       SET status = 'pending', locked_at = NULL
       WHERE status = 'publishing'
         AND locked_at < now() - interval '5 minutes'`,
    );

    const result = await client.query<OutboxRow>(
      `WITH picked AS (
         SELECT id
         FROM event_outbox
         WHERE status = 'pending' AND available_at <= now()
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE event_outbox e
       SET status = 'publishing', locked_at = now(), attempts = attempts + 1
       FROM picked
       WHERE e.id = picked.id
       RETURNING e.id, e.event_type, e.aggregate_type, e.aggregate_id,
                 e.routing_key, e.payload, e.attempts, e.created_at`,
      [safeLimit],
    );
    await client.query("COMMIT");
    return result.rows;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function markOutboxPublished(id: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE event_outbox
     SET status = 'published', published_at = now(), locked_at = NULL, last_error = NULL
     WHERE id = $1 AND status = 'publishing'
     RETURNING id`,
    [id],
  );
  return result.rowCount === 1;
}

export async function markOutboxFailed(id: string, error: string): Promise<void> {
  await pool.query(
    `UPDATE event_outbox
     SET status = CASE WHEN attempts >= 20 THEN 'failed' ELSE 'pending' END,
         available_at = CASE
           WHEN attempts >= 20 THEN available_at
           ELSE now() + LEAST(make_interval(secs => GREATEST(1, POWER(2::double precision, LEAST(attempts, 8)))), interval '10 minutes')
         END,
         locked_at = NULL,
         last_error = LEFT($2, 4000)
     WHERE id = $1 AND status = 'publishing'`,
    [id, error],
  );
}
