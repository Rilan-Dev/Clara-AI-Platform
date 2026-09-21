import { NextRequest } from "next/server";
import { resendVerificationHandler } from "@/modules/auth/api/email-verification";
export async function POST(req: NextRequest) { return resendVerificationHandler(req); }
