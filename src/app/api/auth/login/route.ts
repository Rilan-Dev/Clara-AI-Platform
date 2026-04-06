import { NextRequest } from "next/server";
import { loginHandler } from "@/modules/auth/api/auth";
export async function POST(req: NextRequest) { return loginHandler(req); }
