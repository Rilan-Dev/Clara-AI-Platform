/**
 * PATCH   /api/embed/design   — remote widget design update via API key
 * OPTIONS /api/embed/design   — CORS preflight
 * GET     /api/embed/design   — read current design config (same as /config but design-only)
 * ─────────────────────────────────────────────────────────────────────────────
 * Allows the site owner to update the visual appearance of the Clara widget
 * directly from their own codebase (React, Vue, Next.js, vanilla JS, etc.)
 * without accessing the Clara admin panel.
 *
 * SECURITY RULES (strictly enforced):
 *   1. API key must be valid, active, and belong to an active KB.
 *   2. Key's design_edit_enabled flag must be TRUE (admin opt-in per key).
 *   3. Origin must be in the key's allowedOrigins list (or list is empty).
 *   4. Hourly rate limit applies (same as /api/embed/chat).
 *   5. Only widget_* and colour fields are accepted — AI behaviour fields
 *      (systemPrompt, rules, temperature, etc.) are NEVER accepted here.
 *      Any extra field sent is silently ignored.
 *   6. All values are validated and clamped to safe ranges.
 *
 * This endpoint CANNOT change: systemPrompt, rules, outOfScopeReply,
 * temperature, maxTokens, voiceId, strictMode, citeSources, or any other
 * AI behaviour field. Those remain admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import {
  validateEmbedDesignRequest,
  buildCorsHeaders,
  handlePreflight,
} from "@/modules/embed/core/validate-embed";
import { getAssistantConfig } from "@/modules/knowledge-bases/core/db";
import { pool } from "@/lib/db";

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  return handlePreflight(req);
}

// ── Allowed design fields whitelist ──────────────────────────────────────────
// ONLY these fields can be touched via the embed Design API.
// This list is the security boundary — anything not here is ignored.

const ALLOWED_FIELDS = new Set([
  // Colours
  "primaryColour",
  "accentColour",
  "launcherColour",
  // Layout
  "widgetTheme",
  "widgetPosition",
  "widgetButtonSize",
  "widgetBorderRadius",
  "widgetFontFamily",
  "widgetChatHeight",
  "widgetShowBranding",
  "widgetLauncherLabel",
  // Identity
  "assistantName",
  "welcomeMessage",
  "avatarUrl",
  // Full design control ← NEW
  "widgetMode",
  "customCss",
  "customLauncherSvg",
  "customHeaderHtml",
  "customPoweredBy",
]);

// ── CSS / HTML / SVG safety sanitizer ────────────────────────────────────────
// Server-side guard: strip dangerous patterns before persisting.
// Never evaluates the strings — purely regex-based deny-listing.

const DANGEROUS_CSS_RE = /(javascript\s*:|expression\s*\(|behavior\s*:|@import|url\s*\(\s*(?!https:|data:image\/))/gi;
const DANGEROUS_HTML_RE = /(<script|<iframe|<object|<embed|on\w+\s*=|javascript:)/gi;
const DANGEROUS_SVG_RE  = /(<script|on\w+\s*=|javascript:|<foreignObject|<use[^>]+href\s*=\s*["'](?!#))/gi;

function sanitizeCss(raw: string): string {
  return raw.replace(DANGEROUS_CSS_RE, "/* blocked */").slice(0, 32_000);
}
function sanitizeHtml(raw: string): string {
  return raw.replace(DANGEROUS_HTML_RE, "<!-- blocked -->").slice(0, 500);
}
function sanitizeSvg(raw: string): string {
  // Must start with <svg and end with </svg>
  const trimmed = raw.trim();
  if (!/^<svg[\s>]/i.test(trimmed) || !/<\/svg>$/i.test(trimmed)) return "";
  return trimmed.replace(DANGEROUS_SVG_RE, "").slice(0, 4_000);
}

// ── Sanitize & validate incoming body ────────────────────────────────────────

type DesignPatch = Record<string, unknown>;

function sanitize(raw: Record<string, unknown>): { patch: DesignPatch; rejected: string[] } {
  const patch: DesignPatch = {};
  const rejected: string[] = [];

  for (const [key, val] of Object.entries(raw)) {
    if (!ALLOWED_FIELDS.has(key)) {
      rejected.push(key);
      continue;
    }

    switch (key) {
      case "primaryColour":
      case "accentColour":
      case "launcherColour":
        if (typeof val === "string" && /^#[0-9a-fA-F]{3,8}$/.test(val.trim())) {
          patch[key] = val.trim().toLowerCase();
        }
        break;

      case "widgetTheme":
        if (val === "light" || val === "dark") patch[key] = val;
        break;

      case "widgetPosition":
        if (val === "bottom-right" || val === "bottom-left") patch[key] = val;
        break;

      case "widgetButtonSize":
        { const n = Number(val);
          if (Number.isFinite(n)) patch[key] = Math.min(Math.max(n, 40), 80); }
        break;

      case "widgetBorderRadius":
        { const n = Number(val);
          if (Number.isFinite(n)) patch[key] = Math.min(Math.max(n, 0), 40); }
        break;

      case "widgetChatHeight":
        { const n = Number(val);
          if (Number.isFinite(n)) patch[key] = Math.min(Math.max(n, 300), 900); }
        break;

      case "widgetFontFamily":
        if (typeof val === "string" && val.trim().length < 200) patch[key] = val.trim();
        break;

      case "widgetShowBranding":
        patch[key] = Boolean(val);
        break;

      case "widgetLauncherLabel":
        patch[key] = val && typeof val === "string" && val.trim() ? val.trim().slice(0, 80) : null;
        break;

      case "assistantName":
        if (typeof val === "string" && val.trim()) patch[key] = val.trim().slice(0, 80);
        break;

      case "welcomeMessage":
        if (typeof val === "string" && val.trim()) patch[key] = val.trim().slice(0, 500);
        break;

      case "avatarUrl":
        if (typeof val === "string") {
          const url = val.trim();
          if (!url || /^https:\/\/.+/.test(url)) patch[key] = url || null;
        }
        break;

      case "widgetMode":
        if (val === "floating" || val === "inline" || val === "headless") patch[key] = val;
        break;

      case "customCss":
        if (typeof val === "string") patch[key] = val.trim() ? sanitizeCss(val) : null;
        else if (val === null) patch[key] = null;
        break;

      case "customLauncherSvg":
        if (typeof val === "string") {
          const cleaned = sanitizeSvg(val);
          patch[key] = cleaned || null;
        } else if (val === null) patch[key] = null;
        break;

      case "customHeaderHtml":
        if (typeof val === "string") patch[key] = val.trim() ? sanitizeHtml(val) : null;
        else if (val === null) patch[key] = null;
        break;

      case "customPoweredBy":
        if (typeof val === "string") patch[key] = val.trim().slice(0, 120) || null;
        else if (val === null) patch[key] = null;
        break;
    }
  }

  return { patch, rejected };
}

// ── Column map (camelCase → snake_case) ──────────────────────────────────────

  const COL_MAP: Record<string, string> = {
    primaryColour:       "primary_colour",
    accentColour:        "accent_colour",
    launcherColour:      "launcher_colour",
    widgetTheme:         "widget_theme",
  widgetPosition:      "widget_position",
  widgetButtonSize:    "widget_button_size",
  widgetBorderRadius:  "widget_border_radius",
  widgetFontFamily:    "widget_font_family",
  widgetChatHeight:    "widget_chat_height",
  widgetShowBranding:  "widget_show_branding",
  widgetLauncherLabel: "widget_launcher_label",
  assistantName:       "assistant_name",
  welcomeMessage:      "welcome_message",
  avatarUrl:           "avatar_url",
  widgetMode:          "widget_mode",
  customCss:           "custom_css",
  customLauncherSvg:   "custom_launcher_svg",
  customHeaderHtml:    "custom_header_html",
  customPoweredBy:     "custom_powered_by",
};

// ── GET — read current design config ─────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const validation = await validateEmbedDesignRequest(req);
    if (!validation.ok) return validation.response;
    const { ctx } = validation;

    const origin = req.headers.get("origin");
    const corsHeaders = buildCorsHeaders(origin, ctx.allowedOrigins);

    const config = await getAssistantConfig(ctx.kbId);
    if (!config) {
      return NextResponse.json({ error: "Config not found" }, { status: 404, headers: corsHeaders });
    }

    return NextResponse.json(
      {
        assistantName:       config.assistantName,
        avatarUrl:           config.avatarUrl,
        welcomeMessage:      config.welcomeMessage,
         primaryColour:       config.primaryColour,
         accentColour:        config.accentColour,
         launcherColour:      config.launcherColour,
         widgetTheme:         config.widgetTheme,
        widgetPosition:      config.widgetPosition,
        widgetButtonSize:    config.widgetButtonSize,
        widgetBorderRadius:  config.widgetBorderRadius,
        widgetFontFamily:    config.widgetFontFamily,
        widgetChatHeight:    config.widgetChatHeight,
        widgetShowBranding:  config.widgetShowBranding,
        widgetLauncherLabel: config.widgetLauncherLabel,
        widgetMode:          config.widgetMode,
        customCss:           config.customCss,
        customLauncherSvg:   config.customLauncherSvg,
        customHeaderHtml:    config.customHeaderHtml,
        customPoweredBy:     config.customPoweredBy,
      },
      { headers: { ...corsHeaders, "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[embed/design] GET:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ── PATCH — apply design update ───────────────────────────────────────────────

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const validation = await validateEmbedDesignRequest(req);
    if (!validation.ok) return validation.response;
    const { ctx } = validation;

    const origin = req.headers.get("origin");
    const corsHeaders = buildCorsHeaders(origin, ctx.allowedOrigins);

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400, headers: corsHeaders });
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400, headers: corsHeaders });
    }

    const { patch, rejected } = sanitize(body);

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        {
          error:   "No valid design fields provided.",
          allowed: [...ALLOWED_FIELDS],
          ...(rejected.length ? { rejected } : {}),
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // Build dynamic UPDATE statement (only changed fields)
    const sets:   string[]  = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(patch)) {
      const col = COL_MAP[key];
      if (!col) continue;
      sets.push(`${col} = $${idx++}`);
      params.push(val);
    }

    // Always stamp design_updated_at
    sets.push(`design_updated_at = now()`);
    params.push(ctx.kbId);

    const result = await pool.query<Record<string, unknown>>(
      `UPDATE assistant_configs
         SET ${sets.join(", ")}
        WHERE kb_id = $${idx}
        RETURNING primary_colour, accent_colour, launcher_colour,
                  widget_theme, widget_position, widget_button_size,
                 widget_border_radius, widget_font_family, widget_chat_height,
                 widget_show_branding, widget_launcher_label,
                 widget_mode, custom_css, custom_launcher_svg,
                 custom_header_html, custom_powered_by,
                 assistant_name, welcome_message, avatar_url,
                 design_updated_at`,
      params
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: "KB config not found" }, { status: 404, headers: corsHeaders });
    }

    const row = result.rows[0];
    return NextResponse.json(
      {
        updated: true,
        appliedFields: Object.keys(patch),
        ...(rejected.length ? { rejectedFields: rejected, hint: "Rejected fields are not allowed via the Design API. Only widget appearance fields may be changed this way." } : {}),
        design: {
          assistantName:       row.assistant_name,
          avatarUrl:           row.avatar_url,
          welcomeMessage:      row.welcome_message,
          primaryColour:       row.primary_colour,
          accentColour:        row.accent_colour,
          launcherColour:      row.launcher_colour,
          widgetTheme:         row.widget_theme,
          widgetPosition:      row.widget_position,
          widgetButtonSize:    row.widget_button_size,
          widgetBorderRadius:  row.widget_border_radius,
          widgetFontFamily:    row.widget_font_family,
          widgetChatHeight:    row.widget_chat_height,
          widgetShowBranding:  row.widget_show_branding,
          widgetLauncherLabel: row.widget_launcher_label,
          widgetMode:          row.widget_mode,
          customCss:           row.custom_css,
          customLauncherSvg:   row.custom_launcher_svg,
          customHeaderHtml:    row.custom_header_html,
          customPoweredBy:     row.custom_powered_by,
          designUpdatedAt:     row.design_updated_at,
        },
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("[embed/design] PATCH:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
