import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "healthy",
    app: "clara-omen-insurance",
    timestamp: new Date().toISOString(),
  });
}
