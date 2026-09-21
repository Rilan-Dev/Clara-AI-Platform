import { handleCallback } from "@vercel/queue";
import { processRetryJobData, type CloudRetryJob } from "@/modules/cloud-jobs/process-retry";

export const maxDuration = 60;

export const POST = handleCallback(async (message: CloudRetryJob) => {
  if (!message?.retryRecordId || !message.scrapeUrlId || !message.sessionId) {
    throw new Error("Invalid retry queue message");
  }
  await processRetryJobData(message);
}, { visibilityTimeoutSeconds: 60 });
