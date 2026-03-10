import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "healthy",
    app: "clara-techvision",
    timestamp: new Date().toISOString(),
  });
}
