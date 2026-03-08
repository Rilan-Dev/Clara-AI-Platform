import { NextRequest } from "next/server";
import { logoutHandler } from "@/modules/auth/api/auth";
export async function POST(req: NextRequest) { return logoutHandler(req); }
