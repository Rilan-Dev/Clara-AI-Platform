import { NextRequest } from "next/server";
import { meHandler, updateMeHandler } from "@/modules/auth/api/auth";
export async function GET(req: NextRequest) { return meHandler(req); }
export async function PATCH(req: NextRequest) { return updateMeHandler(req); }
