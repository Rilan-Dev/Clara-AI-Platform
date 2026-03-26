"use client";
/**
 * src/components/admin/WidgetDesignPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete widget design system editor.
 *  • Deep visual controls for every widget element
 *  • Live React-rendered preview (no iframe collapse)
 *  • Advanced mode = real CSS / HTML / JS code editors (not JSON property editing)
 *  • All changes propagate to preview instantly
 */

import {
  useState, useEffect, useCallback, useRef,
  useMemo, Suspense,
} from "react";
import {
  ChevronDown, Code2, Eye, RefreshCw,
  Palette, Layout, Type, MessageSquare, Send,
  Sliders, Sparkles, Monitor,
} from "lucide-react";
import { Button }            from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { LiveCodeEditor }    from "@/components/admin/live-code-editor";
import { withAuthHeaders }   from "@/lib/client-auth";
import { apiUrl }            from "@/lib/runtime";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type WidgetDesign = {
  // ── Global colours ──────────────────────────────────────────────────────────
  primaryColour:   string;
  accentColour:    string;
  launcherColour:  string;

  // ── Global layout ───────────────────────────────────────────────────────────
  widgetTheme:         "light" | "dark";
  widgetPosition:      "bottom-right" | "bottom-left";
  widgetButtonSize:    number;
  widgetBorderRadius:  number;
  widgetFontFamily:    string;
  widgetChatHeight:    number;
  widgetShowBranding:  boolean;
  widgetLauncherLabel: string;
  widgetMode:          "floating" | "inline" | "headless";

  // ── Identity ─────────────────────────────────────────────────────────────────
  assistantName:   string;
  welcomeMessage:  string;
  avatarUrl:       string;

  // ── Header ───────────────────────────────────────────────────────────────────
  headerBg:         string;   // CSS colour / gradient
  headerTextColor:  string;
  headerHeight:     number;   // px
  headerBlur:       boolean;
  showStatusDot:    boolean;
  statusDotColor:   string;
  avatarShape:      "circle" | "rounded" | "square";

  // ── Chat area background ─────────────────────────────────────────────────────
  chatAreaBg:       string;   // CSS colour / gradient

  // ── User bubble ──────────────────────────────────────────────────────────────
  userBubbleBg:      string;
  userBubbleText:    string;
  userBubbleRadius:  string;  // e.g. "18px 18px 4px 18px"
  userBubblePadding: string;  // e.g. "10px 14px"
  userBubbleShadow:  string;

  // ── Bot bubble ───────────────────────────────────────────────────────────────
  botBubbleBg:      string;
  botBubbleText:    string;
  botBubbleRadius:  string;
  botBubbleBorder:  string;
  botBubblePadding: string;
  botBubbleShadow:  string;

  // ── Message area ─────────────────────────────────────────────────────────────
  messageGap:      number;   // px gap between messages
  messageMaxWidth: number;   // % of chat width
  messageFontSize: number;   // px
  messageLineHeight: number; // unitless

  // ── Timestamps ───────────────────────────────────────────────────────────────
  showTimestamps:   boolean;
  timestampColor:   string;
  timestampFontSize: number;

  // ── Typing indicator ─────────────────────────────────────────────────────────
  typingDotColor:  string;
  typingDotSize:   number;

  // ── Input area ───────────────────────────────────────────────────────────────
  inputBg:               string;
  inputBorder:           string;
  inputBorderFocus:      string;
  inputRadius:           number;
  inputTextColor:        string;
  inputPlaceholderColor: string;
  inputPadding:          string;
  inputAreaBg:           string;
  inputAreaBorder:       string;

  // ── Send button ──────────────────────────────────────────────────────────────
  sendBtnBg:        string;
  sendBtnHoverBg:   string;
  sendBtnTextColor: string;
  sendBtnRadius:    number;
  sendBtnSize:      number;

  // ── Scrollbar ────────────────────────────────────────────────────────────────
  scrollbarWidth:      number;
  scrollbarColor:      string;
  scrollbarTrackColor: string;

  // ── Branding footer ──────────────────────────────────────────────────────────
  footerBg:        string;
  footerTextColor: string;
  customPoweredBy: string;

  // ── Animations ───────────────────────────────────────────────────────────────
  animationsEnabled: boolean;
  messageAnimationStyle: "fade" | "slide" | "pop" | "none";

  // ── Advanced code overrides ───────────────────────────────────────────────────
  customCss:         string;   // injected into widget
  customLauncherSvg: string;
  customHeaderHtml:  string;
  customFooterHtml:  string;
  customThemeCss:    string;   // full CSS variable + rule overrides
  customInjectJs:    string;   // behaviour hooks
};


// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULTS: WidgetDesign = {
  primaryColour:   "#6366f1",
  accentColour:    "#818cf8",
  launcherColour:  "#6366f1",

  widgetTheme:         "light",
  widgetPosition:      "bottom-right",
  widgetButtonSize:    56,
  widgetBorderRadius:  20,
  widgetFontFamily:    "system-ui,sans-serif",
  widgetChatHeight:    580,
  widgetShowBranding:  true,
  widgetLauncherLabel: "",
  widgetMode:          "floating",

  assistantName:   "Clara",
  welcomeMessage:  "Hi! How can I help you today?",
  avatarUrl:       "",

  headerBg:        "",   // empty = use primaryColour
  headerTextColor: "#ffffff",
  headerHeight:    60,
  headerBlur:      false,
  showStatusDot:   true,
  statusDotColor:  "#4ade80",
  avatarShape:     "circle",

  chatAreaBg:      "",   // empty = theme default

  userBubbleBg:      "",  // empty = use primaryColour
  userBubbleText:    "#ffffff",
  userBubbleRadius:  "18px 18px 4px 18px",
  userBubblePadding: "10px 14px",
  userBubbleShadow:  "0 1px 4px rgba(0,0,0,0.15)",

  botBubbleBg:      "",  // empty = theme default
  botBubbleText:    "",  // empty = theme default
  botBubbleRadius:  "18px 18px 18px 4px",
  botBubbleBorder:  "",  // empty = theme default
  botBubblePadding: "10px 14px",
  botBubbleShadow:  "0 1px 3px rgba(0,0,0,0.08)",

  messageGap:      12,
  messageMaxWidth: 85,
  messageFontSize: 13,
  messageLineHeight: 1.5,

  showTimestamps:    false,
  timestampColor:    "#9ca3af",
  timestampFontSize: 10,

  typingDotColor: "#9ca3af",
  typingDotSize:  6,

  inputBg:               "",   // empty = theme default
  inputBorder:           "",   // empty = theme default
  inputBorderFocus:      "",   // empty = use primaryColour
  inputRadius:           12,
  inputTextColor:        "",   // empty = theme default
  inputPlaceholderColor: "",   // empty = theme default
  inputPadding:          "8px 12px",
  inputAreaBg:           "",   // empty = theme default
  inputAreaBorder:       "",   // empty = theme default

  sendBtnBg:        "",   // empty = use primaryColour
  sendBtnHoverBg:   "",
  sendBtnTextColor: "#ffffff",
  sendBtnRadius:    10,
  sendBtnSize:      36,

  scrollbarWidth:      4,
  scrollbarColor:      "#c7d2fe",
  scrollbarTrackColor: "transparent",

  footerBg:        "",
  footerTextColor: "",
  customPoweredBy: "Powered by Clara AI",

  animationsEnabled:     true,
  messageAnimationStyle: "fade",

  customCss:         "",
  customLauncherSvg: "",
  customHeaderHtml:  "",
  customFooterHtml:  "",
  customThemeCss:    `/* ═══════════════════════════════════════════════════
   Clara Widget – Full Theme CSS Override
   ═══════════════════════════════════════════════════

   Target any widget element using these CSS classes:

   .clara-widget          → root container
   .clara-header          → top header bar
   .clara-header-name     → assistant name text
   .clara-header-status   → online indicator dot
   .clara-messages        → scrollable message list
   .clara-msg-user        → user message bubble
   .clara-msg-bot         → bot message bubble
   .clara-timestamp       → message timestamp
   .clara-sources         → cited sources block
   .clara-input-area      → bottom input wrapper
   .clara-textarea        → text input element
   .clara-send-btn        → send button
   .clara-send-icon       → SVG inside send button
   .clara-branding        → powered-by footer
   .clara-typing          → typing indicator
   .clara-typing-dot      → each animated dot
   .clara-avatar          → header / bubble avatar

   You can also override CSS variables:
   :root {
     --clara-primary:   #6366f1;
     --clara-accent:    #818cf8;
     --clara-radius:    18px;
     --clara-font:      system-ui, sans-serif;
   }
*/

/* Example: Give the send button a gradient */
/* .clara-send-btn {
  background: linear-gradient(135deg, #6366f1, #8b5cf6) !important;
  border-radius: 50% !important;
} */
`,
  customInjectJs: `/* ═══════════════════════════════════════════════════
   Clara Widget – Behaviour Hooks
   ═══════════════════════════════════════════════════

   window.ClaraHooks is called by the widget runtime.
   All hooks are optional. Remove any you don't need.
*/

// window.ClaraHooks = {
//   /** Called before a user message is sent. Return false to cancel. */
//   onBeforeSend(message) {
//     console.log("User is sending:", message);
//     return true;
//   },
//
//   /** Called when a full assistant response arrives. */
//   onResponse(text, sources) {
//     console.log("Assistant replied:", text.slice(0, 80));
//   },
//
//   /** Called on every streaming token. */
//   onToken(token) { },
//
//   /** Called when widget opens. */
//   onOpen() { document.title = "Chat opened"; },
//
//   /** Called when widget closes. */
//   onClose() { document.title = "My Site"; },
// };
`,
};


// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const FONT_OPTIONS = [
  { label: "System UI",  value: "system-ui,sans-serif" },
  { label: "Inter",      value: "Inter,system-ui,sans-serif" },
  { label: "Poppins",    value: "Poppins,system-ui,sans-serif" },
  { label: "Roboto",     value: "Roboto,system-ui,sans-serif" },
  { label: "Open Sans",  value: "'Open Sans',system-ui,sans-serif" },
  { label: "Lato",       value: "Lato,system-ui,sans-serif" },
  { label: "DM Sans",    value: "'DM Sans',system-ui,sans-serif" },
  { label: "Nunito",     value: "Nunito,system-ui,sans-serif" },
  { label: "Georgia",    value: "Georgia,serif" },
  { label: "Courier",    value: "'Courier New',monospace" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const COLOUR_RE = /^#(?:[0-9a-fA-F]{3,8})$|^rgb|^hsl|^transparent|^none$/;

function clamp(v: number, lo: number, hi: number) { return Math.min(Math.max(v, lo), hi); }
function hexOk(v: unknown, fb: string) {
  return typeof v === "string" && COLOUR_RE.test(v.trim()) ? v.trim() : fb;
}
function strOk(v: unknown, fb: string)  { return typeof v === "string" ? v : fb; }
function boolOk(v: unknown, fb: boolean){ return typeof v === "boolean" ? v : fb; }
function numOk(v: unknown, lo: number, hi: number, fb: number) {
  return typeof v === "number" && Number.isFinite(v) ? clamp(v, lo, hi) : fb;
}

function normalize(input: Partial<WidgetDesign>, base = DEFAULTS): WidgetDesign {
  const primary = hexOk(input.primaryColour, base.primaryColour);
  return {
    primaryColour:   primary,
    accentColour:    hexOk(input.accentColour,   base.accentColour),
    launcherColour:  hexOk(input.launcherColour, primary),

    widgetTheme:        input.widgetTheme === "dark" ? "dark" : "light",
    widgetPosition:     input.widgetPosition === "bottom-left" ? "bottom-left" : "bottom-right",
    widgetButtonSize:   numOk(input.widgetButtonSize,  40, 80,  base.widgetButtonSize),
    widgetBorderRadius: numOk(input.widgetBorderRadius, 0, 40,  base.widgetBorderRadius),
    widgetFontFamily:   strOk(input.widgetFontFamily,   base.widgetFontFamily),
    widgetChatHeight:   numOk(input.widgetChatHeight,  300, 900, base.widgetChatHeight),
    widgetShowBranding: boolOk(input.widgetShowBranding, base.widgetShowBranding),
    widgetLauncherLabel: strOk(input.widgetLauncherLabel, base.widgetLauncherLabel),
    widgetMode: ["inline","headless","floating"].includes(input.widgetMode ?? "")
      ? (input.widgetMode as WidgetDesign["widgetMode"]) : base.widgetMode,

    assistantName:   strOk(input.assistantName,  base.assistantName),
    welcomeMessage:  strOk(input.welcomeMessage, base.welcomeMessage),
    avatarUrl:       strOk(input.avatarUrl,       base.avatarUrl),

    headerBg:        strOk(input.headerBg,        base.headerBg),
    headerTextColor: hexOk(input.headerTextColor, base.headerTextColor),
    headerHeight:    numOk(input.headerHeight, 44, 100, base.headerHeight),
    headerBlur:      boolOk(input.headerBlur, base.headerBlur),
    showStatusDot:   boolOk(input.showStatusDot, base.showStatusDot),
    statusDotColor:  hexOk(input.statusDotColor, base.statusDotColor),
    avatarShape:     ["circle","rounded","square"].includes(input.avatarShape ?? "")
      ? (input.avatarShape as WidgetDesign["avatarShape"]) : base.avatarShape,

    chatAreaBg:      strOk(input.chatAreaBg, base.chatAreaBg),

    userBubbleBg:      strOk(input.userBubbleBg,      base.userBubbleBg),
    userBubbleText:    hexOk(input.userBubbleText,     base.userBubbleText),
    userBubbleRadius:  strOk(input.userBubbleRadius,   base.userBubbleRadius),
    userBubblePadding: strOk(input.userBubblePadding,  base.userBubblePadding),
    userBubbleShadow:  strOk(input.userBubbleShadow,   base.userBubbleShadow),

    botBubbleBg:      strOk(input.botBubbleBg,      base.botBubbleBg),
    botBubbleText:    strOk(input.botBubbleText,     base.botBubbleText),
    botBubbleRadius:  strOk(input.botBubbleRadius,   base.botBubbleRadius),
    botBubbleBorder:  strOk(input.botBubbleBorder,   base.botBubbleBorder),
    botBubblePadding: strOk(input.botBubblePadding,  base.botBubblePadding),
    botBubbleShadow:  strOk(input.botBubbleShadow,   base.botBubbleShadow),

    messageGap:        numOk(input.messageGap,       4,  40, base.messageGap),
    messageMaxWidth:   numOk(input.messageMaxWidth,  50, 100, base.messageMaxWidth),
    messageFontSize:   numOk(input.messageFontSize,  10, 22, base.messageFontSize),
    messageLineHeight: numOk(input.messageLineHeight, 1, 2.5, base.messageLineHeight),

    showTimestamps:    boolOk(input.showTimestamps, base.showTimestamps),
    timestampColor:    strOk(input.timestampColor,  base.timestampColor),
    timestampFontSize: numOk(input.timestampFontSize, 8, 14, base.timestampFontSize),

    typingDotColor: strOk(input.typingDotColor, base.typingDotColor),
    typingDotSize:  numOk(input.typingDotSize,  3, 12, base.typingDotSize),

    inputBg:               strOk(input.inputBg,               base.inputBg),
    inputBorder:           strOk(input.inputBorder,           base.inputBorder),
    inputBorderFocus:      strOk(input.inputBorderFocus,      base.inputBorderFocus),
    inputRadius:           numOk(input.inputRadius, 0, 40,   base.inputRadius),
    inputTextColor:        strOk(input.inputTextColor,        base.inputTextColor),
    inputPlaceholderColor: strOk(input.inputPlaceholderColor, base.inputPlaceholderColor),
    inputPadding:          strOk(input.inputPadding,          base.inputPadding),
    inputAreaBg:           strOk(input.inputAreaBg,           base.inputAreaBg),
    inputAreaBorder:       strOk(input.inputAreaBorder,       base.inputAreaBorder),

    sendBtnBg:        strOk(input.sendBtnBg,        base.sendBtnBg),
    sendBtnHoverBg:   strOk(input.sendBtnHoverBg,   base.sendBtnHoverBg),
    sendBtnTextColor: hexOk(input.sendBtnTextColor, base.sendBtnTextColor),
    sendBtnRadius:    numOk(input.sendBtnRadius, 0, 50, base.sendBtnRadius),
    sendBtnSize:      numOk(input.sendBtnSize,  24, 64, base.sendBtnSize),

    scrollbarWidth:      numOk(input.scrollbarWidth,  0, 16, base.scrollbarWidth),
    scrollbarColor:      strOk(input.scrollbarColor,       base.scrollbarColor),
    scrollbarTrackColor: strOk(input.scrollbarTrackColor,  base.scrollbarTrackColor),

    footerBg:        strOk(input.footerBg,        base.footerBg),
    footerTextColor: strOk(input.footerTextColor, base.footerTextColor),
    customPoweredBy: strOk(input.customPoweredBy, base.customPoweredBy),

    animationsEnabled: boolOk(input.animationsEnabled, base.animationsEnabled),
    messageAnimationStyle: ["fade","slide","pop","none"].includes(input.messageAnimationStyle ?? "")
      ? (input.messageAnimationStyle as WidgetDesign["messageAnimationStyle"]) : base.messageAnimationStyle,

    customCss:         strOk(input.customCss,         base.customCss),
    customLauncherSvg: strOk(input.customLauncherSvg, base.customLauncherSvg),
    customHeaderHtml:  strOk(input.customHeaderHtml,  base.customHeaderHtml),
    customFooterHtml:  strOk(input.customFooterHtml,  base.customFooterHtml),
    customThemeCss:    strOk(input.customThemeCss,    base.customThemeCss),
    customInjectJs:    strOk(input.customInjectJs,    base.customInjectJs),
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// Small UI helpers
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2.5 pt-3 pb-1">
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500/15 border border-indigo-500/20">
        <Icon className="h-3.5 w-3.5 text-indigo-300" />
      </div>
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">{label}</span>
      <div className="flex-1 h-px bg-white/[0.05]" />
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-white/65">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-white/30 leading-snug">{hint}</p>}
    </div>
  );
}

function ColourInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const isHex = COLOUR_RE.test(value);
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={isHex && value.startsWith("#") ? value : "#888888"}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 cursor-pointer rounded-lg border border-white/10 bg-transparent p-0.5 shrink-0" />
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "#rrggbb or css value"}
        className="flex-1 min-w-0 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5
          text-sm font-mono text-white/80 focus:border-indigo-500/50 focus:outline-none
          focus:ring-1 focus:ring-indigo-500/30 placeholder-white/20" />
    </div>
  );
}

function RangeInput({ value, min, max, step = 1, unit = "", onChange }: {
  value: number; min: number; max: number; step?: number; unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-indigo-500 cursor-pointer" />
      <input type="number" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value), min, max))}
        className="w-16 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2 py-1
          text-center text-sm font-mono text-white/80 focus:border-indigo-500/50 focus:outline-none" />
      {unit && <span className="text-xs text-white/40 w-6">{unit}</span>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, mono }: {
  value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean;
}) {
  return (
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm
        text-white/80 placeholder-white/20 focus:border-indigo-500/50 focus:outline-none
        focus:ring-1 focus:ring-indigo-500/30 ${mono ? "font-mono text-xs" : ""}`} />
  );
}

function Toggle({ value, onChange, label, hint }: {
  value: boolean; onChange: (v: boolean) => void; label: string; hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-xs font-medium text-white/65">{label}</p>
        {hint && <p className="text-[11px] text-white/30">{hint}</p>}
      </div>
      <button onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          value ? "bg-indigo-600" : "bg-white/[0.12]"
        }`}>
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          value ? "translate-x-4" : "translate-x-1"
        }`} />
      </button>
    </div>
  );
}

function SegmentedControl<T extends string>({ value, options, onChange, small }: {
  value: T; options: { label: string; value: T }[];
  onChange: (v: T) => void; small?: boolean;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map((opt) => (
        <button key={opt.value} onClick={() => onChange(opt.value)}
          className={`flex-1 rounded-lg border py-2 transition-all ${small ? "text-xs" : "text-sm"} ${
            value === opt.value
              ? "border-indigo-500/50 bg-indigo-600/20 text-indigo-300 font-medium"
              : "border-white/[0.1] bg-white/[0.03] text-white/45 hover:text-white hover:border-white/20"
          }`}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SelectInput({ value, options, onChange }: {
  value: string; options: { label: string; value: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm
        text-white/80 focus:border-indigo-500/50 focus:outline-none cursor-pointer">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Live React Widget Preview (no iframe, fully synced)
// ─────────────────────────────────────────────────────────────────────────────

type PreviewMsg = { id: string; role: "user" | "assistant"; content: string; time?: string };

function WidgetPreview({ design }: { design: WidgetDesign }) {
  const [msgs, setMsgs] = useState<PreviewMsg[]>([
    { id: "w", role: "assistant", content: design.welcomeMessage, time: "now" },
    { id: "u1", role: "user",      content: "How does this work?", time: "now" },
    { id: "a1", role: "assistant", content: "I can answer questions about your documents instantly. Try asking me anything!", time: "now" },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const msgsRef = useRef<HTMLDivElement>(null);

  // Keep welcome message in sync
  useEffect(() => {
    setMsgs((prev) => prev.map((m) => m.id === "w" ? { ...m, content: design.welcomeMessage } : m));
  }, [design.welcomeMessage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const dark        = design.widgetTheme === "dark";
  const primary     = design.primaryColour   || "#6366f1";
  const accent      = design.accentColour    || "#818cf8";
  const hdrBg       = design.headerBg        || primary;
  const chatBg      = design.chatAreaBg      || (dark ? "#0f0f1a" : "#f8f9fd");
  const botBg       = design.botBubbleBg     || (dark ? "#2a2a40" : "#f0f0f8");
  const botText     = design.botBubbleText   || (dark ? "#e2e2f0" : "#1f2937");
  const userBg      = design.userBubbleBg    || primary;
  const inputBg     = design.inputBg         || (dark ? "#1a1a2e" : "#fff");
  const inputBorder = design.inputBorder     || (dark ? "rgba(255,255,255,0.1)" : "#e5e7eb");
  const inputTxt    = design.inputTextColor  || (dark ? "#e2e2f0" : "#1f2937");
  const inputPh     = design.inputPlaceholderColor || (dark ? "#555575" : "#9ca3af");
  const inputAreaBg = design.inputAreaBg     || (dark ? "#0f0f1a" : "#fff");
  const areaB       = design.inputAreaBorder || (dark ? "rgba(255,255,255,0.08)" : "#e5e7eb");
  const footerTxt   = design.footerTextColor || (dark ? "#3a3a5a" : "#d1d5db");
  const footerBg2   = design.footerBg        || "transparent";
  const sendBg      = design.sendBtnBg       || primary;
  const dotColor    = design.typingDotColor  || "#9ca3af";
  const avatarBr    = design.avatarShape === "square" ? "4px" : design.avatarShape === "rounded" ? "8px" : "50%";

  const scrollbarCss = `
    .cw-msgs::-webkit-scrollbar { width: ${design.scrollbarWidth}px; }
    .cw-msgs::-webkit-scrollbar-track { background: ${design.scrollbarTrackColor || "transparent"}; }
    .cw-msgs::-webkit-scrollbar-thumb { background: ${design.scrollbarColor || "#c7d2fe"}; border-radius: 99px; }
    .cw-msg-enter { animation: ${
      design.messageAnimationStyle === "slide" ? "cwSlideIn 0.22s ease" :
      design.messageAnimationStyle === "pop"   ? "cwPopIn 0.18s cubic-bezier(0.34,1.56,0.64,1)" :
      design.messageAnimationStyle === "none"  ? "none" :
      "cwFadeIn 0.18s ease"
    } both; }
    @keyframes cwFadeIn  { from { opacity:0; transform:translateY(6px) } }
    @keyframes cwSlideIn { from { opacity:0; transform:translateX(20px) } }
    @keyframes cwPopIn   { from { opacity:0; transform:scale(0.88) } }
    @keyframes cwBounce  {
      0%,60%,100% { transform:translateY(0) }
      30%         { transform:translateY(-4px) }
    }
    ${design.customThemeCss || ""}
    ${design.customCss || ""}
  `;

  function sendPreview() {
    const txt = input.trim();
    if (!txt) return;
    const uid = `u${Date.now()}`;
    const aid = `a${Date.now()}`;
    setMsgs((p) => [...p, { id: uid, role: "user",      content: txt, time: "now" }]);
    setInput("");
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMsgs((p) => [...p, {
        id: aid, role: "assistant",
        content: `This is a live preview reply to: "${txt}". All your design edits are reflected here in real time.`,
        time: "now",
      }]);
    }, 1200);
  }

  const panelH = Math.min(design.widgetChatHeight, 560);

  return (
    <div className="overflow-hidden rounded-[20px] border border-white/[0.1] shadow-2xl"
      style={{ fontFamily: design.widgetFontFamily, height: panelH, display: "flex", flexDirection: "column",
        borderRadius: design.widgetBorderRadius }}>
      <style>{scrollbarCss}</style>

      {/* Header */}
      <div className="clara-header shrink-0 flex items-center gap-3 px-4"
        style={{
          height: design.headerHeight,
          background: hdrBg,
          color: design.headerTextColor,
          backdropFilter: design.headerBlur ? "blur(12px)" : undefined,
        }}>
        {design.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={design.avatarUrl} alt="" className="clara-avatar"
            style={{ width: 32, height: 32, borderRadius: avatarBr, objectFit: "cover" }} />
        ) : (
          <div className="clara-avatar flex items-center justify-center font-bold text-sm shrink-0"
            style={{ width: 32, height: 32, borderRadius: avatarBr, background: accent,
              color: design.headerTextColor, fontSize: 14 }}>
            {design.assistantName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="clara-header-name font-semibold truncate" style={{ fontSize: 14 }}>
            {design.assistantName}
          </div>
          {design.showStatusDot && (
            <div className="flex items-center gap-1.5">
              <span className="clara-header-status inline-block rounded-full"
                style={{ width: 7, height: 7, background: design.statusDotColor }} />
              <span style={{ fontSize: 11, opacity: 0.75 }}>Online</span>
            </div>
          )}
        </div>
        {design.customHeaderHtml && (
          <div dangerouslySetInnerHTML={{ __html: design.customHeaderHtml }}
            className="flex items-center" />
        )}
      </div>

      {/* Messages */}
      <div ref={msgsRef} className="cw-msgs flex-1 overflow-y-auto px-3 py-3 flex flex-col"
        style={{ gap: design.messageGap, background: chatBg }}>
        {msgs.map((msg) => (
          <div key={msg.id} className="cw-msg-enter" style={{
            display: "flex",
            justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
          }}>
            <div className={msg.role === "user" ? "clara-msg-user" : "clara-msg-bot"}
              style={{
                maxWidth: `${design.messageMaxWidth}%`,
                borderRadius: msg.role === "user" ? design.userBubbleRadius : design.botBubbleRadius,
                padding: msg.role === "user" ? design.userBubblePadding : design.botBubblePadding,
                fontSize: design.messageFontSize,
                lineHeight: design.messageLineHeight,
                background: msg.role === "user" ? userBg : botBg,
                color: msg.role === "user" ? design.userBubbleText : botText,
                border: msg.role === "user" ? "none" : (design.botBubbleBorder || `1px solid ${dark ? "rgba(255,255,255,0.07)" : "#e5e7eb"}`),
                boxShadow: msg.role === "user" ? design.userBubbleShadow : design.botBubbleShadow,
                wordBreak: "break-word",
              }}>
              {msg.content}
              {design.showTimestamps && (
                <div className="clara-timestamp mt-1"
                  style={{ fontSize: design.timestampFontSize, color: design.timestampColor, opacity: 0.7 }}>
                  {msg.time}
                </div>
              )}
            </div>
          </div>
        ))}

        {typing && (
          <div className="flex justify-start">
            <div className="clara-typing flex items-center gap-1 rounded-2xl px-3 py-2"
              style={{ background: botBg, border: `1px solid ${dark ? "rgba(255,255,255,0.07)" : "#e5e7eb"}` }}>
              {[0, 150, 300].map((d) => (
                <span key={d} className="clara-typing-dot inline-block rounded-full"
                  style={{
                    width: design.typingDotSize, height: design.typingDotSize,
                    background: dotColor,
                    animation: `cwBounce 1.2s ${d}ms infinite`,
                  }} />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="clara-input-area shrink-0 px-3 py-2.5"
        style={{ background: inputAreaBg, borderTop: `1px solid ${areaB}` }}>
        <div className="flex items-end gap-2">
          <textarea value={input} rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendPreview(); } }}
            placeholder={`Ask ${design.assistantName}…`}
            className="clara-textarea flex-1 resize-none outline-none"
            style={{
              borderRadius: design.inputRadius,
              border: `1px solid ${inputBorder}`,
              background: inputBg,
              color: inputTxt,
              fontSize: 13,
              fontFamily: "inherit",
              padding: design.inputPadding,
              maxHeight: 80,
              lineHeight: 1.5,
              // @ts-expect-error – placeholder via CSS
              "--ph-color": inputPh,
            }} />
          <button onClick={sendPreview} disabled={!input.trim()}
            className="clara-send-btn shrink-0 flex items-center justify-center transition-all"
            style={{
              width: design.sendBtnSize, height: design.sendBtnSize,
              borderRadius: design.sendBtnRadius,
              background: input.trim() ? sendBg : (dark ? "#2a2a40" : "#e5e7eb"),
              color: input.trim() ? design.sendBtnTextColor : (dark ? "#555" : "#aaa"),
              border: "none",
              cursor: input.trim() ? "pointer" : "not-allowed",
            }}>
            <svg className="clara-send-icon" viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>

        {design.widgetShowBranding && (
          <div className="clara-branding text-center mt-1.5"
            style={{ fontSize: 10, color: footerTxt, background: footerBg2,
              ...(design.customFooterHtml ? {} : {}) }}>
            {design.customFooterHtml
              ? <span dangerouslySetInnerHTML={{ __html: design.customFooterHtml }} />
              : design.customPoweredBy || "Powered by Clara AI"
            }
          </div>
        )}
      </div>

      <style>{`
        .cw-msgs textarea.clara-textarea::placeholder { color: var(--ph-color, #9ca3af); }
        .clara-textarea::placeholder { color: ${inputPh}; }
      `}</style>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Floating Sandbox Preview (real clara.js runtime in an iframe)
// ─────────────────────────────────────────────────────────────────────────────

function escapeJson(v: unknown) {
  return JSON.stringify(v)
    .replace(/</g,"\\u003c").replace(/>/g,"\\u003e")
    .replace(/&/g,"\\u0026").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
}

function buildSandboxDoc(origin: string, d: WidgetDesign) {
  const cfg = {
    ...d, kbId: "preview-kb", kbName: "Admin preview",
    defaultLanguage: "en", voiceEnabled: false, widgetMode: "floating",
  };
  return `<!doctype html><html><head><meta charset="utf-8"/>
<style>
html,body{margin:0;min-height:100%;font-family:Inter,system-ui,sans-serif;
background:radial-gradient(circle at top,rgba(99,102,241,.14),transparent 40%),#0b1020;color:#cbd5e1}
body{position:relative;overflow:hidden}
.sh{min-height:100vh;padding:28px 24px 100px;box-sizing:border-box}
.card{max-width:480px;border:1px solid rgba(255,255,255,.08);border-radius:20px;
padding:18px;background:rgba(15,23,42,.6);backdrop-filter:blur(14px);box-shadow:0 28px 70px rgba(0,0,0,.35)}
.ey{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.5)}
h1{margin:12px 0 8px;font-size:24px;line-height:1.1;color:#fff}
p{margin:0;font-size:13px;line-height:1.7;color:rgba(255,255,255,.65)}
</style></head><body>
<div class="sh"><div class="card">
<div class="ey">Floating sandbox · real clara.js runtime</div>
<h1>Preview the launcher on a real page surface.</h1>
<p>Open the widget, send a message, and see all design edits live.</p>
</div></div>
<script>
window.__CLARA_PREVIEW_CONFIG=${escapeJson(cfg)};
const _fetch=window.fetch.bind(window);
window.fetch=function(input,init){
const url=typeof input==="string"?input:input.url;
if(url.indexOf("/api/embed/config")!==-1)
  return Promise.resolve(new Response(JSON.stringify(window.__CLARA_PREVIEW_CONFIG),{status:200,headers:{"Content-Type":"application/json"}}));
if(url.indexOf("/api/embed/chat")!==-1){
  const body=JSON.parse((init&&init.body)||"{}");
  const msgs=Array.isArray(body.messages)?body.messages:[];
  const last=msgs.filter(m=>m&&m.role==="user").slice(-1)[0];
  const q=last&&typeof last.content==="string"?last.content.trim():"your question";
  const ans="Real clara.js sandbox. Echoing: "+q+". Design edits are live!";
  const chunks=ans.match(/.{1,26}(\\s|$)/g)||[ans];
  const stream=new ReadableStream({start(c){let i=0;function push(){
    if(i>=chunks.length){c.close();return;}
    c.enqueue(new TextEncoder().encode(JSON.stringify({type:"token",payload:chunks[i]})+"\\n"));
    i++;setTimeout(push,35);}push();}});
  return Promise.resolve(new Response(stream,{status:200,headers:{"Content-Type":"application/x-ndjson"}}));
}
return _fetch(input,init);
};
window.addEventListener("message",function(ev){
if(ev.origin!==window.location.origin)return;
if(!ev.data||ev.data.type!=="clara-admin-preview-config")return;
window.__CLARA_PREVIEW_CONFIG={...window.__CLARA_PREVIEW_CONFIG,...ev.data.payload,widgetMode:"floating"};
if(window.ClaraWidget&&typeof window.ClaraWidget.refreshDesign==="function")window.ClaraWidget.refreshDesign();
});
</script>
<script src="${origin}/embed/clara.js" data-key="preview-key" data-mode="floating"></script>
</body></html>`;
}

function FloatingSandboxPreview({ design }: { design: WidgetDesign }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const origin   = typeof window !== "undefined" ? window.location.origin : "";
  const initRef  = useRef(design);
  const srcDoc   = useMemo(() => (origin ? buildSandboxDoc(origin, initRef.current) : ""), [origin]);

  const postMsg = useCallback(() => {
    if (!frameRef.current?.contentWindow || !origin) return;
    frameRef.current.contentWindow.postMessage(
      { type: "clara-admin-preview-config", payload: design }, origin,
    );
  }, [design, origin]);

  useEffect(() => { postMsg(); }, [postMsg]);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a1120]">
      <div className="flex items-center justify-between border-b border-white/[0.08] bg-white/[0.03] px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-white">Floating sandbox</p>
          <p className="text-xs text-white/40">Real clara.js runtime — click the launcher to open</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        </div>
      </div>
      <iframe ref={frameRef} title="Floating sandbox" srcDoc={srcDoc} onLoad={postMsg}
        className="w-full bg-[#09101f]" style={{ height: 420 }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Controls panel — all the granular visual editors
// ─────────────────────────────────────────────────────────────────────────────

function ControlsPanel({
  design, set,
}: {
  design: WidgetDesign;
  set: <K extends keyof WidgetDesign>(k: K, v: WidgetDesign[K]) => void;
}) {
  return (
    <div className="space-y-1">

      {/* ── Global ── */}
      <SectionHeader icon={Palette} label="Brand Colours" />
      <div className="space-y-3 pb-1">
        <Field label="Primary colour" hint="Header, user bubbles, send button, launcher">
          <ColourInput value={design.primaryColour} onChange={(v) => set("primaryColour", v)} />
        </Field>
        <Field label="Accent colour" hint="Avatar background, focus states, highlights">
          <ColourInput value={design.accentColour} onChange={(v) => set("accentColour", v)} />
        </Field>
        <Field label="Launcher button colour" hint="Floating button. Defaults to primary">
          <ColourInput value={design.launcherColour} onChange={(v) => set("launcherColour", v)} />
        </Field>
      </div>

      {/* ── Layout ── */}
      <SectionHeader icon={Layout} label="Layout & Window" />
      <div className="space-y-3 pb-1">
        <Field label="Theme">
          <SegmentedControl value={design.widgetTheme}
            options={[{ label: "Light", value: "light" }, { label: "Dark", value: "dark" }]}
            onChange={(v) => set("widgetTheme", v)} />
        </Field>
        <Field label="Widget position">
          <SegmentedControl value={design.widgetPosition}
            options={[{ label: "Bottom Right", value: "bottom-right" }, { label: "Bottom Left", value: "bottom-left" }]}
            onChange={(v) => set("widgetPosition", v)} small />
        </Field>
        <Field label="Window height" hint="300 – 900 px">
          <RangeInput value={design.widgetChatHeight} min={300} max={900} step={10} unit="px"
            onChange={(v) => set("widgetChatHeight", v)} />
        </Field>
        <Field label="Corner radius" hint="0 = sharp corners, 40 = very round">
          <RangeInput value={design.widgetBorderRadius} min={0} max={40} unit="px"
            onChange={(v) => set("widgetBorderRadius", v)} />
        </Field>
        <Field label="Chat area background" hint="CSS colour or gradient. Empty = theme default">
          <ColourInput value={design.chatAreaBg} onChange={(v) => set("chatAreaBg", v)}
            placeholder="e.g. #f3f4f6 or linear-gradient(…)" />
        </Field>
      </div>

      {/* ── Typography ── */}
      <SectionHeader icon={Type} label="Typography" />
      <div className="space-y-3 pb-1">
        <Field label="Font family">
          <SelectInput value={design.widgetFontFamily} options={FONT_OPTIONS}
            onChange={(v) => set("widgetFontFamily", v)} />
        </Field>
        <Field label="Message font size">
          <RangeInput value={design.messageFontSize} min={10} max={22} unit="px"
            onChange={(v) => set("messageFontSize", v)} />
        </Field>
        <Field label="Message line height">
          <RangeInput value={design.messageLineHeight} min={1} max={2.5} step={0.05} unit="×"
            onChange={(v) => set("messageLineHeight", v)} />
        </Field>
      </div>

      {/* ── Identity ── */}
      <SectionHeader icon={Sparkles} label="Identity" />
      <div className="space-y-3 pb-1">
        <Field label="Assistant name">
          <TextInput value={design.assistantName} onChange={(v) => set("assistantName", v)} />
        </Field>
        <Field label="Welcome message">
          <textarea value={design.welcomeMessage} rows={2}
            onChange={(e) => set("welcomeMessage", e.target.value)}
            className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm
              text-white/80 placeholder-white/20 focus:border-indigo-500/50 focus:outline-none resize-none" />
        </Field>
        <Field label="Avatar URL" hint="Leave empty for the initials fallback">
          <TextInput value={design.avatarUrl} onChange={(v) => set("avatarUrl", v)}
            placeholder="https://example.com/avatar.png" mono />
        </Field>
        <Field label="Avatar shape">
          <SegmentedControl value={design.avatarShape}
            options={[{ label: "Circle", value: "circle" }, { label: "Rounded", value: "rounded" }, { label: "Square", value: "square" }]}
            onChange={(v) => set("avatarShape", v)} small />
        </Field>
      </div>

      {/* ── Header ── */}
      <SectionHeader icon={Layout} label="Header Bar" />
      <div className="space-y-3 pb-1">
        <Field label="Header background" hint="CSS colour or gradient. Empty = primary colour">
          <ColourInput value={design.headerBg} onChange={(v) => set("headerBg", v)}
            placeholder="e.g. linear-gradient(135deg, #6366f1, #8b5cf6)" />
        </Field>
        <Field label="Header text colour">
          <ColourInput value={design.headerTextColor} onChange={(v) => set("headerTextColor", v)} />
        </Field>
        <Field label="Header height">
          <RangeInput value={design.headerHeight} min={44} max={100} unit="px"
            onChange={(v) => set("headerHeight", v)} />
        </Field>
        <Toggle value={design.headerBlur} onChange={(v) => set("headerBlur", v)}
          label="Backdrop blur" hint="Glassmorphism effect on the header" />
        <Toggle value={design.showStatusDot} onChange={(v) => set("showStatusDot", v)}
          label="Show online status dot" />
        {design.showStatusDot && (
          <Field label="Status dot colour">
            <ColourInput value={design.statusDotColor} onChange={(v) => set("statusDotColor", v)} />
          </Field>
        )}
        <Field label="Custom header HTML" hint="Injected inside the header bar">
          <textarea value={design.customHeaderHtml} rows={2}
            onChange={(e) => set("customHeaderHtml", e.target.value)}
            className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2
              text-xs font-mono text-white/80 focus:border-indigo-500/50 focus:outline-none resize-none" />
        </Field>
      </div>

      {/* ── User bubble ── */}
      <SectionHeader icon={MessageSquare} label="User Message Bubble" />
      <div className="space-y-3 pb-1">
        <Field label="Background" hint="Empty = primary colour">
          <ColourInput value={design.userBubbleBg} onChange={(v) => set("userBubbleBg", v)} />
        </Field>
        <Field label="Text colour">
          <ColourInput value={design.userBubbleText} onChange={(v) => set("userBubbleText", v)} />
        </Field>
        <Field label="Border radius (CSS value)" hint='e.g. "18px 18px 4px 18px"'>
          <TextInput value={design.userBubbleRadius} onChange={(v) => set("userBubbleRadius", v)} mono />
        </Field>
        <Field label="Padding" hint='e.g. "10px 14px"'>
          <TextInput value={design.userBubblePadding} onChange={(v) => set("userBubblePadding", v)} mono />
        </Field>
        <Field label="Box shadow" hint='CSS box-shadow or "none"'>
          <TextInput value={design.userBubbleShadow} onChange={(v) => set("userBubbleShadow", v)} mono />
        </Field>
      </div>

      {/* ── Bot bubble ── */}
      <SectionHeader icon={MessageSquare} label="Bot Message Bubble" />
      <div className="space-y-3 pb-1">
        <Field label="Background" hint="Empty = theme default">
          <ColourInput value={design.botBubbleBg} onChange={(v) => set("botBubbleBg", v)}
            placeholder="empty = auto" />
        </Field>
        <Field label="Text colour" hint="Empty = theme default">
          <ColourInput value={design.botBubbleText} onChange={(v) => set("botBubbleText", v)}
            placeholder="empty = auto" />
        </Field>
        <Field label="Border" hint='CSS border. Empty = theme default. e.g. "1px solid #e5e7eb"'>
          <TextInput value={design.botBubbleBorder} onChange={(v) => set("botBubbleBorder", v)} mono />
        </Field>
        <Field label="Border radius (CSS value)">
          <TextInput value={design.botBubbleRadius} onChange={(v) => set("botBubbleRadius", v)} mono />
        </Field>
        <Field label="Padding">
          <TextInput value={design.botBubblePadding} onChange={(v) => set("botBubblePadding", v)} mono />
        </Field>
        <Field label="Box shadow">
          <TextInput value={design.botBubbleShadow} onChange={(v) => set("botBubbleShadow", v)} mono />
        </Field>
      </div>

      {/* ── Message list ── */}
      <SectionHeader icon={Sliders} label="Message List" />
      <div className="space-y-3 pb-1">
        <Field label="Gap between messages">
          <RangeInput value={design.messageGap} min={4} max={40} unit="px"
            onChange={(v) => set("messageGap", v)} />
        </Field>
        <Field label="Bubble max-width">
          <RangeInput value={design.messageMaxWidth} min={50} max={100} unit="%"
            onChange={(v) => set("messageMaxWidth", v)} />
        </Field>
        <Toggle value={design.showTimestamps} onChange={(v) => set("showTimestamps", v)}
          label="Show timestamps" />
        {design.showTimestamps && (
          <>
            <Field label="Timestamp colour">
              <ColourInput value={design.timestampColor} onChange={(v) => set("timestampColor", v)} />
            </Field>
            <Field label="Timestamp font size">
              <RangeInput value={design.timestampFontSize} min={8} max={14} unit="px"
                onChange={(v) => set("timestampFontSize", v)} />
            </Field>
          </>
        )}
        <Field label="Message enter animation">
          <SegmentedControl value={design.messageAnimationStyle}
            options={[
              { label: "Fade",  value: "fade"  },
              { label: "Slide", value: "slide" },
              { label: "Pop",   value: "pop"   },
              { label: "None",  value: "none"  },
            ]}
            onChange={(v) => set("messageAnimationStyle", v)} small />
        </Field>
      </div>

      {/* ── Typing indicator ── */}
      <SectionHeader icon={MessageSquare} label="Typing Indicator" />
      <div className="space-y-3 pb-1">
        <Field label="Dot colour">
          <ColourInput value={design.typingDotColor} onChange={(v) => set("typingDotColor", v)} />
        </Field>
        <Field label="Dot size">
          <RangeInput value={design.typingDotSize} min={3} max={12} unit="px"
            onChange={(v) => set("typingDotSize", v)} />
        </Field>
      </div>

      {/* ── Input ── */}
      <SectionHeader icon={Send} label="Input Area" />
      <div className="space-y-3 pb-1">
        <Field label="Input area background" hint="Strip behind the textarea. Empty = theme default">
          <ColourInput value={design.inputAreaBg} onChange={(v) => set("inputAreaBg", v)}
            placeholder="empty = auto" />
        </Field>
        <Field label="Input area top border" hint="CSS border value. Empty = theme default">
          <TextInput value={design.inputAreaBorder} onChange={(v) => set("inputAreaBorder", v)} mono />
        </Field>
        <Field label="Textarea background" hint="Empty = theme default">
          <ColourInput value={design.inputBg} onChange={(v) => set("inputBg", v)}
            placeholder="empty = auto" />
        </Field>
        <Field label="Textarea border" hint="CSS border value. Empty = theme default">
          <TextInput value={design.inputBorder} onChange={(v) => set("inputBorder", v)} mono />
        </Field>
        <Field label="Textarea focus border" hint="Empty = primary colour">
          <ColourInput value={design.inputBorderFocus} onChange={(v) => set("inputBorderFocus", v)}
            placeholder="empty = primary" />
        </Field>
        <Field label="Textarea border radius">
          <RangeInput value={design.inputRadius} min={0} max={40} unit="px"
            onChange={(v) => set("inputRadius", v)} />
        </Field>
        <Field label="Textarea text colour" hint="Empty = theme default">
          <ColourInput value={design.inputTextColor} onChange={(v) => set("inputTextColor", v)}
            placeholder="empty = auto" />
        </Field>
        <Field label="Placeholder colour" hint="Empty = theme default">
          <ColourInput value={design.inputPlaceholderColor}
            onChange={(v) => set("inputPlaceholderColor", v)} placeholder="empty = auto" />
        </Field>
        <Field label="Textarea padding">
          <TextInput value={design.inputPadding} onChange={(v) => set("inputPadding", v)} mono />
        </Field>
      </div>

      {/* ── Send button ── */}
      <SectionHeader icon={Send} label="Send Button" />
      <div className="space-y-3 pb-1">
        <Field label="Background" hint="Empty = primary colour">
          <ColourInput value={design.sendBtnBg} onChange={(v) => set("sendBtnBg", v)}
            placeholder="empty = primary" />
        </Field>
        <Field label="Hover background" hint="Empty = auto-darken">
          <ColourInput value={design.sendBtnHoverBg} onChange={(v) => set("sendBtnHoverBg", v)}
            placeholder="empty = auto" />
        </Field>
        <Field label="Icon colour">
          <ColourInput value={design.sendBtnTextColor} onChange={(v) => set("sendBtnTextColor", v)} />
        </Field>
        <Field label="Border radius (50 = circle)">
          <RangeInput value={design.sendBtnRadius} min={0} max={50} unit="px"
            onChange={(v) => set("sendBtnRadius", v)} />
        </Field>
        <Field label="Button size">
          <RangeInput value={design.sendBtnSize} min={24} max={64} unit="px"
            onChange={(v) => set("sendBtnSize", v)} />
        </Field>
      </div>

      {/* ── Scrollbar ── */}
      <SectionHeader icon={Sliders} label="Scrollbar" />
      <div className="space-y-3 pb-1">
        <Field label="Width">
          <RangeInput value={design.scrollbarWidth} min={0} max={16} unit="px"
            onChange={(v) => set("scrollbarWidth", v)} />
        </Field>
        <Field label="Thumb colour">
          <ColourInput value={design.scrollbarColor} onChange={(v) => set("scrollbarColor", v)} />
        </Field>
        <Field label="Track colour">
          <ColourInput value={design.scrollbarTrackColor}
            onChange={(v) => set("scrollbarTrackColor", v)} placeholder="transparent" />
        </Field>
      </div>

      {/* ── Branding ── */}
      <SectionHeader icon={Type} label="Branding Footer" />
      <div className="space-y-3 pb-1">
        <Toggle value={design.widgetShowBranding} onChange={(v) => set("widgetShowBranding", v)}
          label='Show "Powered by" footer' />
        {design.widgetShowBranding && (
          <>
            <Field label="Footer text">
              <TextInput value={design.customPoweredBy}
                onChange={(v) => set("customPoweredBy", v)}
                placeholder="Powered by Clara AI" />
            </Field>
            <Field label="Footer background" hint="Empty = transparent">
              <ColourInput value={design.footerBg} onChange={(v) => set("footerBg", v)}
                placeholder="transparent" />
            </Field>
            <Field label="Footer text colour" hint="Empty = theme default">
              <ColourInput value={design.footerTextColor}
                onChange={(v) => set("footerTextColor", v)} placeholder="empty = auto" />
            </Field>
            <Field label="Custom footer HTML" hint="Replaces the text with custom markup">
              <textarea value={design.customFooterHtml} rows={2}
                onChange={(e) => set("customFooterHtml", e.target.value)}
                className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2
                  text-xs font-mono text-white/80 focus:border-indigo-500/50 focus:outline-none resize-none" />
            </Field>
          </>
        )}
      </div>

      {/* ── Widget mode ── */}
      <SectionHeader icon={Monitor} label="Widget Mode" />
      <div className="space-y-3 pb-1">
        <Field label="Render mode" hint="floating = FAB launcher · inline = full page · headless = SDK-only">
          <SegmentedControl value={design.widgetMode}
            options={[{ label: "Floating", value: "floating" }, { label: "Inline", value: "inline" }, { label: "Headless", value: "headless" }]}
            onChange={(v) => set("widgetMode", v)} small />
        </Field>
        <Field label="Launcher button size">
          <RangeInput value={design.widgetButtonSize} min={40} max={80} unit="px"
            onChange={(v) => set("widgetButtonSize", v)} />
        </Field>
        <Field label="Launcher label" hint="Optional text beside the FAB (e.g. 'Chat with us')">
          <TextInput value={design.widgetLauncherLabel}
            onChange={(v) => set("widgetLauncherLabel", v)} placeholder="Chat with us" />
        </Field>
        <Field label="Custom launcher SVG" hint="Paste raw SVG markup for the floating button icon">
          <textarea value={design.customLauncherSvg} rows={3}
            onChange={(e) => set("customLauncherSvg", e.target.value)}
            className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2
              text-xs font-mono text-white/80 focus:border-indigo-500/50 focus:outline-none resize-none" />
        </Field>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Advanced Code Editor panel
// ─────────────────────────────────────────────────────────────────────────────

function AdvancedCodePanel({
  design, set, kbId,
}: {
  design: WidgetDesign;
  set: <K extends keyof WidgetDesign>(k: K, v: WidgetDesign[K]) => void;
  kbId: string;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3">
        <div className="flex items-start gap-3">
          <Code2 className="h-4 w-4 text-indigo-300 mt-0.5 shrink-0" />
          <div className="text-xs text-white/60 leading-relaxed">
            <strong className="text-white/90">Full design control via code.</strong>{" "}
            Write real CSS targeting{" "}
            <code className="bg-white/10 rounded px-1">.clara-*</code>{" "}
            classes or override CSS variables — not JSON properties.
            The Theme CSS editor is the primary power tool.
            JS Hooks let you intercept widget events.
          </div>
        </div>
      </div>

      <Tabs defaultValue="theme">
        <TabsList className="h-auto flex-wrap justify-start gap-1.5 rounded-xl bg-[#0b1020] p-1.5">
          {[
            { value: "theme",    label: "theme.css",      hint: "Full CSS control" },
            { value: "inject",   label: "inject.css",     hint: "Shadow-DOM injection" },
            { value: "header",   label: "header.html",    hint: "Header slot" },
            { value: "footer",   label: "footer.html",    hint: "Footer slot" },
            { value: "launcher", label: "launcher.svg",   hint: "FAB icon" },
            { value: "hooks",    label: "hooks.js",       hint: "Event hooks" },
          ].map(({ value, label, hint }) => (
            <TabsTrigger key={value} value={value}
              className="flex flex-col items-start rounded-lg bg-transparent px-3 py-2 text-left
                data-[state=active]:bg-indigo-600/20 data-[state=active]:text-indigo-200
                data-[state=active]:shadow-[inset_0_0_0_1px_rgba(99,102,241,0.4)]
                text-white/45 hover:text-white transition-all">
              <span className="text-xs font-semibold">{label}</span>
              <span className="text-[10px] opacity-60">{hint}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* theme.css — CSS variable overrides + full class rules */}
        <TabsContent value="theme" className="mt-4">
          <LiveCodeEditor
            title="Widget Theme CSS"
            description="Write real CSS targeting .clara-* classes or override CSS variables. This is the primary power tool for complete design control — not JSON property editing."
            language="css"
            value={design.customThemeCss}
            onChange={(v) => set("customThemeCss", v)}
            path={`inmemory://widget/${kbId}/theme.css`}
            height={460}
            minimap
          />
          <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
            <p className="text-[11px] font-semibold text-white/50 mb-2 uppercase tracking-wider">Available CSS classes</p>
            <div className="grid grid-cols-2 gap-1 text-[11px] font-mono text-indigo-300/80">
              {[
                ".clara-widget", ".clara-header", ".clara-header-name",
                ".clara-header-status", ".clara-avatar", ".clara-messages",
                ".clara-msg-user", ".clara-msg-bot", ".clara-timestamp",
                ".clara-sources", ".clara-typing", ".clara-typing-dot",
                ".clara-input-area", ".clara-textarea", ".clara-send-btn",
                ".clara-send-icon", ".clara-branding",
              ].map((cls) => (
                <span key={cls} className="rounded bg-white/[0.04] px-2 py-0.5">{cls}</span>
              ))}
            </div>
            <p className="text-[11px] font-semibold text-white/50 mt-3 mb-2 uppercase tracking-wider">CSS variables</p>
            <div className="grid grid-cols-2 gap-1 text-[11px] font-mono text-emerald-300/80">
              {[
                "--clara-primary", "--clara-accent", "--clara-radius",
                "--clara-font", "--clara-header-h", "--clara-msg-gap",
              ].map((v) => (
                <span key={v} className="rounded bg-white/[0.04] px-2 py-0.5">{v}</span>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* inject.css — shadow-DOM raw injection */}
        <TabsContent value="inject" className="mt-4">
          <LiveCodeEditor
            title="Custom CSS Injection"
            description="Raw CSS injected directly into the widget's shadow DOM (floating mode) or page styles (inline mode). Use this for low-level overrides like custom animations or third-party font imports."
            language="css"
            value={design.customCss}
            onChange={(v) => set("customCss", v)}
            path={`inmemory://widget/${kbId}/inject.css`}
            height={400}
            minimap
          />
        </TabsContent>

        {/* header.html */}
        <TabsContent value="header" className="mt-4">
          <LiveCodeEditor
            title="Header HTML Slot"
            description="HTML rendered inside the widget header bar. Add icons, status chips, close buttons, or custom nav elements."
            language="html"
            value={design.customHeaderHtml}
            onChange={(v) => set("customHeaderHtml", v)}
            path={`inmemory://widget/${kbId}/header.html`}
            height={280}
          />
        </TabsContent>

        {/* footer.html */}
        <TabsContent value="footer" className="mt-4">
          <LiveCodeEditor
            title="Footer HTML Slot"
            description="Replaces the 'Powered by' branding with custom HTML. Add links, logos, or legal text."
            language="html"
            value={design.customFooterHtml}
            onChange={(v) => set("customFooterHtml", v)}
            path={`inmemory://widget/${kbId}/footer.html`}
            height={240}
          />
        </TabsContent>

        {/* launcher.svg */}
        <TabsContent value="launcher" className="mt-4">
          <LiveCodeEditor
            title="Floating Launcher SVG Icon"
            description="Replace the default chat bubble icon with any SVG. Paste raw <svg> markup here."
            language="html"
            value={design.customLauncherSvg}
            onChange={(v) => set("customLauncherSvg", v)}
            path={`inmemory://widget/${kbId}/launcher.svg`}
            height={280}
          />
        </TabsContent>

        {/* hooks.js */}
        <TabsContent value="hooks" className="mt-4">
          <LiveCodeEditor
            title="Widget Behaviour Hooks (JS)"
            description="JavaScript hooks injected into the page. Use window.ClaraHooks to intercept messages, react to open/close events, or add custom analytics."
            language="typescript"
            value={design.customInjectJs}
            onChange={(v) => set("customInjectJs", v)}
            path={`inmemory://widget/${kbId}/hooks.js`}
            height={400}
            minimap
          />
          <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-300/80">
            <strong className="text-amber-200">Note:</strong> Hook code runs on the end-user&apos;s page. Keep it minimal and avoid external dependencies. Errors here will be silently caught.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Main exported panel
// ─────────────────────────────────────────────────────────────────────────────

export function WidgetDesignPanel({ kbId }: { kbId: string }) {
  const [design, setDesign] = useState<WidgetDesign>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Which tab is active in the main panel
  const [mainTab, setMainTab] = useState<"visual" | "code" | "preview">("visual");

  // Preview mode within the preview tab
  const [sandboxOpen, setSandboxOpen] = useState(false);

  // Advanced code panel collapse
  const [advOpen, setAdvOpen] = useState(false);

  // Load config
  useEffect(() => {
    if (!kbId) return;
    fetch(apiUrl(`/api/kbs/${kbId}/config`), { headers: withAuthHeaders({}) })
      .then((r) => r.json())
      .then((data) => {
        setDesign(normalize({
          ...data,
          launcherColour: data.launcherColour ?? data.primaryColour,
        }));
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
          primaryColour:         design.primaryColour,
          accentColour:          design.accentColour,
          launcherColour:        design.launcherColour,
          widgetTheme:           design.widgetTheme,
          widgetPosition:        design.widgetPosition,
          widgetButtonSize:      design.widgetButtonSize,
          widgetBorderRadius:    design.widgetBorderRadius,
          widgetFontFamily:      design.widgetFontFamily,
          widgetChatHeight:      design.widgetChatHeight,
          widgetShowBranding:    design.widgetShowBranding,
          widgetLauncherLabel:   design.widgetLauncherLabel || null,
          widgetMode:            design.widgetMode,
          assistantName:         design.assistantName,
          welcomeMessage:        design.welcomeMessage,
          avatarUrl:             design.avatarUrl || null,

          headerBg:              design.headerBg || null,
          headerTextColor:       design.headerTextColor,
          headerHeight:          design.headerHeight,
          headerBlur:            design.headerBlur,
          showStatusDot:         design.showStatusDot,
          statusDotColor:        design.statusDotColor,
          avatarShape:           design.avatarShape,

          chatAreaBg:            design.chatAreaBg || null,

          userBubbleBg:          design.userBubbleBg || null,
          userBubbleText:        design.userBubbleText,
          userBubbleRadius:      design.userBubbleRadius,
          userBubblePadding:     design.userBubblePadding,
          userBubbleShadow:      design.userBubbleShadow,

          botBubbleBg:           design.botBubbleBg || null,
          botBubbleText:         design.botBubbleText || null,
          botBubbleRadius:       design.botBubbleRadius,
          botBubbleBorder:       design.botBubbleBorder || null,
          botBubblePadding:      design.botBubblePadding,
          botBubbleShadow:       design.botBubbleShadow,

          messageGap:            design.messageGap,
          messageMaxWidth:       design.messageMaxWidth,
          messageFontSize:       design.messageFontSize,
          messageLineHeight:     design.messageLineHeight,

          showTimestamps:        design.showTimestamps,
          timestampColor:        design.timestampColor,
          timestampFontSize:     design.timestampFontSize,

          typingDotColor:        design.typingDotColor,
          typingDotSize:         design.typingDotSize,

          inputBg:               design.inputBg || null,
          inputBorder:           design.inputBorder || null,
          inputBorderFocus:      design.inputBorderFocus || null,
          inputRadius:           design.inputRadius,
          inputTextColor:        design.inputTextColor || null,
          inputPlaceholderColor: design.inputPlaceholderColor || null,
          inputPadding:          design.inputPadding,
          inputAreaBg:           design.inputAreaBg || null,
          inputAreaBorder:       design.inputAreaBorder || null,

          sendBtnBg:             design.sendBtnBg || null,
          sendBtnHoverBg:        design.sendBtnHoverBg || null,
          sendBtnTextColor:      design.sendBtnTextColor,
          sendBtnRadius:         design.sendBtnRadius,
          sendBtnSize:           design.sendBtnSize,

          scrollbarWidth:        design.scrollbarWidth,
          scrollbarColor:        design.scrollbarColor,
          scrollbarTrackColor:   design.scrollbarTrackColor,

          footerBg:              design.footerBg || null,
          footerTextColor:       design.footerTextColor || null,
          customPoweredBy:       design.customPoweredBy || null,

          animationsEnabled:     design.animationsEnabled,
          messageAnimationStyle: design.messageAnimationStyle,

          customCss:             design.customCss || null,
          customLauncherSvg:     design.customLauncherSvg || null,
          customHeaderHtml:      design.customHeaderHtml || null,
          customFooterHtml:      design.customFooterHtml || null,
          customThemeCss:        design.customThemeCss || null,
          customInjectJs:        design.customInjectJs || null,
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
    if (!confirm("Reset all design settings to factory defaults?")) return;
    setDesign(DEFAULTS);
    setSaved(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-white/40 py-8">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Loading widget design…
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Top bar ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-white">Widget Design</h2>
          <p className="mt-0.5 text-sm text-white/50">
            Deep customise every visual element. Live preview updates instantly — save when ready.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={handleReset}
            className="text-white/35 hover:text-white text-xs">Reset defaults</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-5">
            {saving ? "Saving…" : saved ? "✔ Saved!" : "Save design"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </p>
      )}

      {/* ── Main tabs ── */}
      <div className="flex items-center gap-1 rounded-xl bg-white/[0.03] p-1 border border-white/[0.08] w-fit">
        {([
          { id: "visual",  label: "Visual Controls", icon: Palette },
          { id: "code",    label: "Code Editor",     icon: Code2 },
          { id: "preview", label: "Preview",          icon: Eye },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setMainTab(id)}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all ${
              mainTab === id
                ? "bg-indigo-600/20 text-indigo-200 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.4)]"
                : "text-white/45 hover:text-white hover:bg-white/[0.04]"
            }`}>
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Visual Controls + inline preview ── */}
      {mainTab === "visual" && (
        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] items-start">
          {/* Controls scrollable column */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5
            lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto">
            <Suspense fallback={<div className="h-10 animate-pulse rounded-xl bg-white/5" />}>
              <ControlsPanel design={design} set={set} />
            </Suspense>
          </div>

          {/* Live React preview — always full height, no collapse */}
          <div className="lg:sticky lg:top-6 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-white/30">Live Preview</p>
                <p className="text-xs text-white/40 mt-0.5">Updates instantly as you edit. No save required.</p>
              </div>
              <button onClick={() => setSandboxOpen(!sandboxOpen)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10
                  bg-white/[0.03] px-3 py-1.5 text-xs text-white/50 hover:text-white hover:bg-white/[0.06]">
                <Monitor className="h-3.5 w-3.5" />
                {sandboxOpen ? "Hide real sandbox" : "Real runtime sandbox"}
              </button>
            </div>

            <WidgetPreview design={design} />

            {sandboxOpen && (
              <FloatingSandboxPreview design={design} />
            )}

            <p className="text-[11px] text-white/25 text-center">
              Left panel = live React preview · Real sandbox = actual clara.js runtime
            </p>
          </div>
        </div>
      )}

      {/* ── Code Editor ── */}
      {mainTab === "code" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
          <AdvancedCodePanel design={design} set={set} kbId={kbId} />

          {/* mini preview beside code */}
          <div className="lg:sticky lg:top-6 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/30">Live Preview</p>
            <WidgetPreview design={design} />
          </div>
        </div>
      )}

      {/* ── Full preview tab ── */}
      {mainTab === "preview" && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2 items-start">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/30">
                Design Preview (React)
              </p>
              <p className="text-xs text-white/40">
                Rendered directly from your current design settings. Fully interactive — try sending a message.
              </p>
              <WidgetPreview design={design} />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/30">
                Real Runtime Sandbox
              </p>
              <p className="text-xs text-white/40">
                Real clara.js widget inside an isolated page. Click the launcher bubble to open.
              </p>
              <FloatingSandboxPreview design={design} />
            </div>
          </div>

          <Collapsible open={advOpen} onOpenChange={setAdvOpen}>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02]">
              <div className="flex items-center justify-between gap-4 px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-white">Inline embed preview</p>
                  <p className="text-xs text-white/40 mt-0.5">
                    Load the actual <code className="bg-white/10 rounded px-1">/embed/widget</code> page surface in preview mode.
                  </p>
                </div>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="outline" size="sm"
                    className="border-white/10 bg-white/[0.03] text-white/60 hover:text-white shrink-0">
                    <ChevronDown className={`mr-1.5 h-4 w-4 transition-transform ${advOpen ? "rotate-180" : ""}`} />
                    {advOpen ? "Collapse" : "Show inline embed"}
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <div className="border-t border-white/[0.08]">
                  <InlineEmbedPreview design={design} kbId={kbId} />
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Inline embed preview (real /embed/widget page, sends postMessage for config)
// ─────────────────────────────────────────────────────────────────────────────

function InlineEmbedPreview({ design, kbId }: { design: WidgetDesign; kbId: string }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const origin   = typeof window !== "undefined" ? window.location.origin : "";

  const payload = useMemo(() => ({
    kbId,
    kbName:         "Admin preview",
    assistantName:  design.assistantName,
    avatarUrl:      design.avatarUrl || null,
    welcomeMessage: design.welcomeMessage,
    primaryColour:  design.primaryColour,
    accentColour:   design.accentColour,
    defaultLanguage: "en",
    widgetTheme:    design.widgetTheme,
    widgetBorderRadius: design.widgetBorderRadius,
    widgetFontFamily:   design.widgetFontFamily,
    widgetShowBranding: design.widgetShowBranding,
    customCss:          design.customCss || null,
    customThemeCss:     design.customThemeCss || null,
    customPoweredBy:    design.customPoweredBy || null,
    customHeaderHtml:   design.customHeaderHtml || null,
    customFooterHtml:   design.customFooterHtml || null,
    // extended fields
    headerBg:           design.headerBg || null,
    headerTextColor:    design.headerTextColor,
    headerHeight:       design.headerHeight,
    showStatusDot:      design.showStatusDot,
    statusDotColor:     design.statusDotColor,
    avatarShape:        design.avatarShape,
    chatAreaBg:         design.chatAreaBg || null,
    userBubbleBg:       design.userBubbleBg || null,
    userBubbleText:     design.userBubbleText,
    userBubbleRadius:   design.userBubbleRadius,
    botBubbleBg:        design.botBubbleBg || null,
    botBubbleText:      design.botBubbleText || null,
    botBubbleBorder:    design.botBubbleBorder || null,
    messageFontSize:    design.messageFontSize,
    messageLineHeight:  design.messageLineHeight,
    inputBg:            design.inputBg || null,
    inputBorder:        design.inputBorder || null,
    inputRadius:        design.inputRadius,
    sendBtnBg:          design.sendBtnBg || null,
    sendBtnRadius:      design.sendBtnRadius,
    sendBtnSize:        design.sendBtnSize,
  }), [design, kbId]);

  const postMsg = useCallback(() => {
    if (!frameRef.current?.contentWindow || !origin) return;
    frameRef.current.contentWindow.postMessage(
      { type: "clara-admin-preview-config", payload }, origin,
    );
  }, [origin, payload]);

  useEffect(() => { postMsg(); }, [postMsg]);

  return (
    <iframe ref={frameRef} title="Inline embed preview"
      src="/embed/widget?preview=1"
      onLoad={postMsg}
      className="w-full"
      style={{ height: 520 }}
      sandbox="allow-scripts allow-same-origin allow-forms" />
  );
}

