import { NextRequest } from "next/server";
import { postElevenLabsRealtimeInit } from "@/modules/voice-core/api/elevenlabs/realtime-init";

/** Relay-only bootstrap (HMAC-guarded inside the handler). */
export async function POST(request: NextRequest) {
  return postElevenLabsRealtimeInit(request);
}
