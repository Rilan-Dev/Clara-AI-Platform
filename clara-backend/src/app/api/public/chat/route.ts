import { NextRequest, NextResponse } from "next/server";
import { POST as embeddedChat } from "@/app/api/embed/chat/route";
import { isPublicSessionToken } from "@/modules/embed/core/public-token";

/**
 * Published-page chat is independent of the optional third-party embed widget.
 * This check only selects the credential family: the downstream handler MUST
 * still validate the signed public-session token, its expiry, deployment,
 * KB binding, plan quota and public access on every request.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!isPublicSessionToken(token)) {
    return NextResponse.json(
      { error: "A published-agent session is required." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  return embeddedChat(request);
}
