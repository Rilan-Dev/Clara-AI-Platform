import { NextRequest } from "next/server";
import { listProvidersHandler } from "@/modules/ai-governance/api/providers";

export async function GET(req: NextRequest) {
  return listProvidersHandler(req);
}
