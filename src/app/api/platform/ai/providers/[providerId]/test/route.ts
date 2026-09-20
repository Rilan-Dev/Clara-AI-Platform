import { NextRequest } from "next/server";
import { testProviderHandler } from "@/modules/ai-governance/api/providers";

type Params = { params: Promise<{ providerId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { providerId } = await params;
  return testProviderHandler(req, providerId);
}
