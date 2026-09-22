import { handleCallback } from "@vercel/queue";
import { processCrawlJobData, type CloudCrawlJob } from "@/modules/cloud-jobs/process-crawl";

export const maxDuration = 60;

const callback = handleCallback(async (message: CloudCrawlJob) => {
  if (!message?.sessionId || !message.url) throw new Error("Invalid crawl queue message");
  await processCrawlJobData(message);
}, { visibilityTimeoutSeconds: 60 });

export async function POST(request: Request) {
  return callback(request);
}
