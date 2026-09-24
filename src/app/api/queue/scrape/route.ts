import { handleCallback } from "@vercel/queue";
import { handleScrapeMessage } from "@/modules/cloud-jobs/handlers";

// Vercel Queues consumer. The job logic lives in cloud-jobs/handlers.ts so
// the local (Docker) transport runs exactly the same code.
export const maxDuration = 60;

const callback = handleCallback(async (message: unknown) => {
  await handleScrapeMessage(message);
}, { visibilityTimeoutSeconds: 60 });

export async function POST(request: Request) {
  return callback(request);
}
