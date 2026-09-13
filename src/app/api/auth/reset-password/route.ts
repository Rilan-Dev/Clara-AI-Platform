import { NextRequest, NextResponse } from "next/server";
import { resetPasswordHandler } from "@/modules/auth/api/password-reset";

export async function POST(req: NextRequest): Promise<NextResponse> {
  return resetPasswordHandler(req);
}
