import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { getPlatformDefaultTheme, setPlatformDefaultTheme } from "@/lib/theme-settings";
import { normalizeThemeMode, PLATFORM_THEME_KEY } from "@/lib/theme";

// Settings → Appearance backing API.
//
//   GET  — current platform default theme mode (super admin; the value every
//          new visitor's first paint uses).
//   PUT  — persist a new default. Takes effect for new visitors on their next
//          page load WITHOUT a server restart: the root layout re-reads the
//          setting on every request (5s in-process cache).
//
// Deliberately NOT added to the env route's MANAGED_KEYS confirmation-token
// flow: this value is not a secret and a mistaken click is trivially undone,
// so a plain authenticated write keeps the UX simple. Middleware already
// locks /api/platform/* behind a session token before this handler runs.

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const defaultTheme = await getPlatformDefaultTheme();
    return NextResponse.json(
      { key: PLATFORM_THEME_KEY, defaultTheme },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const body = (await req.json().catch(() => null)) as { defaultTheme?: unknown } | null;
    const mode = normalizeThemeMode(body?.defaultTheme);
    if (!mode) {
      return NextResponse.json(
        { error: "defaultTheme must be one of: light, dark, system." },
        { status: 400 },
      );
    }
    await setPlatformDefaultTheme(mode, auth.user.id);
    return NextResponse.json({
      ok: true,
      key: PLATFORM_THEME_KEY,
      defaultTheme: mode,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
