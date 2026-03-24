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

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ChevronDown, Code2, ExternalLink, Layers3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const DESIGN_TS_EXTRA_LIB = `
declare interface ClaraWidgetDesign {
  /** Primary widget brand colour used for the header and user bubbles. */
  primaryColour: string;
  /** Accent colour used for focus states and subtle highlights. */
  accentColour: string;
  /** Floating launcher button and launcher label background colour. */
  launcherColour: string;
  /** Overall widget theme. */
  widgetTheme: "light" | "dark";
  /** Floating widget placement. */
  widgetPosition: "bottom-right" | "bottom-left";
  /** Floating launcher size in pixels. */
  widgetButtonSize: number;
  /** Widget panel corner radius. */
  widgetBorderRadius: number;
  /** Font family applied to the widget UI. */
  widgetFontFamily: string;
  /** Max panel height in pixels. */
  widgetChatHeight: number;
  /** Show or hide the branding footer. */
  widgetShowBranding: boolean;
  /** Optional floating launcher label. */
  widgetLauncherLabel: string;
  /** Assistant display name shown in the header. */
  assistantName: string;
  /** Initial assistant greeting. */
  welcomeMessage: string;
  /** Assistant avatar URL. */
  avatarUrl: string;
  /** Widget rendering mode. */
  widgetMode: "floating" | "inline" | "headless";
  /** Custom CSS injected into the widget shadow root. */
  customCss: string;
  /** SVG markup for the launcher icon. */
  customLauncherSvg: string;
  /** HTML snippet rendered inside the header. */
  customHeaderHtml: string;
  /** Branding footer text override. */
  customPoweredBy: string;
}
`;

const COLOUR_PATTERN = /^#(?:[0-9a-fA-F]{3,8})$/;

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

function serializeDesignCode(design: WidgetDesign) {
  return `const design: ClaraWidgetDesign = ${JSON.stringify(design, null, 2)};

export default design;
`;
}

function parseDesignCode(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Design code cannot be empty.");

  const executableWithReturn = trimmed.replace(/export\s+default\s+design\s*;?\s*$/m, "return design;");
  if (executableWithReturn === trimmed) {
    throw new Error("Design code must end with 'export default design;'.");
  }

  const executable = executableWithReturn.replace(/const\s+design\s*:\s*ClaraWidgetDesign\s*=/, "const design =");

  const result = Function(`"use strict";\n${executable}`)() as unknown;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Design code must export an object.");
  }

  return result as Partial<WidgetDesign>;
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

type PreviewMode = "floating" | "inline";

function escapeForInlineJson(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function buildFloatingPreviewDoc(origin: string, design: WidgetDesign) {
  const previewConfig = {
    ...design,
    kbId: "preview-kb",
    kbName: "Admin preview",
    defaultLanguage: "en",
    voiceEnabled: false,
    widgetMode: "floating",
  };

  const configJson = escapeForInlineJson(previewConfig);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body {
        margin: 0;
        min-height: 100%;
        font-family: Inter, system-ui, sans-serif;
        background: radial-gradient(circle at top, rgba(99,102,241,0.14), transparent 40%), #0b1020;
        color: #cbd5e1;
      }
      body {
        position: relative;
        overflow: hidden;
      }
      .preview-shell {
        min-height: 100vh;
        padding: 32px 28px 100px;
        box-sizing: border-box;
      }
      .preview-card {
        max-width: 520px;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 24px;
        padding: 20px;
        background: rgba(15,23,42,0.58);
        backdrop-filter: blur(14px);
        box-shadow: 0 30px 80px rgba(0,0,0,0.35);
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: rgba(255,255,255,0.56);
      }
      h1 {
        margin: 14px 0 10px;
        font-size: 28px;
        line-height: 1.1;
        color: white;
      }
      p {
        margin: 0;
        font-size: 14px;
        line-height: 1.7;
        color: rgba(255,255,255,0.7);
      }
    </style>
  </head>
  <body>
    <div class="preview-shell">
      <div class="preview-card">
        <div class="eyebrow">Floating sandbox · real clara.js runtime</div>
        <h1>Preview the launcher on a real page surface.</h1>
        <p>Open the widget, type a message, and inspect styling in the actual embed runtime path. Design edits from the admin panel are injected live into this sandbox.</p>
      </div>
    </div>
    <script>
      const previewConfig = ${configJson};
      const originalFetch = window.fetch.bind(window);

      function jsonResponse(body) {
        return Promise.resolve(new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }));
      }

      function streamChatResponse(body) {
        const request = JSON.parse(body || "{}");
        const messages = Array.isArray(request.messages) ? request.messages : [];
        const lastUser = messages.filter((message) => message && message.role === "user").slice(-1)[0];
        const question = lastUser && typeof lastUser.content === "string" ? lastUser.content.trim() : "your question";
        const answer = "This floating sandbox is running the real clara.js widget path. Current preview changes are live, and this sample reply echoes your latest question: " + question + ". Save the design to publish it to real embeds.";
        const chunks = answer.match(/.{1,28}(\s|$)/g) || [answer];
        const stream = new ReadableStream({
          start(controller) {
            let index = 0;
            function push() {
              if (index >= chunks.length) {
                controller.close();
                return;
              }
              const payload = JSON.stringify({ type: "token", payload: chunks[index] }) + "\n";
              controller.enqueue(new TextEncoder().encode(payload));
              index += 1;
              setTimeout(push, 35);
            }
            push();
          },
        });
        return Promise.resolve(new Response(stream, {
          status: 200,
          headers: { "Content-Type": "application/x-ndjson" }
        }));
      }

      window.fetch = function(input, init) {
        const url = typeof input === "string" ? input : input.url;
        if (url.indexOf("/api/embed/config") !== -1) {
          return jsonResponse(previewConfig);
        }
        if (url.indexOf("/api/embed/chat") !== -1) {
          return streamChatResponse(init && init.body ? init.body : "{}");
        }
        return originalFetch(input, init);
      };
    </script>
    <script src="${origin}/embed/clara.js" data-key="preview-key" data-mode="floating"></script>
  </body>
</html>`;
}

function PreviewFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#0a1120] shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between border-b border-white/[0.08] bg-white/[0.03] px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="text-xs text-white/40">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1.5 text-white/35">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        </div>
      </div>
      {children}
    </div>
  );
}

function FloatingSandboxPreview({ design }: { design: WidgetDesign }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const srcDoc = useMemo(() => (origin ? buildFloatingPreviewDoc(origin, design) : ""), [design, origin]);

  return (
    <PreviewFrame
      title="Floating sandbox"
      subtitle="Real clara.js runtime inside an isolated page"
    >
      <iframe
        title="Floating widget sandbox preview"
        srcDoc={srcDoc}
        className="h-[560px] w-full bg-[#09101f]"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </PreviewFrame>
  );
}

function InlineEmbedPreview({ design, kbId }: { design: WidgetDesign; kbId: string }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const previewConfig = useMemo(
    () => ({
      type: "clara-admin-preview-config",
      payload: {
        kbId,
        kbName: "Admin preview",
        assistantName: design.assistantName,
        avatarUrl: design.avatarUrl || null,
        welcomeMessage: design.welcomeMessage,
        primaryColour: design.primaryColour,
        accentColour: design.accentColour,
        defaultLanguage: "en",
        widgetTheme: design.widgetTheme,
        widgetBorderRadius: design.widgetBorderRadius,
        widgetFontFamily: design.widgetFontFamily,
        widgetShowBranding: design.widgetShowBranding,
        customCss: design.customCss || null,
        customPoweredBy: design.customPoweredBy || null,
        customHeaderHtml: design.customHeaderHtml || null,
      },
    }),
    [design, kbId]
  );

  const postPreviewConfig = useCallback(() => {
    if (!frameRef.current?.contentWindow || !origin) return;
    frameRef.current.contentWindow.postMessage(previewConfig, origin);
  }, [origin, previewConfig]);

  useEffect(() => {
    postPreviewConfig();
  }, [postPreviewConfig]);

  return (
    <PreviewFrame
      title="Inline embed preview"
      subtitle="Real /embed/widget page surface in preview mode"
    >
      <iframe
        ref={frameRef}
        title="Inline widget preview"
        src="/embed/widget?preview=1"
        onLoad={postPreviewConfig}
        className="h-[560px] w-full bg-white"
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
    </PreviewFrame>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function WidgetDesignPanel({ kbId }: { kbId: string }) {
  const [design, setDesign]   = useState<WidgetDesign>(DEFAULTS);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("floating");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedTab, setAdvancedTab] = useState("design");
  const [advancedDesignCode, setAdvancedDesignCode] = useState(() => serializeDesignCode(DEFAULTS));
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
        setAdvancedDesignCode(serializeDesignCode(nextDesign));
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
    setAdvancedDesignCode(serializeDesignCode(design));
    setAdvancedDesignError(null);
  }, [design]);

  const handleAdvancedDesignChange = useCallback((raw: string) => {
    setAdvancedDesignCode(raw);
    setSaved(false);

    if (!raw.trim()) {
      setAdvancedDesignError("Design code cannot be empty.");
      return;
    }

    try {
      const parsed = parseDesignCode(raw);
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
    setAdvancedDesignCode(serializeDesignCode(DEFAULTS));
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
        <div className="space-y-4 lg:sticky lg:top-6 self-start">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-white/30">Live Preview</p>
                <p className="mt-1 text-sm text-white/55">
                  Switch between the real floating widget runtime and the real inline embed surface. Both stay synced with your current unsaved edits.
                </p>
              </div>
              <div className="inline-flex rounded-xl border border-white/[0.08] bg-[#0b1020] p-1">
                {([
                  { id: "floating", label: "Floating sandbox", icon: Layers3 },
                  { id: "inline", label: "Inline embed", icon: ExternalLink },
                ] as const).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPreviewMode(id)}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                      previewMode === id
                        ? "bg-indigo-600/20 text-indigo-200 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.4)]"
                        : "text-white/50 hover:bg-white/[0.04] hover:text-white"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {previewMode === "floating" ? (
            <FloatingSandboxPreview design={design} />
          ) : (
            <InlineEmbedPreview design={design} kbId={kbId} />
          )}

          <p className="text-xs text-white/30 text-center">
            Preview is local to this panel until you save. Saved config flow is unchanged.
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
                Edit the full widget design as code. All bottom editors stay synced with the visual controls, top editors, and live preview.
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
            <Tabs value={advancedTab} onValueChange={setAdvancedTab} className="space-y-4">
              <TabsList className="h-auto flex-wrap justify-start gap-2 rounded-xl bg-[#0b1020] p-2 text-white/50">
                <TabsTrigger value="design" className="bg-transparent px-3 py-2 text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white">design.ts</TabsTrigger>
                <TabsTrigger value="css" className="bg-transparent px-3 py-2 text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white">custom.css</TabsTrigger>
                <TabsTrigger value="header" className="bg-transparent px-3 py-2 text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white">header.html</TabsTrigger>
                <TabsTrigger value="launcher" className="bg-transparent px-3 py-2 text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white">launcher.svg</TabsTrigger>
              </TabsList>

              <TabsContent value="design" className="mt-0 space-y-3">
                <LiveCodeEditor
                  title="Widget design code"
                  description="Native TypeScript-style design module with autocomplete for widget properties. Changes sync both ways with all form controls."
                  language="typescript"
                  value={advancedDesignCode}
                  onChange={handleAdvancedDesignChange}
                  path={`inmemory://widget/${kbId}/design.ts`}
                  height={420}
                  minimap
                  typescriptExtraLibs={[{ filePath: `ts:widget/${kbId}/design-types.d.ts`, content: DESIGN_TS_EXTRA_LIB }]}
                />
                {advancedDesignError ? (
                  <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
                    {advancedDesignError}
                  </p>
                ) : null}
              </TabsContent>

              <TabsContent value="css" className="mt-0">
                <LiveCodeEditor
                  title="Advanced custom CSS"
                  description="Same CSS as the main editor above, available here in the hidden developer workspace."
                  language="css"
                  value={design.customCss}
                  onChange={(value) => set("customCss", value)}
                  path={`inmemory://widget/${kbId}/advanced-custom.css`}
                  height={360}
                  minimap
                />
              </TabsContent>

              <TabsContent value="header" className="mt-0">
                <LiveCodeEditor
                  title="Advanced header HTML"
                  description="Header slot markup synced with the top editor and preview."
                  language="html"
                  value={design.customHeaderHtml}
                  onChange={(value) => set("customHeaderHtml", value)}
                  path={`inmemory://widget/${kbId}/advanced-header.html`}
                  height={320}
                />
              </TabsContent>

              <TabsContent value="launcher" className="mt-0">
                <LiveCodeEditor
                  title="Advanced launcher SVG"
                  description="Floating launcher icon markup synced with the top editor and preview."
                  language="html"
                  value={design.customLauncherSvg}
                  onChange={(value) => set("customLauncherSvg", value)}
                  path={`inmemory://widget/${kbId}/advanced-launcher.svg`}
                  height={360}
                />
              </TabsContent>
            </Tabs>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
