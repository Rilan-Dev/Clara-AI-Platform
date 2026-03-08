import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const result = await query(
      `SELECT id, name, description, price_usd, max_kbs, max_docs_per_kb,
              max_req_day, max_storage_mb, voice_enabled, api_access,
              custom_branding, sso_enabled, analytics_level,
              priority_support, features
       FROM subscription_plans
       ORDER BY price_usd ASC`
    );
    return NextResponse.json({ plans: result.rows });
  } catch (err) {
    console.error("[GET /api/subscriptions/plans]", err);
    return NextResponse.json({ error: "Failed to fetch plans" }, { status: 500 });
  }
}
