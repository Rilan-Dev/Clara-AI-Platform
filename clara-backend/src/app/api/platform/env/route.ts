/**
 * GET /api/platform/env           — list all settings (secrets masked)
 * GET /api/platform/env?token=1&key=X&value=Y — generate confirmation token
 * POST /api/platform/env          — update a setting (requires token)
 */
import { NextRequest, NextResponse } from "next/server";
import crypto                        from "node:crypto";
import { ensureMigrated }            from "@/lib/db/migrate";
import {
  getPlatformEnvSettings,
  setPlatformEnvSetting,
}                                    from "@/modules/phone/core/db";

const CONFIRM_SECRET = process.env.PLATFORM_CONFIRM_SECRET
  ?? process.env.NEXTAUTH_SECRET
  ?? "clara-platform-confirm-secret";
const TOKEN_TTL_MS = 5 * 60 * 1000;

function buildToken(key: string, value: string, ts: number): string {
  return crypto
    .createHmac("sha256", CONFIRM_SECRET)
    .update(`${key}:${value}:${ts}`)
    .digest("hex");
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { searchParams } = new URL(req.url);

    // Token generation mode — called by UI before submitting a change
    if (searchParams.get("token") === "1") {
      const key   = searchParams.get("key")   ?? "";
      const value = searchParams.get("value") ?? "";
      const ts    = Date.now();
      return NextResponse.json({
        confirmation_token: buildToken(key, value, ts),
        timestamp:          ts,
        expires_in_ms:      TOKEN_TTL_MS,
      });
    }

    // List mode — return all settings with secrets masked
    const settings = await getPlatformEnvSettings();
    const safe = settings.map(s => ({
      key:             s.key,
      value:           s.isSecret ? (s.value ? "●●●●●●●●" : "") : s.value,
      isSet:           Boolean(s.value),
      description:     s.description,
      category:        s.category,
      isSecret:        s.isSecret,
      requiresRestart: s.requiresRestart,
      updatedAt:       s.updatedAt,
    }));
    return NextResponse.json({ settings: safe });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const body = await req.json() as {
      key?: string; value?: string;
      confirmation_token?: string; timestamp?: number;
    };

    if (!body.key || body.value === undefined) {
      return NextResponse.json({ error: "key and value are required" }, { status: 400 });
    }

    // Verify confirmation token — prevents accidental changes + CSRF
    const ts = Number(body.timestamp ?? 0);
    if (!body.confirmation_token || !ts) {
      return NextResponse.json(
        { error: "confirmation_token and timestamp are required." },
        { status: 400 }
      );
    }

    if (Math.abs(Date.now() - ts) > TOKEN_TTL_MS) {
      return NextResponse.json(
        { error: "Confirmation token expired (>5 min). Please re-confirm." },
        { status: 400 }
      );
    }

    const expected = buildToken(body.key, body.value, ts);
    const provided = body.confirmation_token.padEnd(64, "0").slice(0, 64);
    let valid = false;
    try {
      valid = crypto.timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(provided, "hex")
      );
    } catch { valid = false; }

    if (!valid) {
      return NextResponse.json({ error: "Invalid confirmation token." }, { status: 403 });
    }

    // Persist + apply to process.env immediately
    await setPlatformEnvSetting(body.key, body.value, null);
    console.log(`[platform/env] ${body.key} updated`);
    return NextResponse.json({ ok: true, key: body.key, updatedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
