import { NextRequest, NextResponse } from "next/server";
import {
  getElevenLabsAgentById as getHandler,
  patchElevenLabsAgentById as patchHandler,
  deleteElevenLabsAgentById as deleteHandler,
} from "@/modules/voice-core/api/elevenlabs/agents";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Params): Promise<NextResponse> {
  const { id } = await context.params;
  return getHandler(request, id);
}

export async function PATCH(request: NextRequest, context: Params): Promise<NextResponse> {
  const { id } = await context.params;
  return patchHandler(request, id);
}

export async function DELETE(request: NextRequest, context: Params): Promise<NextResponse> {
  const { id } = await context.params;
  return deleteHandler(request, id);
}
