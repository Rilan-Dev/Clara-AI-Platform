import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  // Mimics the deployed build: a route file exists at the WS relay path.
  // On plain GET it errors (500) like production; the mere EXISTENCE of this
  // file is what makes Next's upgrade resolver claim the path and kill the
  // relay tunnel.
  throw new Error("WS-only path");
}
