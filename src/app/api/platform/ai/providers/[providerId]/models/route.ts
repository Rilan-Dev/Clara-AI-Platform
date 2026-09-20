import { NextRequest } from "next/server";
import { listProviderModelsHandler, patchProviderModelHandler } from "@/modules/ai-governance/api/providers";

type Params = { params: Promise<{ providerId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { providerId } = await params;
  return listProviderModelsHandler(req, providerId);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { providerId } = await params;
  return patchProviderModelHandler(req, providerId);
}
