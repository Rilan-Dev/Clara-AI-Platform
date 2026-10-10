import { errorResponse } from "@/lib/api-contract";
import { seedDatabase } from "@/lib/seed";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST /api/seed — (re)seed the demo platform data. */
export async function POST() {
  try {
    const result = await seedDatabase();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return errorResponse(err);
  }
}
