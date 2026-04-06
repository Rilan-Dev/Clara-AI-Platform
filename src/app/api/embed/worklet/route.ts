import { NextRequest, NextResponse } from "next/server";

const WORKLET_SOURCE = `class AudioRecorderWorklet extends AudioWorkletProcessor {
  process(inputs, _outputs, _parameters) {
    void _outputs;
    void _parameters;
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0];
      const int16Array = new Int16Array(channelData.length);
      for (let i = 0; i < channelData.length; i++) {
        const s = Math.max(-1, Math.min(1, channelData[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(int16Array);
    }
    return true;
  }
}

registerProcessor('audio-recorder-worklet', AudioRecorderWorklet);
`;

function buildHeaders(origin: string | null) {
  return {
    "Content-Type": "application/javascript; charset=utf-8",
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, X-Requested-With",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    Vary: "Origin",
  };
}

export function OPTIONS(req: NextRequest): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: buildHeaders(req.headers.get("origin")),
  });
}

export function GET(req: NextRequest): NextResponse {
  return new NextResponse(WORKLET_SOURCE, {
    status: 200,
    headers: buildHeaders(req.headers.get("origin")),
  });
}
