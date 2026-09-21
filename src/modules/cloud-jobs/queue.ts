import { send } from "@vercel/queue";

export const CLOUD_JOB_TOPICS = {
  ingest: "clara-ingest",
  crawl: "clara-crawl",
  retry: "clara-retry",
} as const;

export type CloudJobKind = keyof typeof CLOUD_JOB_TOPICS;

export type CloudJobEnvelope = {
  jobId: string;
  kind: CloudJobKind;
  payload?: Record<string, unknown>;
};

export async function enqueueCloudJob(
  kind: CloudJobKind,
  jobId: string,
  payload: Record<string, unknown> = {},
  options: { delaySeconds?: number; retentionSeconds?: number } = {},
): Promise<{ messageId: string | null }> {
  if (!jobId.trim()) throw new Error("Cloud job id is required");

  return send(
    CLOUD_JOB_TOPICS[kind],
    { jobId, kind, payload } satisfies CloudJobEnvelope,
    {
      idempotencyKey: `clara:${kind}:${jobId}`,
      delaySeconds: options.delaySeconds,
      retentionSeconds: options.retentionSeconds ?? 7 * 24 * 60 * 60,
    },
  );
}

export const enqueueIngestJob = (jobId: string) =>
  enqueueCloudJob("ingest", jobId);

export const enqueueCrawlJob = (
  jobId: string,
  payload: Record<string, unknown>,
  options?: { delaySeconds?: number },
) => enqueueCloudJob("crawl", jobId, payload, options);

export const enqueueRetryJob = (
  jobId: string,
  payload: Record<string, unknown>,
  options?: { delaySeconds?: number },
) => enqueueCloudJob("retry", jobId, payload, options);
