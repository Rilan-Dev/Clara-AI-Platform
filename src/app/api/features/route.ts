import { NextResponse } from "next/server";
import { resolveFeatureAvailability } from "@/lib/feature-availability";

// Per-deployment read only. Intentionally contains no credentials, org-specific
// state or environment override values. Never cache across deployment targets.
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return NextResponse.json(
    { features: resolveFeatureAvailability() },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
