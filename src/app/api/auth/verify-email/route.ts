import { NextRequest } from "next/server";
import { verifyEmailHandler } from "@/modules/auth/api/email-verification";
export async function POST(req: NextRequest) { return verifyEmailHandler(req); }
