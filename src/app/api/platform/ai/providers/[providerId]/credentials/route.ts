import { NextRequest } from "next/server";
import { putProviderCredentialsHandler } from "@/modules/ai-governance/api/providers";

type Params = { params: Promise<{ providerId: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const { providerId } = await params;
  return putProviderCredentialsHandler(req, providerId);
}
