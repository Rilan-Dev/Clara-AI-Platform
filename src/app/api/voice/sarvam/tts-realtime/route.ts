import { experimental_upgradeWebSocket } from "@vercel/functions";
import { handleSarvamTtsRealtimeConnection } from "@/../scripts/sarvam-tts-relay.mjs";

export const runtime = "nodejs";
export const maxDuration = 300;

export function GET(request: Request) {
  return experimental_upgradeWebSocket((ws) => {
    void handleSarvamTtsRealtimeConnection(ws, { url: request.url });
  });
}
