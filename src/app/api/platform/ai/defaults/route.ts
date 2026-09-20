import { NextRequest } from "next/server";
import { getDefaultsHandler, putDefaultsHandler } from "@/modules/ai-governance/api/providers";

export async function GET(req: NextRequest) {
  return getDefaultsHandler(req);
}

export async function PUT(req: NextRequest) {
  return putDefaultsHandler(req);
}
