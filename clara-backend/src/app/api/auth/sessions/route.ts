import { NextRequest } from "next/server";
import { logoutAllHandler } from "@/modules/auth/api/auth";
// DELETE /api/auth/sessions — revoke all sessions for the authenticated user
export async function DELETE(req: NextRequest) { return logoutAllHandler(req); }
