import { NextRequest } from "next/server";
import { getProviderHandler, patchProviderHandler } from "@/modules/ai-governance/api/providers";

type Params = { params: Promise<{ providerId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { providerId } = await params;
  return getProviderHandler(req, providerId);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { providerId } = await params;
  return patchProviderHandler(req, providerId);
}
