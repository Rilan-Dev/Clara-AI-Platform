import { NextRequest } from "next/server";
import { meHandler } from "@/modules/auth/api/auth";
export async function GET(req: NextRequest) { return meHandler(req); }
