import { experimental_upgradeWebSocket } from "@vercel/functions";
import { handleSarvamRealtimeConnection } from "@/../scripts/sarvam-relay.mjs";

export const runtime = "nodejs";
export const maxDuration = 300;

export function GET(request: Request) {
  return experimental_upgradeWebSocket((ws) => {
    void handleSarvamRealtimeConnection(ws, { url: request.url });
  });
}
