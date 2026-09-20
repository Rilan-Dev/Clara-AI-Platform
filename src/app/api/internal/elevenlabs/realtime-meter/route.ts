import { NextRequest } from "next/server";
import { postElevenLabsRealtimeMeter } from "@/modules/voice-core/api/elevenlabs/realtime-init";

/** Relay-only usage metering (HMAC-guarded inside the handler). */
export async function POST(request: NextRequest) {
  return postElevenLabsRealtimeMeter(request);
}
