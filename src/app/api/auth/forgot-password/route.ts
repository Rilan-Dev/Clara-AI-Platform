import { NextRequest, NextResponse } from "next/server";
import { forgotPasswordHandler } from "@/modules/auth/api/password-reset";

export async function POST(req: NextRequest): Promise<NextResponse> {
  return forgotPasswordHandler(req);
}
