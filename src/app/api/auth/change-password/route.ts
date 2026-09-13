import { NextRequest, NextResponse } from "next/server";
import { changePasswordHandler } from "@/modules/auth/api/password-reset";

export async function POST(req: NextRequest): Promise<NextResponse> {
  return changePasswordHandler(req);
}
