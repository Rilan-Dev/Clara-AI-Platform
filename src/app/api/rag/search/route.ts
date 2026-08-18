import { NextRequest } from "next/server";
import { postRagSearch } from "@/modules/assistant/api/rag";

/**
 * Next.js route entrypoint.
 *
 * Keep the optional provider override on postRagSearch for internal callers
 * (such as the public demo/embed flow), but never expose that internal
 * parameter as the second argument of a Next.js route handler. Next.js 15
 * validates route handler signatures and reserves the second argument for
 * RouteContext.
 */
export async function POST(request: NextRequest) {
  return postRagSearch(request);
}
