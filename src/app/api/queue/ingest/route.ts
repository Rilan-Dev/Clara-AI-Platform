import { handleCallback } from "@vercel/queue";
import { processJobById } from "@/modules/knowledge-bases/worker/ingest-worker";

export const maxDuration = 60;

const callback = handleCallback(async (message: { jobId?: string }) => {
  if (!message?.jobId) throw new Error("Invalid ingest queue message: jobId is required");
  const result = await processJobById(message.jobId);
  if (result.status === "error") throw new Error(result.error);
});

export async function POST(request: Request) {
  return callback(request);
}
