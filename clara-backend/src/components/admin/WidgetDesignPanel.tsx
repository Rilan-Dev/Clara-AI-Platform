"use client";
/**
 * src/components/admin/WidgetDesignPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Live widget design editor — lets you customise every visual aspect of the
 * Clara chat widget from the Deploy tab without touching code.
 *
 * Reads current config via GET /api/kbs/:kbId/config
 * Writes changes via PATCH /api/kbs/:kbId/config
 * Live preview mirrors the real widget using the same CSS logic as clara.js.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronDown, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { LiveCodeEditor } from "@/components/admin/live-code-editor";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";

// ── Types ─────────────────────────────────────────────────────────────────────

type WidgetDesign = {
  // Colours
  primaryColour:  string;
  accentColour:   string;
  launcherColour: string;
  // Widget layout
  widgetTheme:        "light" | "dark";
  widgetPosition:     "bottom-right" | "bottom-left";
  widgetButtonSize:   number;
  widgetBorderRadius: number;
  widgetFontFamily:   string;
  widgetChatHeight:   number;
  widgetShowBranding: boolean;
  widgetLauncherLabel: string;
  // Identity
  assistantName:  string;
  welcomeMessage: string;
  avatarUrl:      string;
  // Full design control
  widgetMode:         "floating" | "inline" | "headless";
  customCss:          string;
  customLauncherSvg:  string;
  customHeaderHtml:   string;
  customPoweredBy:    string;
};

const DEFAULTS: WidgetDesign = {
  primaryColour:       "#6366f1",
  accentColour:        "#818cf8",
  launcherColour:      "#6366f1",
  widgetTheme:         "light",
  widgetPosition:      "bottom-right",
  widgetButtonSize:    56,
  widgetBorderRadius:  20,
  widgetFontFamily:    "system-ui,sans-serif",
  widgetChatHeight:    580,
  widgetShowBranding:  true,
  widgetLauncherLabel: "",
  assistantName:       "Clara",
  welcomeMessage:      "Hi! How can I help you today?",
  avatarUrl:           "",
  widgetMode:          "floating",
  customCss:           "",
  customLauncherSvg:   "",
  customHeaderHtml:    "",
  customPoweredBy:     "Powered by Clara AI",
};

const FONT_OPTIONS = [
  { label: "System UI (default)", value: "system-ui,sans-serif" },
  { label: "Inter", value: "Inter,system-ui,sans-serif" },
  { label: "Poppins", value: "Poppins,system-ui,sans-serif" },
  { label: "Roboto", value: "Roboto,system-ui,sans-serif" },
  { label: "Open Sans", value: "'Open Sans',system-ui,sans-serif" },
  { label: "Lato", value: "Lato,system-ui,sans-serif" },
  { label: "Georgia (serif)", value: "Georgia,serif" },
];

const COLOUR_PATTERN = /^#(?:[0-9a-fA-F]{3,8})$/;

const DESIGN_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    primaryColour: { type: "string", pattern: COLOUR_PATTERN.source },
    accentColour: { type: "string", pattern: COLOUR_PATTERN.source },
    launcherColour: { type: "string", pattern: COLOUR_PATTERN.source },
    widgetTheme: { enum: ["light", "dark"] },
    widgetPosition: { enum: ["bottom-right", "bottom-left"] },
    widgetButtonSize: { type: "number", minimum: 40, maximum: 80 },
    widgetBorderRadius: { type: "number", minimum: 0, maximum: 40 },
    widgetFontFamily: { type: "string" },
    widgetChatHeight: { type: "number", minimum: 300, maximum: 900 },
    widgetShowBranding: { type: "boolean" },
    widgetLauncherLabel: { type: "string" },
    assistantName: { type: "string" },
    welcomeMessage: { type: "string" },
    avatarUrl: { type: "string" },
    widgetMode: { enum: ["floating", "inline", "headless"] },
    customCss: { type: "string" },
    customLauncherSvg: { type: "string" },
    customHeaderHtml: { type: "string" },
    customPoweredBy: { type: "string" },
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function hexOrFallback(value: unknown, fallback: string) {
  return typeof value === "string" && COLOUR_PATTERN.test(value.trim()) ? value.trim() : fallback;
}

function textOrFallback(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function normalizeDesign(input: Partial<WidgetDesign>, base: WidgetDesign = DEFAULTS): WidgetDesign {
  const primaryColour = hexOrFallback(input.primaryColour, base.primaryColour);
  const accentColour = hexOrFallback(input.accentColour, base.accentColour);
  const launcherColour = hexOrFallback(input.launcherColour, primaryColour);

  return {
    primaryColour,
    accentColour,
    launcherColour,
    widgetTheme: input.widgetTheme === "dark" || input.widgetTheme === "light" ? input.widgetTheme : base.widgetTheme,
    widgetPosition: input.widgetPosition === "bottom-left" || input.widgetPosition === "bottom-right" ? input.widgetPosition : base.widgetPosition,
    widgetButtonSize: typeof input.widgetButtonSize === "number" && Number.isFinite(input.widgetButtonSize) ? clamp(input.widgetButtonSize, 40, 80) : base.widgetButtonSize,
    widgetBorderRadius: typeof input.widgetBorderRadius === "number" && Number.isFinite(input.widgetBorderRadius) ? clamp(input.widgetBorderRadius, 0, 40) : base.widgetBorderRadius,
    widgetFontFamily: textOrFallback(input.widgetFontFamily, base.widgetFontFamily),
    widgetChatHeight: typeof input.widgetChatHeight === "number" && Number.isFinite(input.widgetChatHeight) ? clamp(input.widgetChatHeight, 300, 900) : base.widgetChatHeight,
    widgetShowBranding: typeof input.widgetShowBranding === "boolean" ? input.widgetShowBranding : base.widgetShowBranding,
    widgetLauncherLabel: textOrFallback(input.widgetLauncherLabel, base.widgetLauncherLabel),
    assistantName: textOrFallback(input.assistantName, base.assistantName),
    welcomeMessage: textOrFallback(input.welcomeMessage, base.welcomeMessage),
    avatarUrl: textOrFallback(input.avatarUrl, base.avatarUrl),
    widgetMode: input.widgetMode === "inline" || input.widgetMode === "headless" || input.widgetMode === "floating" ? input.widgetMode : base.widgetMode,
    customCss: textOrFallback(input.customCss, base.customCss),
    customLauncherSvg: textOrFallback(input.customLauncherSvg, base.customLauncherSvg),
    customHeaderHtml: textOrFallback(input.customHeaderHtml, base.customHeaderHtml),
    customPoweredBy: textOrFallback(input.customPoweredBy, base.customPoweredBy),
  };
}

function serializeDesign(design: WidgetDesign) {
  return JSON.stringify(design, null, 2);
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <div className="h-px flex-1 bg-white/[0.06]" />
      <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{label}</span>
      <div className="h-px flex-1 bg-white/[0.06]" />
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-white/70">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-white/35">{hint}</p>}
    </div>
  );
}

function ColourInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 cursor-pointer rounded border border-white/10 bg-transparent p-0.5" />
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-sm font-mono text-white/80
          focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 uppercase" />
    </div>
  );
}

function RangeInput({ value, min, max, step = 1, unit = "", onChange }: {
  value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-indigo-500" />
      <span className="w-14 text-right text-sm font-mono text-white/60">{value}{unit}</span>
    </div>
  );
}

// ── Live Preview ──────────────────────────────────────────────────────────────

function WidgetPreview({ d }: { d: WidgetDesign }) {
  const dark    = d.widgetTheme === "dark";
  const bg      = dark ? "#1c1c2a" : "#ffffff";
  const surface = dark ? "#27273b" : "#f5f5fb";
  const txt     = dark ? "#e2e2f0" : "#1a1a2e";
  const sub     = dark ? "#9898b8" : "#6b7280";
  const bdr     = dark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.09)";
  const customPoweredBy = d.customPoweredBy?.trim() || "Powered by Clara AI";
  const hasCustomLauncher = /^<svg[\s>]/i.test(d.customLauncherSvg?.trim() ?? "");
  const launcherColour = d.launcherColour || d.primaryColour;
  const positionRight = d.widgetPosition !== "bottom-left";
  const panelOffset = positionRight ? "mr-4" : "ml-4";

  const fakeMessages = [
    { role: "assistant", text: d.welcomeMessage || "Hi! How can I help?" },
    { role: "user",      text: "What services do you offer?" },
    { role: "assistant", text: "We offer web development, mobile apps, and AI integrations. What can I help you with?" },
  ];

  return (
    <div className={`relative flex h-[520px] rounded-2xl overflow-hidden ${positionRight ? "items-end justify-end" : "items-start justify-start"}`}
      style={{ background: dark ? "#0f0f1a" : "#f0f0f5" }}>
      {/* Simulated page background */}
      <div className="absolute inset-0 opacity-30">
        <div className="p-6 space-y-3">
          {[80, 65, 90, 50].map((w, i) => (
            <div key={i} className="h-3 rounded-full bg-current opacity-20" style={{ width: `${w}%`, color: dark ? "#fff" : "#000" }} />
          ))}
        </div>
      </div>

      {/* Widget panel */}
      <div id="panel" className={`relative ${panelOffset} flex flex-col overflow-hidden shadow-2xl`}
        style={{
          width: 300,
          height: Math.min(d.widgetChatHeight, 440),
          borderRadius: d.widgetBorderRadius,
          background: bg,
          border: `1px solid ${bdr}`,
          fontFamily: d.widgetFontFamily,
          boxShadow: `0 0 0 1px ${d.accentColour}14, 0 24px 60px rgba(0,0,0,0.24)`,
        }}>
        {/* Header */}
        <div id="hdr" className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0"
          style={{ background: d.primaryColour, boxShadow: `inset 0 2px 0 ${d.accentColour}` }}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.2)" }}>
              {d.avatarUrl
                ? /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={d.avatarUrl} className="w-7 h-7 rounded-full object-cover" alt="" />
                : <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round">
                  <rect x="3" y="11" width="18" height="10" rx="2"/>
                  <path d="M9 11V7a3 3 0 0 1 6 0v4"/>
                  <circle cx="9" cy="16" r="1" fill="white" stroke="none"/>
                  <circle cx="15" cy="16" r="1" fill="white" stroke="none"/>
                </svg>}
          </div>
          <span className="text-xs font-semibold text-white truncate flex-1">{d.assistantName || "Clara"}</span>
          {d.customHeaderHtml?.trim() && (
            <div className="max-w-[120px] overflow-hidden rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white">
              <div dangerouslySetInnerHTML={{ __html: d.customHeaderHtml }} />
            </div>
          )}
          <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.18)" }}>
            <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-hidden p-3 space-y-2">
          {fakeMessages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className="text-[11px] leading-relaxed rounded-xl px-2.5 py-1.5 max-w-[85%]"
                style={m.role === "user"
                  ? { background: d.primaryColour, color: "#fff", borderBottomRightRadius: 3 }
                  : { background: surface, color: txt, border: `1px solid ${bdr}`, borderBottomLeftRadius: 3 }}>
                {m.text}
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="flex items-center gap-1.5 px-2.5 py-2 border-t flex-shrink-0"
          style={{ borderColor: bdr, background: bg }}>
          <div className="flex-1 h-7 rounded-lg text-[11px] px-2.5 flex items-center"
            style={{ background: surface, border: `1.5px solid ${d.accentColour}30`, color: sub, boxShadow: `inset 0 0 0 1px ${d.accentColour}12` }}>
            Ask a question…
          </div>
          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: d.primaryColour }}>
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </div>
        </div>

        {/* Branding */}
        {d.widgetShowBranding && (
          <div id="pw" className="text-center py-1.5 flex-shrink-0" style={{ fontSize: 9, color: sub }}>
            {customPoweredBy}
          </div>
        )}
      </div>

      {/* FAB button */}
      <div className={`absolute bottom-4 flex flex-col gap-1.5 ${positionRight ? "right-4 items-end" : "left-4 items-start"}`}>
        {d.widgetLauncherLabel && (
          <div id="launcher-lbl" className="text-xs font-semibold text-white rounded-full px-3 py-1"
            style={{ background: launcherColour, boxShadow: "0 2px 10px rgba(0,0,0,0.22)" }}>
            {d.widgetLauncherLabel}
          </div>
        )}
        <div id="tbtn" className="rounded-full flex items-center justify-center"
          style={{ width: d.widgetButtonSize, height: d.widgetButtonSize, background: launcherColour, boxShadow: "0 4px 16px rgba(0,0,0,0.28)" }}>
          {hasCustomLauncher ? (
            <span
              className="flex items-center justify-center"
              style={{ width: d.widgetButtonSize * 0.46, height: d.widgetButtonSize * 0.46 }}
              dangerouslySetInnerHTML={{ __html: d.customLauncherSvg }}
            />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round"
              style={{ width: d.widgetButtonSize * 0.46, height: d.widgetButtonSize * 0.46 }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          )}
        </div>
      </div>

      {d.customCss && (
        <style dangerouslySetInnerHTML={{ __html: d.customCss }} />
      )}
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function WidgetDesignPanel({ kbId }: { kbId: string }) {
  const [design, setDesign]   = useState<WidgetDesign>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedDesignCode, setAdvancedDesignCode] = useState(() => serializeDesign(DEFAULTS));
  const [advancedDesignError, setAdvancedDesignError] = useState<string | null>(null);
  const syncingFromCodeRef = useRef(false);

  // Load current config
  useEffect(() => {
    if (!kbId) return;
    fetch(apiUrl(`/api/kbs/${kbId}/config`), { headers: withAuthHeaders({}) })
      .then((r) => r.json())
      .then((data) => {
        const nextDesign = normalizeDesign({
          ...data,
          launcherColour: data.launcherColour ?? data.primaryColour,
        }, DEFAULTS);
        setDesign(nextDesign);
        setAdvancedDesignCode(serializeDesign(nextDesign));
        setAdvancedDesignError(null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [kbId]);

  const set = useCallback(<K extends keyof WidgetDesign>(key: K, val: WidgetDesign[K]) => {
    setDesign((prev) => ({ ...prev, [key]: val }));
    setSaved(false);
  }, []);

  useEffect(() => {
    if (syncingFromCodeRef.current) {
      syncingFromCodeRef.current = false;
      return;
    }
    setAdvancedDesignCode(serializeDesign(design));
    setAdvancedDesignError(null);
  }, [design]);

  const handleAdvancedDesignChange = useCallback((raw: string) => {
    setAdvancedDesignCode(raw);
    setSaved(false);

    if (!raw.trim()) {
      setAdvancedDesignError("Design JSON cannot be empty.");
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<WidgetDesign>;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setAdvancedDesignError("Design JSON must be an object.");
        return;
      }
      syncingFromCodeRef.current = true;
      setDesign((prev) => normalizeDesign(parsed, prev));
      setAdvancedDesignError(null);
    } catch (nextError) {
      setAdvancedDesignError((nextError as Error).message);
    }
  }, []);

  const handleSave = async () => {
    setSaving(true); setError(null); setSaved(false);
    try {
      const res = await fetch(apiUrl(`/api/kbs/${kbId}/config`), {
        method: "PATCH",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          primaryColour:       design.primaryColour,
          accentColour:        design.accentColour,
          launcherColour:      design.launcherColour,
          widgetTheme:         design.widgetTheme,
          widgetPosition:      design.widgetPosition,
          widgetButtonSize:    design.widgetButtonSize,
          widgetBorderRadius:  design.widgetBorderRadius,
          widgetFontFamily:    design.widgetFontFamily,
          widgetChatHeight:    design.widgetChatHeight,
          widgetShowBranding:  design.widgetShowBranding,
          widgetLauncherLabel: design.widgetLauncherLabel || null,
          assistantName:       design.assistantName,
          welcomeMessage:      design.welcomeMessage,
          avatarUrl:           design.avatarUrl || null,
          widgetMode:          design.widgetMode,
          customCss:           design.customCss || null,
          customLauncherSvg:   design.customLauncherSvg || null,
          customHeaderHtml:    design.customHeaderHtml || null,
          customPoweredBy:     design.customPoweredBy || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!confirm("Reset to factory defaults? Your current design will be lost.")) return;
    setDesign(DEFAULTS);
    setAdvancedDesignCode(serializeDesign(DEFAULTS));
    setAdvancedDesignError(null);
    setSaved(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-white/40 py-8">
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        Loading widget design…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-white">Widget Design</h2>
          <p className="mt-0.5 text-sm text-white/50">
            Customise every visual aspect of the chat widget. Changes apply instantly to all deployments — no code changes needed.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleReset} className="text-white/40 hover:text-white text-xs">
            Reset defaults
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-5">
            {saving ? "Saving…" : "Save design"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</p>
      )}
      {saved && (
        <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          ✔ Design saved! Changes are live immediately.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start">
        {/* ── Controls ── */}
        <div className="space-y-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto lg:pr-4">

          <Divider label="Colours" />
          <Field label="Primary colour" hint="Button, header, user message bubbles">
            <ColourInput value={design.primaryColour} onChange={(v) => set("primaryColour", v)} />
          </Field>
          <Field label="Accent colour" hint="Input focus ring and highlights">
            <ColourInput value={design.accentColour} onChange={(v) => set("accentColour", v)} />
          </Field>
          <Field label="Launcher colour" hint="Floating button background and launcher label">
            <ColourInput value={design.launcherColour} onChange={(v) => set("launcherColour", v)} />
          </Field>

          <Divider label="Theme & Layout" />
          <Field label="Theme">
            <div className="flex gap-2">
              {(["light", "dark"] as const).map((t) => (
                <button key={t} onClick={() => set("widgetTheme", t)}
                  className={`flex-1 rounded-lg border py-2 text-sm capitalize transition-all ${
                    design.widgetTheme === t
                      ? "border-indigo-500/50 bg-indigo-600/20 text-indigo-300"
                      : "border-white/[0.1] bg-white/[0.03] text-white/50 hover:text-white"
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Position">
            <div className="flex gap-2">
              {(["bottom-right", "bottom-left"] as const).map((p) => (
                <button key={p} onClick={() => set("widgetPosition", p)}
                  className={`flex-1 rounded-lg border py-2 text-xs capitalize transition-all ${
                    design.widgetPosition === p
                      ? "border-indigo-500/50 bg-indigo-600/20 text-indigo-300"
                      : "border-white/[0.1] bg-white/[0.03] text-white/50 hover:text-white"
                  }`}>
                  {p}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Chat window height" hint="300 – 900 px">
            <RangeInput value={design.widgetChatHeight} min={300} max={900} step={10} unit="px"
              onChange={(v) => set("widgetChatHeight", v)} />
          </Field>
          <Field label="Corner radius" hint="0 = square, 40 = very round">
            <RangeInput value={design.widgetBorderRadius} min={0} max={40} unit="px"
              onChange={(v) => set("widgetBorderRadius", v)} />
          </Field>
          <Field label="FAB button size" hint="40 – 80 px">
            <RangeInput value={design.widgetButtonSize} min={40} max={80} unit="px"
              onChange={(v) => set("widgetButtonSize", v)} />
          </Field>

          <Divider label="Typography" />
          <Field label="Font family">
            <select value={design.widgetFontFamily} onChange={(e) => set("widgetFontFamily", e.target.value)}
              className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white/80
                focus:border-indigo-500/50 focus:outline-none">
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </Field>

          <Divider label="Identity" />
          <Field label="Assistant name">
            <input value={design.assistantName} onChange={(e) => set("assistantName", e.target.value)}
              className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white/80
                focus:border-indigo-500/50 focus:outline-none" />
          </Field>
          <Field label="Welcome message">
            <textarea value={design.welcomeMessage} onChange={(e) => set("welcomeMessage", e.target.value)} rows={2}
              className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white/80
                focus:border-indigo-500/50 focus:outline-none resize-none" />
          </Field>
          <Field label="Avatar URL" hint="Leave empty to use the bot icon">
            <input value={design.avatarUrl} onChange={(e) => set("avatarUrl", e.target.value)}
              placeholder="https://yoursite.com/avatar.png"
              className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white/80
                focus:border-indigo-500/50 focus:outline-none font-mono text-xs" />
          </Field>

          <Divider label="Widget Mode" />
          <Field label="Render mode" hint="floating = FAB button (default) · inline = full-page iframe · headless = zero DOM, use ClaraSDK">
            <div className="flex gap-2">
              {(["floating", "inline", "headless"] as const).map((m) => (
                <button key={m} onClick={() => set("widgetMode", m)}
                  className={`flex-1 rounded-lg border py-2 text-xs capitalize transition-all ${
                    design.widgetMode === m
                      ? "border-indigo-500/50 bg-indigo-600/20 text-indigo-300"
                      : "border-white/[0.1] bg-white/[0.03] text-white/50 hover:text-white"
                  }`}>
                  {m}
                </button>
              ))}
            </div>
            {design.widgetMode === "headless" && (
              <p className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mt-1">
                Headless mode renders no UI. Use <code className="bg-muted px-1 rounded">window.ClaraSDK</code> in your own code to send messages, stream tokens, and start voice sessions.
              </p>
            )}
          </Field>

          <Divider label="Custom Code" />
          <div className="space-y-4">
            <LiveCodeEditor
              title="Custom CSS"
              description="Shadow-DOM widget CSS with Monaco diagnostics, formatting, and live preview sync."
              language="css"
              value={design.customCss}
              onChange={(value) => set("customCss", value)}
              path={`inmemory://widget/${kbId}/custom.css`}
              height={260}
            />
            <LiveCodeEditor
              title="Custom launcher SVG"
              description="Paste raw SVG markup for the floating button icon. Valid changes sync to preview and saved config."
              language="html"
              value={design.customLauncherSvg}
              onChange={(value) => set("customLauncherSvg", value)}
              path={`inmemory://widget/${kbId}/launcher.svg`}
              height={240}
            />
            <LiveCodeEditor
              title="Custom header HTML"
              description="Header markup rendered inside the widget title bar."
              language="html"
              value={design.customHeaderHtml}
              onChange={(value) => set("customHeaderHtml", value)}
              path={`inmemory://widget/${kbId}/header.html`}
              height={220}
            />
          </div>
          <Field label="Custom 'Powered by' text" hint="Override the branding footer text. Leave empty for default.">
            <input value={design.customPoweredBy} onChange={(e) => set("customPoweredBy", e.target.value)}
              placeholder="Powered by AmazeTechCLANS AI"
              className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white/80 focus:border-indigo-500/50 focus:outline-none" />
          </Field>

          <Divider label="Extras" />
          <Field label="Launcher label" hint="Optional text beside the FAB button (e.g. 'Chat with us')">
            <input value={design.widgetLauncherLabel} onChange={(e) => set("widgetLauncherLabel", e.target.value)}
              placeholder="Chat with us"
              className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white/80
                focus:border-indigo-500/50 focus:outline-none" />
          </Field>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-white/70">Show &quot;Powered by Clara AI&quot;</p>
              <p className="text-[11px] text-white/35">Uncheck to hide the branding footer</p>
            </div>
            <button onClick={() => set("widgetShowBranding", !design.widgetShowBranding)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                design.widgetShowBranding ? "bg-indigo-600" : "bg-white/[0.12]"
              }`}>
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                design.widgetShowBranding ? "translate-x-4" : "translate-x-1"
              }`} />
            </button>
          </div>
        </div>

        {/* ── Live Preview ── */}
        <div className="space-y-3 lg:sticky lg:top-6 self-start">
          <p className="text-xs font-medium uppercase tracking-widest text-white/30">Live Preview</p>
          <WidgetPreview d={design} />
          <p className="text-xs text-white/30 text-center">
            Preview mirrors the real widget. Save to push changes live.
          </p>
        </div>
      </div>

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02]">
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-white">
                <Code2 className="h-4 w-4 text-indigo-300" />
                <span className="text-sm font-semibold">Advanced design editor</span>
              </div>
              <p className="text-xs text-white/45">
                Edit the full widget design as code. Valid JSON updates all visual controls, color pickers, and the live preview immediately.
              </p>
            </div>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06] hover:text-white">
                <ChevronDown className={`mr-1.5 h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : "rotate-0"}`} />
                {advancedOpen ? "Hide code mode" : "Open code mode"}
              </Button>
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent className="border-t border-white/[0.08] px-5 py-5">
            <div className="space-y-3">
              <LiveCodeEditor
                title="Widget design JSON"
                description="This editor is two-way synced with every design input above. When JSON is valid, form controls and preview update instantly."
                language="json"
                value={advancedDesignCode}
                onChange={handleAdvancedDesignChange}
                path={`inmemory://widget/${kbId}/design.json`}
                height={420}
                schema={DESIGN_JSON_SCHEMA}
                minimap
              />
              {advancedDesignError ? (
                <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
                  {advancedDesignError}
                </p>
              ) : null}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
