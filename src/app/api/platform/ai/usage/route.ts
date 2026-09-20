import { NextRequest } from "next/server";
import { getUsageHandler } from "@/modules/ai-governance/api/providers";

export async function GET(req: NextRequest) {
  return getUsageHandler(req);
}
