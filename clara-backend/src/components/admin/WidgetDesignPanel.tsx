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

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";

// ── Types ─────────────────────────────────────────────────────────────────────

type WidgetDesign = {
  // Colours
  primaryColour:  string;
  accentColour:   string;
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
  customPoweredBy:     "",
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

  const fakeMessages = [
    { role: "assistant", text: d.welcomeMessage || "Hi! How can I help?" },
    { role: "user",      text: "What services do you offer?" },
    { role: "assistant", text: "We offer web development, mobile apps, and AI integrations. What can I help you with?" },
  ];

  return (
    <div className="relative flex items-end justify-end h-[520px] rounded-2xl overflow-hidden"
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
      <div className="relative m-4 flex flex-col overflow-hidden shadow-2xl"
        style={{
          width: 300,
          height: Math.min(d.widgetChatHeight, 440),
          borderRadius: d.widgetBorderRadius,
          background: bg,
          border: `1px solid ${bdr}`,
          fontFamily: d.widgetFontFamily,
        }}>
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0"
          style={{ background: d.primaryColour }}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.2)" }}>
            {d.avatarUrl
              ? <img src={d.avatarUrl} className="w-7 h-7 rounded-full object-cover" alt="" />
              : <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round">
                  <rect x="3" y="11" width="18" height="10" rx="2"/>
                  <path d="M9 11V7a3 3 0 0 1 6 0v4"/>
                  <circle cx="9" cy="16" r="1" fill="white" stroke="none"/>
                  <circle cx="15" cy="16" r="1" fill="white" stroke="none"/>
                </svg>}
          </div>
          <span className="text-xs font-semibold text-white truncate flex-1">{d.assistantName || "Clara"}</span>
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
            style={{ background: surface, border: `1.5px solid ${bdr}`, color: sub }}>
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
          <div className="text-center py-1.5 flex-shrink-0" style={{ fontSize: 9, color: sub }}>
            Powered by Clara AI
          </div>
        )}
      </div>

      {/* FAB button */}
      <div className="absolute bottom-4 right-4 flex flex-col items-end gap-1.5">
        {d.widgetLauncherLabel && (
          <div className="text-xs font-semibold text-white rounded-full px-3 py-1"
            style={{ background: d.primaryColour, boxShadow: "0 2px 10px rgba(0,0,0,0.22)" }}>
            {d.widgetLauncherLabel}
          </div>
        )}
        <div className="rounded-full flex items-center justify-center"
          style={{ width: d.widgetButtonSize, height: d.widgetButtonSize, background: d.primaryColour, boxShadow: "0 4px 16px rgba(0,0,0,0.28)" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round"
            style={{ width: d.widgetButtonSize * 0.46, height: d.widgetButtonSize * 0.46 }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
      </div>
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

  // Load current config
  useEffect(() => {
    if (!kbId) return;
    fetch(apiUrl(`/api/kbs/${kbId}/config`), { headers: withAuthHeaders({}) })
      .then((r) => r.json())
      .then((data) => {
        setDesign({
          primaryColour:       data.primaryColour       ?? DEFAULTS.primaryColour,
          accentColour:        data.accentColour        ?? DEFAULTS.accentColour,
          widgetTheme:         data.widgetTheme         ?? DEFAULTS.widgetTheme,
          widgetPosition:      data.widgetPosition      ?? DEFAULTS.widgetPosition,
          widgetButtonSize:    data.widgetButtonSize    ?? DEFAULTS.widgetButtonSize,
          widgetBorderRadius:  data.widgetBorderRadius  ?? DEFAULTS.widgetBorderRadius,
          widgetFontFamily:    data.widgetFontFamily    ?? DEFAULTS.widgetFontFamily,
          widgetChatHeight:    data.widgetChatHeight    ?? DEFAULTS.widgetChatHeight,
          widgetShowBranding:  data.widgetShowBranding  ?? DEFAULTS.widgetShowBranding,
          widgetLauncherLabel: data.widgetLauncherLabel ?? "",
          assistantName:       data.assistantName       ?? DEFAULTS.assistantName,
          welcomeMessage:      data.welcomeMessage      ?? DEFAULTS.welcomeMessage,
          avatarUrl:           data.avatarUrl           ?? "",
          widgetMode:          data.widgetMode          ?? "floating",
          customCss:           data.customCss           ?? "",
          customLauncherSvg:   data.customLauncherSvg   ?? "",
          customHeaderHtml:    data.customHeaderHtml    ?? "",
          customPoweredBy:     data.customPoweredBy     ?? "",
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [kbId]);

  const set = useCallback(<K extends keyof WidgetDesign>(key: K, val: WidgetDesign[K]) => {
    setDesign((prev) => ({ ...prev, [key]: val }));
    setSaved(false);
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

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* ── Controls ── */}
        <div className="space-y-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">

          <Divider label="Colours" />
          <Field label="Primary colour" hint="Button, header, user message bubbles">
            <ColourInput value={design.primaryColour} onChange={(v) => set("primaryColour", v)} />
          </Field>
          <Field label="Accent colour" hint="Input focus ring and highlights">
            <ColourInput value={design.accentColour} onChange={(v) => set("accentColour", v)} />
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
          <Field label="Custom CSS" hint="Injected into widget Shadow DOM after default styles — overrides anything. Max 32 KB.">
            <textarea value={design.customCss} onChange={(e) => set("customCss", e.target.value)} rows={5}
              placeholder={`/* Override any widget style */\n#panel { border: 2px solid #ff6b6b; }\n.mu    { border-radius: 4px !important; }\n#tbtn  { box-shadow: 0 0 30px rgba(124,58,237,0.8) !important; }`}
              className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-xs font-mono text-white/80 focus:border-indigo-500/50 focus:outline-none resize-none" />
          </Field>
          <Field label="Custom launcher SVG" hint="Replaces the default chat-bubble FAB icon. Must be a valid <svg>…</svg> string. Max 4 KB.">
            <textarea value={design.customLauncherSvg} onChange={(e) => set("customLauncherSvg", e.target.value)} rows={3}
              placeholder='<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">\n  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>\n</svg>'
              className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-xs font-mono text-white/80 focus:border-indigo-500/50 focus:outline-none resize-none" />
            {design.customLauncherSvg && !/^<svg[\s>]/i.test(design.customLauncherSvg.trim()) && (
              <p className="text-[11px] text-rose-400 mt-1">⚠ Must start with &lt;svg …&gt;</p>
            )}
          </Field>
          <Field label="Custom header HTML" hint="Appended inside the widget header bar — e.g. a status badge, logo, or online indicator. Max 500 chars.">
            <input value={design.customHeaderHtml} onChange={(e) => set("customHeaderHtml", e.target.value)}
              placeholder='<span style="background:#22c55e;color:#fff;border-radius:99px;padding:2px 8px;font-size:10px">LIVE</span>'
              className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-xs font-mono text-white/80 focus:border-indigo-500/50 focus:outline-none" />
          </Field>
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
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-widest text-white/30">Live Preview</p>
          <WidgetPreview d={design} />
          <p className="text-xs text-white/30 text-center">
            Preview mirrors the real widget. Save to push changes live.
          </p>
        </div>
      </div>
    </div>
  );
}
