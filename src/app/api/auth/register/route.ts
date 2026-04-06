import { NextRequest } from "next/server";
import { registerHandler } from "@/modules/auth/api/auth";
export async function POST(req: NextRequest) { return registerHandler(req); }
