"use client";
/**
 * WidgetDesignPanel.tsx — Complete deep widget design editor.
 * • Every property saves to DB via PATCH /api/kbs/:kbId/config
 * • Advanced code editors are SYNCED with visual controls (generate real CSS from design state)
 * • Every control has plain-English placeholder/hint for non-technical users
 * • Live React preview reflects design instantly, no iframe collapse
 */

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import {
  ChevronDown, Code2, Eye, RefreshCw, Palette, Layout, Type,
  MessageSquare, Send, Sliders, Sparkles, Monitor, Wand2, Check,
} from "lucide-react";
import { Button }          from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { LiveCodeEditor }  from "@/components/admin/live-code-editor";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl }          from "@/lib/runtime";

// ─────────────────────────────────────────────────────────────────────────────
// Type
// ─────────────────────────────────────────────────────────────────────────────

type WidgetDesign = {
  primaryColour: string;   accentColour: string;    launcherColour: string;
  widgetTheme: "light"|"dark";  widgetPosition: "bottom-right"|"bottom-left";
  widgetButtonSize: number; widgetBorderRadius: number; widgetFontFamily: string;
  widgetChatHeight: number; widgetShowBranding: boolean; widgetLauncherLabel: string;
  widgetMode: "floating"|"inline"|"headless";
  assistantName: string; welcomeMessage: string; avatarUrl: string;
  headerBg: string; headerTextColor: string; headerHeight: number;
  headerBlur: boolean; showStatusDot: boolean; statusDotColor: string;
  avatarShape: "circle"|"rounded"|"square";
  chatAreaBg: string;
  userBubbleBg: string; userBubbleText: string; userBubbleRadius: string;
  userBubblePadding: string; userBubbleShadow: string;
  botBubbleBg: string; botBubbleText: string; botBubbleRadius: string;
  botBubbleBorder: string; botBubblePadding: string; botBubbleShadow: string;
  messageGap: number; messageMaxWidth: number; messageFontSize: number;
  messageLineHeight: number;
  showTimestamps: boolean; timestampColor: string; timestampFontSize: number;
  typingDotColor: string; typingDotSize: number;
  inputBg: string; inputBorder: string; inputBorderFocus: string;
  inputRadius: number; inputTextColor: string; inputPlaceholderColor: string;
  inputPadding: string; inputAreaBg: string; inputAreaBorder: string;
  sendBtnBg: string; sendBtnHoverBg: string; sendBtnTextColor: string;
  sendBtnRadius: number; sendBtnSize: number;
  scrollbarWidth: number; scrollbarColor: string; scrollbarTrackColor: string;
  footerBg: string; footerTextColor: string; customPoweredBy: string;
  animationsEnabled: boolean; messageAnimationStyle: "fade"|"slide"|"pop"|"none";
  customCss: string; customLauncherSvg: string; customHeaderHtml: string;
  customFooterHtml: string; customThemeCss: string; customInjectJs: string;
};


// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

const D: WidgetDesign = {
  primaryColour:"#6366f1",   accentColour:"#818cf8",  launcherColour:"#6366f1",
  widgetTheme:"light",       widgetPosition:"bottom-right",
  widgetButtonSize:56,       widgetBorderRadius:20,
  widgetFontFamily:"system-ui,sans-serif",
  widgetChatHeight:580,      widgetShowBranding:true,  widgetLauncherLabel:"",
  widgetMode:"floating",
  assistantName:"Clara",     welcomeMessage:"Hi! How can I help you today?",  avatarUrl:"",
  headerBg:"",               headerTextColor:"#ffffff",  headerHeight:60,
  headerBlur:false,          showStatusDot:true,         statusDotColor:"#4ade80",
  avatarShape:"circle",
  chatAreaBg:"",
  userBubbleBg:"",           userBubbleText:"#ffffff",
  userBubbleRadius:"18px 18px 4px 18px",  userBubblePadding:"10px 14px",
  userBubbleShadow:"0 1px 4px rgba(0,0,0,0.15)",
  botBubbleBg:"",            botBubbleText:"",
  botBubbleRadius:"18px 18px 18px 4px",   botBubbleBorder:"",
  botBubblePadding:"10px 14px",           botBubbleShadow:"0 1px 3px rgba(0,0,0,0.08)",
  messageGap:12,             messageMaxWidth:85,   messageFontSize:13,
  messageLineHeight:1.5,
  showTimestamps:false,      timestampColor:"#9ca3af",   timestampFontSize:10,
  typingDotColor:"#9ca3af",  typingDotSize:6,
  inputBg:"",                inputBorder:"",    inputBorderFocus:"",
  inputRadius:12,            inputTextColor:"", inputPlaceholderColor:"",
  inputPadding:"8px 12px",   inputAreaBg:"",    inputAreaBorder:"",
  sendBtnBg:"",              sendBtnHoverBg:"", sendBtnTextColor:"#ffffff",
  sendBtnRadius:10,          sendBtnSize:36,
  scrollbarWidth:4,          scrollbarColor:"#c7d2fe", scrollbarTrackColor:"transparent",
  footerBg:"",               footerTextColor:"",        customPoweredBy:"Powered by Clara AI",
  animationsEnabled:true,    messageAnimationStyle:"fade",
  customCss:"",              customLauncherSvg:"",
  customHeaderHtml:"",       customFooterHtml:"",
  customThemeCss:"",         customInjectJs:"",
};

const FONTS = [
  {label:"System UI (default)", value:"system-ui,sans-serif"},
  {label:"Inter",               value:"Inter,system-ui,sans-serif"},
  {label:"Poppins",             value:"Poppins,system-ui,sans-serif"},
  {label:"Roboto",              value:"Roboto,system-ui,sans-serif"},
  {label:"Open Sans",           value:"'Open Sans',system-ui,sans-serif"},
  {label:"DM Sans",             value:"'DM Sans',system-ui,sans-serif"},
  {label:"Nunito",              value:"Nunito,system-ui,sans-serif"},
  {label:"Lato",                value:"Lato,system-ui,sans-serif"},
  {label:"Georgia (serif)",     value:"Georgia,serif"},
  {label:"Courier (mono)",      value:"'Courier New',monospace"},
];


// ─────────────────────────────────────────────────────────────────────────────
// CODE GENERATOR — generates real CSS + JS synced with current design state
// This is what fills the code editors so developers see live, working code
// ─────────────────────────────────────────────────────────────────────────────

function generateThemeCss(d: WidgetDesign): string {
  const primary = d.primaryColour||"#6366f1";
  const accent  = d.accentColour||"#818cf8";
  const dark    = d.widgetTheme==="dark";
  const userBg  = d.userBubbleBg||primary;
  const botBg   = d.botBubbleBg||(dark?"#2a2a40":"#f0f0f8");
  const botTxt  = d.botBubbleText||(dark?"#e2e2f0":"#1f2937");
  const inputBg = d.inputBg||(dark?"#1a1a2e":"#ffffff");
  const sendBg  = d.sendBtnBg||primary;
  const hdrBg   = d.headerBg||primary;
  const chatBg  = d.chatAreaBg||(dark?"#0f0f1a":"#f8f9fd");
  const border  = dark?"rgba(255,255,255,0.08)":"#e5e7eb";

  return `/* ═══════════════════════════════════════════════════════════════
   Clara Widget Theme — auto-generated from your Visual Controls
   Edit freely. Your changes here sync back to the visual controls.

   🎨 Available CSS classes you can target:
      .clara-widget       → root container
      .clara-header       → top header bar
      .clara-header-name  → assistant name in header
      .clara-messages     → scrollable message list
      .clara-msg-user     → user message bubble
      .clara-msg-bot      → bot / assistant message bubble
      .clara-timestamp    → message timestamp text
      .clara-typing       → typing indicator container
      .clara-typing-dot   → each animated bounce dot
      .clara-input-area   → bottom input strip
      .clara-textarea     → text input field
      .clara-send-btn     → send button
      .clara-send-icon    → SVG arrow inside send button
      .clara-branding     → "Powered by" footer
      .clara-avatar       → avatar image / initials circle

   📐 CSS Variables you can override:
      --clara-primary     current: ${primary}
      --clara-accent      current: ${accent}
      --clara-radius      current: ${d.widgetBorderRadius}px
      --clara-font        current: ${d.widgetFontFamily}
═══════════════════════════════════════════════════════════════ */

/* ── Root / Container ─────────────────────────────────────────────────── */
.clara-widget {
  font-family: ${d.widgetFontFamily};
  background: ${chatBg};
  border-radius: ${d.widgetBorderRadius}px;
  overflow: hidden;
}

/* ── Header ───────────────────────────────────────────────────────────── */
.clara-header {
  background: ${hdrBg || `linear-gradient(135deg, ${primary}, ${accent})`};
  color: ${d.headerTextColor||"#ffffff"};
  height: ${d.headerHeight}px;
  ${d.headerBlur ? "backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);" : ""}
  /* Tip: You can use a gradient, e.g.:
     background: linear-gradient(135deg, #6366f1, #8b5cf6); */
}

.clara-header-name {
  font-size: 14px;
  font-weight: 600;
}

.clara-avatar {
  border-radius: ${d.avatarShape==="square"?"4px":d.avatarShape==="rounded"?"8px":"50%"};
  width: 32px;
  height: 32px;
  object-fit: cover;
}

/* ── Message list ────────────────────────────────────────────────────── */
.clara-messages {
  background: ${chatBg};
  /* gap between messages is set via inline style (${d.messageGap}px) */
}

/* ── User bubble ─────────────────────────────────────────────────────── */
.clara-msg-user {
  background: ${userBg};
  color: ${d.userBubbleText||"#ffffff"};
  border-radius: ${d.userBubbleRadius||"18px 18px 4px 18px"};
  padding: ${d.userBubblePadding||"10px 14px"};
  font-size: ${d.messageFontSize}px;
  line-height: ${d.messageLineHeight};
  box-shadow: ${d.userBubbleShadow||"0 1px 4px rgba(0,0,0,0.15)"};
  max-width: ${d.messageMaxWidth}%;
}

/* ── Bot bubble ──────────────────────────────────────────────────────── */
.clara-msg-bot {
  background: ${botBg};
  color: ${botTxt};
  border-radius: ${d.botBubbleRadius||"18px 18px 18px 4px"};
  padding: ${d.botBubblePadding||"10px 14px"};
  border: ${d.botBubbleBorder||`1px solid ${border}`};
  font-size: ${d.messageFontSize}px;
  line-height: ${d.messageLineHeight};
  box-shadow: ${d.botBubbleShadow||"0 1px 3px rgba(0,0,0,0.08)"};
  max-width: ${d.messageMaxWidth}%;
}

/* ── Typing indicator ────────────────────────────────────────────────── */
.clara-typing {
  background: ${botBg};
  border: 1px solid ${border};
  border-radius: 18px;
  padding: 8px 12px;
  display: inline-flex;
  gap: 4px;
  align-items: center;
}

.clara-typing-dot {
  width: ${d.typingDotSize}px;
  height: ${d.typingDotSize}px;
  background: ${d.typingDotColor||"#9ca3af"};
  border-radius: 50%;
  animation: claraBounce 1.2s infinite;
}

@keyframes claraBounce {
  0%, 60%, 100% { transform: translateY(0); }
  30%           { transform: translateY(-4px); }
}

/* ── Input area ──────────────────────────────────────────────────────── */
.clara-input-area {
  background: ${d.inputAreaBg||(dark?"#0f0f1a":"#ffffff")};
  border-top: ${d.inputAreaBorder||`1px solid ${border}`};
  padding: 12px;
}

.clara-textarea {
  background: ${inputBg};
  border: ${d.inputBorder||`1px solid ${border}`};
  border-radius: ${d.inputRadius}px;
  padding: ${d.inputPadding||"8px 12px"};
  color: ${d.inputTextColor||(dark?"#e2e2f0":"#1f2937")};
  font-size: 13px;
  font-family: inherit;
  line-height: 1.5;
  resize: none;
  outline: none;
  /* Tip: Add a focus ring — the browser :focus pseudo-class works here */
}

.clara-textarea::placeholder {
  color: ${d.inputPlaceholderColor||(dark?"#555575":"#9ca3af")};
}

.clara-textarea:focus {
  border-color: ${d.inputBorderFocus||primary};
  box-shadow: 0 0 0 3px ${(d.inputBorderFocus||primary)}33;
}

/* ── Send button ─────────────────────────────────────────────────────── */
.clara-send-btn {
  background: ${sendBg};
  color: ${d.sendBtnTextColor||"#ffffff"};
  border-radius: ${d.sendBtnRadius}px;
  /* 50px radius = fully circular button */
  width: ${d.sendBtnSize}px;
  height: ${d.sendBtnSize}px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, transform 0.1s;
  flex-shrink: 0;
}

.clara-send-btn:hover {
  background: ${d.sendBtnHoverBg||`${sendBg}dd`};
  transform: scale(1.05);
}

.clara-send-btn:active {
  transform: scale(0.96);
}

/* ── Scrollbar ───────────────────────────────────────────────────────── */
.clara-messages::-webkit-scrollbar {
  width: ${d.scrollbarWidth}px;
}

.clara-messages::-webkit-scrollbar-track {
  background: ${d.scrollbarTrackColor||"transparent"};
}

.clara-messages::-webkit-scrollbar-thumb {
  background: ${d.scrollbarColor||"#c7d2fe"};
  border-radius: 99px;
}

/* ── Branding footer ─────────────────────────────────────────────────── */
.clara-branding {
  text-align: center;
  margin-top: 8px;
  font-size: 10px;
  color: ${d.footerTextColor||(dark?"#3a3a5a":"#d1d5db")};
  background: ${d.footerBg||"transparent"};
}

/* ── Message enter animation ─────────────────────────────────────────── */
/* Current: ${d.messageAnimationStyle} */
.cw-msg {
  animation: ${
    d.messageAnimationStyle==="slide"?"cwSlideIn 0.22s ease":
    d.messageAnimationStyle==="pop"  ?"cwPopIn 0.18s cubic-bezier(0.34,1.56,0.64,1)":
    d.messageAnimationStyle==="none" ?"none":
    "cwFadeIn 0.18s ease"
  } both;
}

@keyframes cwFadeIn  { from { opacity: 0; transform: translateY(6px); } }
@keyframes cwSlideIn { from { opacity: 0; transform: translateX(20px); } }
@keyframes cwPopIn   { from { opacity: 0; transform: scale(0.88); } }

/* ──────────────────────────────────────────────────────────────────────
   ✏️  ADD YOUR OWN RULES BELOW
   These will merge with the settings above.
────────────────────────────────────────────────────────────────────── */

`;
}

function generateInjectJs(d: WidgetDesign): string {
  return `/* ════════════════════════════════════════════════════════════════
   Clara Widget — Behaviour Hooks
   Auto-generated template. Uncomment and edit the hooks you need.
   No coding experience required — just follow the comments!
════════════════════════════════════════════════════════════════

   Current assistant: ${d.assistantName}
   All hooks are optional. Remove any you don't need.

   💡 How to use:
      Uncomment a hook by removing the // at the start of each line.
      Save the design and the hooks will be live immediately.
════════════════════════════════════════════════════════════════ */

window.ClaraHooks = {

  // ── Called BEFORE the user message is sent ──────────────────────────────
  // Return false to block the message (e.g. require login first).
  //
  // onBeforeSend(message) {
  //   console.log("User wants to send:", message);
  //   // Example: block empty messages
  //   if (!message.trim()) return false;
  //   return true; // allow the message
  // },

  // ── Called when the assistant finishes its FULL reply ───────────────────
  // Great for analytics or logging.
  //
  // onResponse(text, sources) {
  //   console.log("Assistant replied:", text.slice(0, 80) + "...");
  //   // Example: send to your analytics tool
  //   // analytics.track("chat_response", { length: text.length });
  // },

  // ── Called for EVERY streaming token (word-by-word) ─────────────────────
  // Only use this for real-time effects — it fires very frequently!
  //
  // onToken(token) {
  //   // Example: scroll a custom container on each token
  // },

  // ── Called when the chat widget OPENS ───────────────────────────────────
  //
  // onOpen() {
  //   document.title = "💬 Chat with ${d.assistantName}";
  //   // Example: hide a help bubble when chat opens
  //   // document.getElementById("help-bubble")?.remove();
  // },

  // ── Called when the chat widget CLOSES ──────────────────────────────────
  //
  // onClose() {
  //   document.title = "My Website"; // restore page title
  // },

};
`;
}

function generateCustomCss(d: WidgetDesign): string {
  const primary = d.primaryColour||"#6366f1";
  return `/* ════════════════════════════════════════════════════════════
   Custom CSS — injected directly into the widget
   Use this for one-off overrides or special animations.

   💡 Tip for non-developers:
      Each rule below follows this pattern:
        selector { property: value; }

      Example — make the send button round:
        .clara-send-btn { border-radius: 50% !important; }

      Example — add a gradient header:
        .clara-header {
          background: linear-gradient(135deg, ${primary}, ${d.accentColour||"#8b5cf6"}) !important;
        }

      Example — give bot bubbles a soft border:
        .clara-msg-bot {
          border: 2px solid ${primary}44 !important;
        }
════════════════════════════════════════════════════════════ */

/* Add your custom CSS rules here: */

`;
}


// ─────────────────────────────────────────────────────────────────────────────
// Tiny UI helpers
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2.5 pt-4 pb-1">
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
  const isHex = /^#[0-9a-fA-F]{3,8}$/.test(value);
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={isHex ? value : "#888888"}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 cursor-pointer rounded-lg border border-white/10 bg-transparent p-0.5 shrink-0" />
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "e.g. #6366f1 or leave empty for auto"}
        className="flex-1 min-w-0 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5
          text-sm font-mono text-white/80 placeholder-white/25
          focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30" />
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
        className="flex-1 accent-indigo-500 cursor-pointer h-1.5" />
      <input type="number" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value))))}
        className="w-16 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2 py-1
          text-center text-sm font-mono text-white/80 focus:border-indigo-500/50 focus:outline-none" />
      {unit && <span className="text-xs text-white/40 w-5 shrink-0">{unit}</span>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, mono }: {
  value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean;
}) {
  return (
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2
        text-sm text-white/80 placeholder-white/25
        focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30
        ${mono ? "font-mono text-xs" : ""}`} />
  );
}

function Toggle({ value, onChange, label, hint }: {
  value: boolean; onChange: (v: boolean) => void; label: string; hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <div>
        <p className="text-xs font-medium text-white/65">{label}</p>
        {hint && <p className="text-[11px] text-white/30 leading-snug">{hint}</p>}
      </div>
      <button onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors
          ${value ? "bg-indigo-600" : "bg-white/[0.12]"}`}>
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform
          ${value ? "translate-x-4" : "translate-x-1"}`} />
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
  value: string; options: { label: string; value: string }[]; onChange: (v: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2
        text-sm text-white/80 focus:border-indigo-500/50 focus:outline-none cursor-pointer">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Live React widget preview — no iframe, always correct height
// ─────────────────────────────────────────────────────────────────────────────

type PM = { id: string; role: "user" | "assistant"; content: string };

function WidgetPreview({ design: d }: { design: WidgetDesign }) {
  const [msgs, setMsgs] = useState<PM[]>([
    { id: "w",  role: "assistant", content: d.welcomeMessage },
    { id: "u1", role: "user",      content: "How does this work?" },
    { id: "a1", role: "assistant", content: "I can answer questions instantly. Try asking me anything!" },
  ]);
  const [inp, setInp]     = useState("");
  const [typing, setTyp]  = useState(false);
  const botRef            = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMsgs((p) => p.map((m) => m.id === "w" ? { ...m, content: d.welcomeMessage } : m));
  }, [d.welcomeMessage]);

  useEffect(() => { botRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const primary   = d.primaryColour  || "#6366f1";
  const accent    = d.accentColour   || "#818cf8";
  const dark      = d.widgetTheme === "dark";
  const hdrBg     = d.headerBg       || primary;
  const chatBg    = d.chatAreaBg     || (dark ? "#0f0f1a" : "#f8f9fd");
  const userBg    = d.userBubbleBg   || primary;
  const botBg     = d.botBubbleBg    || (dark ? "#2a2a40" : "#f0f0f8");
  const botTxt    = d.botBubbleText  || (dark ? "#e2e2f0" : "#1f2937");
  const inputBg2  = d.inputBg        || (dark ? "#1a1a2e" : "#fff");
  const inputBrd  = d.inputBorder    || `1px solid ${dark ? "rgba(255,255,255,0.1)" : "#e5e7eb"}`;
  const areaB     = d.inputAreaBorder || `1px solid ${dark ? "rgba(255,255,255,0.08)" : "#e5e7eb"}`;
  const areaBg    = d.inputAreaBg    || (dark ? "#0f0f1a" : "#fff");
  const sendBg2   = d.sendBtnBg      || primary;
  const footTxt   = d.footerTextColor || (dark ? "#3a3a5a" : "#d1d5db");
  const avatarBr  = d.avatarShape === "square" ? "4px" : d.avatarShape === "rounded" ? "8px" : "50%";

  const dynCss = `
    .pvw-msgs::-webkit-scrollbar { width: ${d.scrollbarWidth}px; }
    .pvw-msgs::-webkit-scrollbar-track { background: ${d.scrollbarTrackColor || "transparent"}; }
    .pvw-msgs::-webkit-scrollbar-thumb { background: ${d.scrollbarColor || "#c7d2fe"}; border-radius: 99px; }
    .pvw-enter { animation: ${
      d.messageAnimationStyle === "slide" ? "pvwSlide 0.22s ease" :
      d.messageAnimationStyle === "pop"   ? "pvwPop 0.18s cubic-bezier(0.34,1.56,0.64,1)" :
      d.messageAnimationStyle === "none"  ? "none" : "pvwFade 0.18s ease"
    } both; }
    @keyframes pvwFade  { from { opacity:0; transform:translateY(6px) } }
    @keyframes pvwSlide { from { opacity:0; transform:translateX(20px) } }
    @keyframes pvwPop   { from { opacity:0; transform:scale(0.88) } }
    @keyframes pvwBounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-4px)} }
    .pvw-ta::placeholder { color: ${d.inputPlaceholderColor || (dark ? "#555575" : "#9ca3af")}; }
    ${d.customThemeCss || ""}
    ${d.customCss || ""}
  `;

  function send() {
    const txt = inp.trim(); if (!txt) return;
    const uid = `u${Date.now()}`, aid = `a${Date.now()}`;
    setMsgs((p) => [...p, { id: uid, role: "user", content: txt }]);
    setInp(""); setTyp(true);
    setTimeout(() => {
      setTyp(false);
      setMsgs((p) => [...p, { id: aid, role: "assistant",
        content: `Preview reply to: "${txt.slice(0, 40)}". Your design changes are live!` }]);
    }, 1200);
  }

  const panelH = Math.min(d.widgetChatHeight, 540);

  return (
    <div style={{ fontFamily: d.widgetFontFamily, height: panelH, borderRadius: d.widgetBorderRadius,
        display: "flex", flexDirection: "column", overflow: "hidden" }}
      className="border border-white/[0.1] shadow-2xl">
      <style>{dynCss}</style>

      {/* Header */}
      <div className="clara-header shrink-0 flex items-center gap-3 px-4"
        style={{ height: d.headerHeight, background: hdrBg, color: d.headerTextColor,
          backdropFilter: d.headerBlur ? "blur(12px)" : undefined }}>
        {d.avatarUrl
          ? <img src={d.avatarUrl} alt="" className="clara-avatar shrink-0"
              style={{ width: 32, height: 32, borderRadius: avatarBr, objectFit: "cover" }} />
          : <div className="clara-avatar shrink-0 flex items-center justify-center font-bold"
              style={{ width: 32, height: 32, borderRadius: avatarBr, background: accent,
                color: d.headerTextColor, fontSize: 14 }}>
              {d.assistantName.charAt(0).toUpperCase()}
            </div>
        }
        <div className="flex-1 min-w-0">
          <div className="clara-header-name font-semibold truncate" style={{ fontSize: 14 }}>
            {d.assistantName}
          </div>
          {d.showStatusDot && (
            <div className="flex items-center gap-1.5">
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: d.statusDotColor,
                display: "inline-block" }} />
              <span style={{ fontSize: 11, opacity: 0.75 }}>Online</span>
            </div>
          )}
        </div>
        {d.customHeaderHtml && (
          <div dangerouslySetInnerHTML={{ __html: d.customHeaderHtml }} className="flex items-center" />
        )}
      </div>

      {/* Messages */}
      <div className="pvw-msgs clara-messages flex-1 overflow-y-auto flex flex-col px-3 py-3"
        style={{ gap: d.messageGap, background: chatBg }}>
        {msgs.map((msg) => (
          <div key={msg.id} className="pvw-enter"
            style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div className={msg.role === "user" ? "clara-msg-user" : "clara-msg-bot"}
              style={{
                maxWidth: `${d.messageMaxWidth}%`,
                borderRadius: msg.role === "user" ? d.userBubbleRadius : d.botBubbleRadius,
                padding:      msg.role === "user" ? d.userBubblePadding : d.botBubblePadding,
                fontSize: d.messageFontSize, lineHeight: d.messageLineHeight,
                background: msg.role === "user" ? userBg : botBg,
                color:      msg.role === "user" ? d.userBubbleText : botTxt,
                border:     msg.role === "user" ? "none"
                  : (d.botBubbleBorder || `1px solid ${dark ? "rgba(255,255,255,0.07)" : "#e5e7eb"}`),
                boxShadow: msg.role === "user" ? d.userBubbleShadow : d.botBubbleShadow,
                wordBreak: "break-word",
              }}>
              {msg.content}
              {d.showTimestamps && (
                <div className="clara-timestamp mt-1"
                  style={{ fontSize: d.timestampFontSize, color: d.timestampColor, opacity: 0.7 }}>
                  now
                </div>
              )}
            </div>
          </div>
        ))}

        {typing && (
          <div className="flex justify-start">
            <div className="clara-typing flex items-center gap-1 rounded-2xl px-3 py-2"
              style={{ background: botBg, border: `1px solid ${dark ? "rgba(255,255,255,0.07)" : "#e5e7eb"}` }}>
              {[0, 150, 300].map((delay) => (
                <span key={delay} className="clara-typing-dot inline-block rounded-full"
                  style={{ width: d.typingDotSize, height: d.typingDotSize, background: d.typingDotColor,
                    animation: `pvwBounce 1.2s ${delay}ms infinite` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={botRef} />
      </div>

      {/* Input */}
      <div className="clara-input-area shrink-0 px-3 py-2.5"
        style={{ background: areaBg, borderTop: areaB }}>
        <div className="flex items-end gap-2">
          <textarea value={inp} rows={1}
            onChange={(e) => setInp(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={`Ask ${d.assistantName}…`}
            className="clara-textarea pvw-ta flex-1 resize-none outline-none"
            style={{ borderRadius: d.inputRadius, border: inputBrd, background: inputBg2,
              color: d.inputTextColor || (dark ? "#e2e2f0" : "#1f2937"),
              fontSize: 13, fontFamily: "inherit", padding: d.inputPadding,
              maxHeight: 80, lineHeight: 1.5 }} />
          <button onClick={send} disabled={!inp.trim()}
            className="clara-send-btn shrink-0 flex items-center justify-center transition-all"
            style={{ width: d.sendBtnSize, height: d.sendBtnSize, borderRadius: d.sendBtnRadius,
              background: inp.trim() ? sendBg2 : (dark ? "#2a2a40" : "#e5e7eb"),
              color: inp.trim() ? d.sendBtnTextColor : (dark ? "#555" : "#aaa"),
              border: "none", cursor: inp.trim() ? "pointer" : "not-allowed" }}>
            <svg className="clara-send-icon" viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
        {d.widgetShowBranding && (
          <div className="clara-branding text-center mt-1.5"
            style={{ fontSize: 10, color: footTxt, background: d.footerBg || "transparent" }}>
            {d.customFooterHtml
              ? <span dangerouslySetInnerHTML={{ __html: d.customFooterHtml }} />
              : d.customPoweredBy || "Powered by Clara AI"}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Real runtime sandbox (actual clara.js in an isolated iframe)
// ─────────────────────────────────────────────────────────────────────────────

function FloatingSandboxPreview({ design }: { design: WidgetDesign }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const origin   = typeof window !== "undefined" ? window.location.origin : "";
  const initSnap = useRef(design);

  const srcDoc = useMemo(() => {
    if (!origin) return "";
    const cfg = JSON.stringify({ ...initSnap.current, kbId: "preview-kb", widgetMode: "floating" })
      .replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
    return `<!doctype html><html><head><meta charset="utf-8"/>
<style>html,body{margin:0;min-height:100%;background:#0b1020;font-family:system-ui,sans-serif;color:#cbd5e1}
.s{padding:28px 24px 120px;box-sizing:border-box}
.c{max-width:400px;border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:18px;background:rgba(15,23,42,.6)}
h1{font-size:22px;color:#fff;margin:8px 0}p{font-size:13px;color:rgba(255,255,255,.6);margin:0}</style></head>
<body><div class="s"><div class="c"><h1>Floating sandbox</h1>
<p>Click the launcher bubble to open the widget. Design changes sync live.</p></div></div>
<script>
window.__CFG=${cfg};
const _f=window.fetch.bind(window);
window.fetch=function(u,o){
  const url=typeof u==="string"?u:u.url;
  if(url.includes("/api/embed/config"))return Promise.resolve(new Response(JSON.stringify(window.__CFG),{headers:{"Content-Type":"application/json"}}));
  if(url.includes("/api/embed/chat")){
    const b=JSON.parse(o?.body||"{}");
    const last=(b.messages||[]).filter((m)=>m.role==="user").slice(-1)[0]?.content||"question";
    const txt="Sandbox reply to: "+last;
    const chunks=txt.match(/.{1,20}(\\s|$)/g)||[txt];
    let i=0;const s=new ReadableStream({start(c){(function p(){if(i>=chunks.length){c.close();return;}c.enqueue(new TextEncoder().encode(JSON.stringify({type:"token",payload:chunks[i]})+"\\n"));i++;setTimeout(p,35);})();}});
    return Promise.resolve(new Response(s,{headers:{"Content-Type":"application/x-ndjson"}}));
  }
  return _f(u,o);
};
window.addEventListener("message",function(ev){
  if(ev.origin!==window.location.origin)return;
  if(ev.data?.type==="clara-admin-preview-config"){
    window.__CFG={...window.__CFG,...ev.data.payload,widgetMode:"floating"};
    window.ClaraWidget?.refreshDesign?.();
  }
});
</script>
<script src="${origin}/embed/clara.js" data-key="preview-key" data-mode="floating"></script>
</body></html>`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin]);

  const postMsg = useCallback(() => {
    if (!frameRef.current?.contentWindow || !origin) return;
    frameRef.current.contentWindow.postMessage(
      { type: "clara-admin-preview-config", payload: design }, origin);
  }, [design, origin]);

  useEffect(() => { postMsg(); }, [postMsg]);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a1120]">
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-white">Floating sandbox</p>
          <p className="text-xs text-white/40">Real clara.js — click the launcher to open the widget</p>
        </div>
        <div className="flex gap-1.5">
          {["rose-400/70","amber-300/70","emerald-400/70"].map((c) => (
            <span key={c} className={`h-2.5 w-2.5 rounded-full bg-${c}`} />
          ))}
        </div>
      </div>
      <iframe ref={frameRef} title="clara sandbox" srcDoc={srcDoc} onLoad={postMsg}
        className="w-full bg-[#09101f]" style={{ height: 420 }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Visual controls panel
// ─────────────────────────────────────────────────────────────────────────────

function ControlsPanel({ d, set }: {
  d: WidgetDesign; set: <K extends keyof WidgetDesign>(k: K, v: WidgetDesign[K]) => void;
}) {
  return (
    <div className="space-y-0.5">

      <SectionHeader icon={Palette} label="Brand Colours" />
      <div className="space-y-3 pb-2">
        <Field label="Primary colour" hint="Used for the header, user message bubbles, send button, and the floating launcher. Click the colour square or type any CSS colour value.">
          <ColourInput value={d.primaryColour} onChange={(v) => set("primaryColour", v)} placeholder="#6366f1" />
        </Field>
        <Field label="Accent colour" hint="Used for the avatar background, hover effects, and focus rings.">
          <ColourInput value={d.accentColour} onChange={(v) => set("accentColour", v)} placeholder="#818cf8" />
        </Field>
        <Field label="Launcher button colour" hint="Colour of the floating chat bubble. Leave empty to use the Primary colour.">
          <ColourInput value={d.launcherColour} onChange={(v) => set("launcherColour", v)} placeholder="empty = same as primary" />
        </Field>
      </div>

      <SectionHeader icon={Layout} label="Layout & Window" />
      <div className="space-y-3 pb-2">
        <Field label="Colour theme" hint="Light = bright white background. Dark = deep dark background.">
          <SegmentedControl value={d.widgetTheme}
            options={[{label:"☀️ Light",value:"light"},{label:"🌙 Dark",value:"dark"}]}
            onChange={(v) => set("widgetTheme", v)} />
        </Field>
        <Field label="Widget position on screen" hint="Where the floating launcher sits in the corner of the page.">
          <SegmentedControl value={d.widgetPosition}
            options={[{label:"Bottom Right",value:"bottom-right"},{label:"Bottom Left",value:"bottom-left"}]}
            onChange={(v) => set("widgetPosition", v)} small />
        </Field>
        <Field label="Chat window height" hint="How tall the chat panel is. 580px is the default sweet spot.">
          <RangeInput value={d.widgetChatHeight} min={300} max={900} step={10} unit="px"
            onChange={(v) => set("widgetChatHeight", v)} />
        </Field>
        <Field label="Corner roundness" hint="0 = sharp square corners. 40 = very rounded pill shape.">
          <RangeInput value={d.widgetBorderRadius} min={0} max={40} unit="px"
            onChange={(v) => set("widgetBorderRadius", v)} />
        </Field>
        <Field label="Chat area background" hint="Background colour of the message list. Leave empty to use the theme default (white/dark).">
          <ColourInput value={d.chatAreaBg} onChange={(v) => set("chatAreaBg", v)}
            placeholder="empty = auto (white or dark)" />
        </Field>
      </div>

      <SectionHeader icon={Type} label="Typography" />
      <div className="space-y-3 pb-2">
        <Field label="Font family" hint="The typeface used for all text inside the widget.">
          <SelectInput value={d.widgetFontFamily} options={FONTS} onChange={(v) => set("widgetFontFamily", v)} />
        </Field>
        <Field label="Message text size" hint="How large the text inside chat bubbles appears. 13px is the default.">
          <RangeInput value={d.messageFontSize} min={10} max={22} unit="px"
            onChange={(v) => set("messageFontSize", v)} />
        </Field>
        <Field label="Message line height" hint="Space between lines of text. 1.5 is comfortable. Lower = tighter, higher = more airy.">
          <RangeInput value={d.messageLineHeight} min={1} max={2.5} step={0.05} unit="×"
            onChange={(v) => set("messageLineHeight", v)} />
        </Field>
      </div>

      <SectionHeader icon={Sparkles} label="Identity" />
      <div className="space-y-3 pb-2">
        <Field label="Assistant name" hint="The name shown in the header. E.g. 'Aria', 'Support Bot', 'Clara'.">
          <TextInput value={d.assistantName} onChange={(v) => set("assistantName", v)} placeholder="Clara" />
        </Field>
        <Field label="Welcome message" hint="The first message the assistant sends when someone opens the chat.">
          <textarea value={d.welcomeMessage} rows={2}
            onChange={(e) => set("welcomeMessage", e.target.value)}
            placeholder="Hi! How can I help you today?"
            className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm
              text-white/80 placeholder-white/25 focus:border-indigo-500/50 focus:outline-none resize-none" />
        </Field>
        <Field label="Avatar image URL" hint="A direct link to your logo or avatar image (PNG, JPG, WebP). Leave blank to show the initial letter of the assistant name instead.">
          <TextInput value={d.avatarUrl} onChange={(v) => set("avatarUrl", v)}
            placeholder="https://yoursite.com/logo.png  (or leave empty)" mono />
        </Field>
        <Field label="Avatar shape" hint="Circle is the classic chat look. Rounded is modern. Square suits logos.">
          <SegmentedControl value={d.avatarShape}
            options={[{label:"⬤ Circle",value:"circle"},{label:"⬛ Rounded",value:"rounded"},{label:"▪ Square",value:"square"}]}
            onChange={(v) => set("avatarShape", v)} small />
        </Field>
      </div>

      <SectionHeader icon={Layout} label="Header Bar" />
      <div className="space-y-3 pb-2">
        <Field label="Header background" hint="Colour or gradient for the top bar. Leave empty to use your Primary colour. For a gradient paste: linear-gradient(135deg, #6366f1, #8b5cf6)">
          <ColourInput value={d.headerBg} onChange={(v) => set("headerBg", v)}
            placeholder="empty = primary colour  |  or: linear-gradient(135deg, #6366f1, #8b5cf6)" />
        </Field>
        <Field label="Header text colour" hint="Colour of the assistant name and status text in the header.">
          <ColourInput value={d.headerTextColor} onChange={(v) => set("headerTextColor", v)} placeholder="#ffffff" />
        </Field>
        <Field label="Header height" hint="How tall the header bar is. 60px is comfortable. Increase for a more prominent header.">
          <RangeInput value={d.headerHeight} min={44} max={100} unit="px" onChange={(v) => set("headerHeight", v)} />
        </Field>
        <Toggle value={d.headerBlur} onChange={(v) => set("headerBlur", v)}
          label="Frosted glass (blur) effect" hint="Makes the header look like frosted glass. Requires a background image/gradient on the page." />
        <Toggle value={d.showStatusDot} onChange={(v) => set("showStatusDot", v)}
          label="Show 'Online' green dot" hint="Shows a small coloured dot below the assistant name to indicate availability." />
        {d.showStatusDot && (
          <Field label="Status dot colour" hint="Colour of the online indicator dot. Green is the most recognisable.">
            <ColourInput value={d.statusDotColor} onChange={(v) => set("statusDotColor", v)} placeholder="#4ade80" />
          </Field>
        )}
        <Field label="Custom header HTML" hint="Optional: paste any HTML to add extra elements inside the header — e.g. a close button, badge, or extra icon. Leave blank if unsure.">
          <textarea value={d.customHeaderHtml} rows={2}
            onChange={(e) => set("customHeaderHtml", e.target.value)}
            placeholder={'Example: <button style="color:#fff;background:none;border:none;cursor:pointer">✕ Close</button>'}
            className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2
              text-xs font-mono text-white/80 placeholder-white/20 focus:border-indigo-500/50 focus:outline-none resize-none" />
        </Field>
      </div>

      <SectionHeader icon={MessageSquare} label="User Message Bubble" />
      <div className="space-y-3 pb-2">
        <Field label="Bubble background colour" hint="The background of messages YOU send. Leave empty to use your Primary colour.">
          <ColourInput value={d.userBubbleBg} onChange={(v) => set("userBubbleBg", v)} placeholder="empty = primary colour" />
        </Field>
        <Field label="Bubble text colour" hint="Colour of the text inside user message bubbles. White works well on coloured backgrounds.">
          <ColourInput value={d.userBubbleText} onChange={(v) => set("userBubbleText", v)} placeholder="#ffffff" />
        </Field>
        <Field label="Corner radius (CSS)" hint='Controls each corner separately. "18px 18px 4px 18px" = round except bottom-right. Try "50px" for very round bubbles.'>
          <TextInput value={d.userBubbleRadius} onChange={(v) => set("userBubbleRadius", v)}
            placeholder="18px 18px 4px 18px  (top-left top-right bottom-right bottom-left)" mono />
        </Field>
        <Field label="Padding inside bubble" hint='Space between the text and the bubble edge. "10px 14px" = 10px top/bottom, 14px left/right.'>
          <TextInput value={d.userBubblePadding} onChange={(v) => set("userBubblePadding", v)}
            placeholder="10px 14px" mono />
        </Field>
        <Field label="Drop shadow" hint='CSS box-shadow. "0 1px 4px rgba(0,0,0,0.15)" is subtle. Set "none" to remove the shadow completely.'>
          <TextInput value={d.userBubbleShadow} onChange={(v) => set("userBubbleShadow", v)}
            placeholder="0 1px 4px rgba(0,0,0,0.15)  (or: none)" mono />
        </Field>
      </div>

      <SectionHeader icon={MessageSquare} label="Bot / Assistant Message Bubble" />
      <div className="space-y-3 pb-2">
        <Field label="Bubble background colour" hint="Leave empty to use the theme default (light grey or dark purple depending on theme).">
          <ColourInput value={d.botBubbleBg} onChange={(v) => set("botBubbleBg", v)} placeholder="empty = theme default" />
        </Field>
        <Field label="Bubble text colour" hint="Leave empty to use the theme default (dark grey / light grey).">
          <ColourInput value={d.botBubbleText} onChange={(v) => set("botBubbleText", v)} placeholder="empty = theme default" />
        </Field>
        <Field label="Border" hint='CSS border. "1px solid #e5e7eb" is a subtle line. Leave empty for the theme default. Set "none" to remove.'>
          <TextInput value={d.botBubbleBorder} onChange={(v) => set("botBubbleBorder", v)}
            placeholder="1px solid #e5e7eb  (or: none  or empty = theme default)" mono />
        </Field>
        <Field label="Corner radius (CSS)">
          <TextInput value={d.botBubbleRadius} onChange={(v) => set("botBubbleRadius", v)}
            placeholder="18px 18px 18px 4px" mono />
        </Field>
        <Field label="Padding inside bubble">
          <TextInput value={d.botBubblePadding} onChange={(v) => set("botBubblePadding", v)} placeholder="10px 14px" mono />
        </Field>
        <Field label="Drop shadow">
          <TextInput value={d.botBubbleShadow} onChange={(v) => set("botBubbleShadow", v)}
            placeholder="0 1px 3px rgba(0,0,0,0.08)  (or: none)" mono />
        </Field>
      </div>

      <SectionHeader icon={Sliders} label="Message List" />
      <div className="space-y-3 pb-2">
        <Field label="Gap between messages" hint="Vertical space between chat bubbles. 12px is default. More space = more airy.">
          <RangeInput value={d.messageGap} min={4} max={40} unit="px" onChange={(v) => set("messageGap", v)} />
        </Field>
        <Field label="Max bubble width" hint="How wide a message bubble can stretch. 85% means it uses most of the chat width. Lower for a more narrow look.">
          <RangeInput value={d.messageMaxWidth} min={50} max={100} unit="%" onChange={(v) => set("messageMaxWidth", v)} />
        </Field>
        <Toggle value={d.showTimestamps} onChange={(v) => set("showTimestamps", v)}
          label="Show message timestamps" hint='Displays "now" or time below each message.' />
        {d.showTimestamps && (
          <>
            <Field label="Timestamp text colour">
              <ColourInput value={d.timestampColor} onChange={(v) => set("timestampColor", v)} placeholder="#9ca3af" />
            </Field>
            <Field label="Timestamp font size">
              <RangeInput value={d.timestampFontSize} min={8} max={14} unit="px" onChange={(v) => set("timestampFontSize", v)} />
            </Field>
          </>
        )}
        <Field label="Message entrance animation" hint="How new messages appear. Fade = gently fades in. Slide = sweeps in from the side. Pop = bounces into view. None = instant.">
          <SegmentedControl value={d.messageAnimationStyle}
            options={[{label:"Fade",value:"fade"},{label:"Slide",value:"slide"},{label:"Pop",value:"pop"},{label:"None",value:"none"}]}
            onChange={(v) => set("messageAnimationStyle", v)} small />
        </Field>
      </div>

      <SectionHeader icon={MessageSquare} label="Typing Indicator" />
      <div className="space-y-3 pb-2">
        <Field label="Dot colour" hint="Colour of the three animated dots that appear while the assistant is thinking.">
          <ColourInput value={d.typingDotColor} onChange={(v) => set("typingDotColor", v)} placeholder="#9ca3af" />
        </Field>
        <Field label="Dot size" hint="Size of each animated dot in pixels. 6px is the standard size.">
          <RangeInput value={d.typingDotSize} min={3} max={12} unit="px" onChange={(v) => set("typingDotSize", v)} />
        </Field>
      </div>

      <SectionHeader icon={Send} label="Input Area" />
      <div className="space-y-3 pb-2">
        <Field label="Input strip background" hint="Background behind the text field and send button. Leave empty to use white (light) or dark (dark theme).">
          <ColourInput value={d.inputAreaBg} onChange={(v) => set("inputAreaBg", v)} placeholder="empty = auto" />
        </Field>
        <Field label="Input strip top border" hint='CSS border for the line above the input area. E.g. "1px solid #e5e7eb". Leave empty for the theme default.'>
          <TextInput value={d.inputAreaBorder} onChange={(v) => set("inputAreaBorder", v)} placeholder="1px solid #e5e7eb  (empty = auto)" mono />
        </Field>
        <Field label="Text field background" hint="The background of the typing area. Leave empty for the theme default.">
          <ColourInput value={d.inputBg} onChange={(v) => set("inputBg", v)} placeholder="empty = white / dark" />
        </Field>
        <Field label="Text field border" hint='The border around the typing box. E.g. "1px solid #d1d5db". Leave empty for theme default.'>
          <TextInput value={d.inputBorder} onChange={(v) => set("inputBorder", v)} placeholder="1px solid #d1d5db  (empty = auto)" mono />
        </Field>
        <Field label="Text field border on focus" hint="The border colour when the user clicks inside the text field to type. Leave empty to use your Primary colour.">
          <ColourInput value={d.inputBorderFocus} onChange={(v) => set("inputBorderFocus", v)} placeholder="empty = primary colour" />
        </Field>
        <Field label="Text field corner radius" hint="0 = sharp corners. 20 = very rounded text field.">
          <RangeInput value={d.inputRadius} min={0} max={40} unit="px" onChange={(v) => set("inputRadius", v)} />
        </Field>
        <Field label="Text field text colour">
          <ColourInput value={d.inputTextColor} onChange={(v) => set("inputTextColor", v)} placeholder="empty = theme default" />
        </Field>
        <Field label="Placeholder text colour" hint='The faded hint text colour before the user types. E.g. "Ask Clara…"'>
          <ColourInput value={d.inputPlaceholderColor} onChange={(v) => set("inputPlaceholderColor", v)} placeholder="empty = theme default" />
        </Field>
        <Field label="Text field inner padding" hint='Space inside the text field. "8px 12px" = 8 top/bottom, 12 left/right.'>
          <TextInput value={d.inputPadding} onChange={(v) => set("inputPadding", v)} placeholder="8px 12px" mono />
        </Field>
      </div>

      <SectionHeader icon={Send} label="Send Button" />
      <div className="space-y-3 pb-2">
        <Field label="Button background colour" hint="Leave empty to use your Primary colour.">
          <ColourInput value={d.sendBtnBg} onChange={(v) => set("sendBtnBg", v)} placeholder="empty = primary" />
        </Field>
        <Field label="Hover background colour" hint="Colour when the cursor hovers over the button. Leave empty for a slight auto-darken.">
          <ColourInput value={d.sendBtnHoverBg} onChange={(v) => set("sendBtnHoverBg", v)} placeholder="empty = auto-darken" />
        </Field>
        <Field label="Icon colour" hint="Colour of the send arrow icon inside the button.">
          <ColourInput value={d.sendBtnTextColor} onChange={(v) => set("sendBtnTextColor", v)} placeholder="#ffffff" />
        </Field>
        <Field label="Corner radius" hint="Set to 50 for a perfectly round circle button. 0 for a square. 10 is the default rounded rectangle.">
          <RangeInput value={d.sendBtnRadius} min={0} max={50} unit="px" onChange={(v) => set("sendBtnRadius", v)} />
        </Field>
        <Field label="Button size" hint="Width and height of the send button in pixels.">
          <RangeInput value={d.sendBtnSize} min={24} max={64} unit="px" onChange={(v) => set("sendBtnSize", v)} />
        </Field>
      </div>

      <SectionHeader icon={Sliders} label="Scrollbar" />
      <div className="space-y-3 pb-2">
        <Field label="Scrollbar width" hint="How wide the scrollbar track is. 0 = completely hidden. 4px is slim and modern.">
          <RangeInput value={d.scrollbarWidth} min={0} max={16} unit="px" onChange={(v) => set("scrollbarWidth", v)} />
        </Field>
        <Field label="Scrollbar thumb colour" hint="The draggable part of the scrollbar. A light purple or grey works well.">
          <ColourInput value={d.scrollbarColor} onChange={(v) => set("scrollbarColor", v)} placeholder="#c7d2fe" />
        </Field>
        <Field label="Scrollbar track colour" hint="The background rail behind the scrollbar. Transparent = invisible track.">
          <ColourInput value={d.scrollbarTrackColor} onChange={(v) => set("scrollbarTrackColor", v)} placeholder="transparent" />
        </Field>
      </div>

      <SectionHeader icon={Type} label="Branding Footer" />
      <div className="space-y-3 pb-2">
        <Toggle value={d.widgetShowBranding} onChange={(v) => set("widgetShowBranding", v)}
          label='Show "Powered by" footer' hint="Small branding text beneath the input. Turn off on paid plans." />
        {d.widgetShowBranding && (
          <>
            <Field label="Footer text" hint='The text shown in the footer. Change to "Powered by Acme Corp" or your brand.'>
              <TextInput value={d.customPoweredBy} onChange={(v) => set("customPoweredBy", v)} placeholder="Powered by Clara AI" />
            </Field>
            <Field label="Footer background colour" hint="Leave empty for transparent (no background behind the footer text).">
              <ColourInput value={d.footerBg} onChange={(v) => set("footerBg", v)} placeholder="empty = transparent" />
            </Field>
            <Field label="Footer text colour" hint="Leave empty for the theme default (very light grey).">
              <ColourInput value={d.footerTextColor} onChange={(v) => set("footerTextColor", v)} placeholder="empty = theme default" />
            </Field>
            <Field label="Custom footer HTML" hint="Replace the text with your own HTML — e.g. a logo image or a link. Leave blank to use the text above.">
              <textarea value={d.customFooterHtml} rows={2}
                onChange={(e) => set("customFooterHtml", e.target.value)}
                placeholder={'Example: <a href="https://yoursite.com" style="color:#6366f1">My Brand</a>'}
                className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2
                  text-xs font-mono text-white/80 placeholder-white/20 focus:border-indigo-500/50 focus:outline-none resize-none" />
            </Field>
          </>
        )}
      </div>

      <SectionHeader icon={Monitor} label="Widget Mode & Launcher" />
      <div className="space-y-3 pb-2">
        <Field label="Render mode" hint="Floating = the classic chat bubble in the corner. Inline = embedded full-size on your page. Headless = no UI, controlled by your own code.">
          <SegmentedControl value={d.widgetMode}
            options={[{label:"Floating",value:"floating"},{label:"Inline",value:"inline"},{label:"Headless",value:"headless"}]}
            onChange={(v) => set("widgetMode", v)} small />
        </Field>
        <Field label="Launcher button size" hint="Width and height of the floating chat bubble button.">
          <RangeInput value={d.widgetButtonSize} min={40} max={80} unit="px" onChange={(v) => set("widgetButtonSize", v)} />
        </Field>
        <Field label="Launcher label text" hint='Optional text shown next to the floating button. E.g. "Chat with us". Leave empty for icon-only.'>
          <TextInput value={d.widgetLauncherLabel} onChange={(v) => set("widgetLauncherLabel", v)} placeholder="Chat with us  (or leave empty)" />
        </Field>
        <Field label="Custom launcher icon (SVG)" hint="Paste the raw SVG markup for a custom icon on the floating button. Leave blank to use the default chat bubble icon.">
          <textarea value={d.customLauncherSvg} rows={3}
            onChange={(e) => set("customLauncherSvg", e.target.value)}
            placeholder={'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>'}
            className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2
              text-xs font-mono text-white/80 placeholder-white/20 focus:border-indigo-500/50 focus:outline-none resize-none" />
        </Field>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Advanced code editor panel — editors are SYNCED with visual design state
// ─────────────────────────────────────────────────────────────────────────────

function AdvancedCodePanel({ d, set, kbId }: {
  d: WidgetDesign;
  set: <K extends keyof WidgetDesign>(k: K, v: WidgetDesign[K]) => void;
  kbId: string;
}) {
  // On first mount, pre-fill empty code fields with generated code from visual controls
  useEffect(() => {
    if (!d.customThemeCss) set("customThemeCss", generateThemeCss(d));
    if (!d.customInjectJs)  set("customInjectJs",  generateInjectJs(d));
    if (!d.customCss)       set("customCss",        generateCustomCss(d));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resync() {
    set("customThemeCss", generateThemeCss(d));
    set("customInjectJs",  generateInjectJs(d));
    set("customCss",        generateCustomCss(d));
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Code2 className="h-4 w-4 text-indigo-300 mt-0.5 shrink-0" />
            <div className="text-xs text-white/60 leading-relaxed">
              <strong className="text-white/90">Full design control via code.</strong>{" "}
              All editors are pre-filled with real working CSS / JS generated from your Visual Controls.
              Edit anything — your changes override the visual settings when you save.
            </div>
          </div>
          <button onClick={resync}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30
              bg-indigo-600/10 px-3 py-1.5 text-xs text-indigo-300 hover:bg-indigo-600/20 transition-all">
            <Wand2 className="h-3 w-3" /> Sync from visual
          </button>
        </div>
      </div>

      <Tabs defaultValue="theme">
        <TabsList className="h-auto flex-wrap justify-start gap-1.5 rounded-xl bg-[#0b1020] p-1.5">
          {([
            { value:"theme",    label:"theme.css",    hint:"Full class + variable rules" },
            { value:"inject",   label:"inject.css",   hint:"Raw CSS injection" },
            { value:"header",   label:"header.html",  hint:"Header slot HTML" },
            { value:"footer",   label:"footer.html",  hint:"Footer slot HTML" },
            { value:"launcher", label:"launcher.svg",  hint:"FAB icon SVG" },
            { value:"hooks",    label:"hooks.js",     hint:"Behaviour event hooks" },
          ] as const).map(({ value, label, hint }) => (
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

        <TabsContent value="theme" className="mt-4">
          <LiveCodeEditor
            title="Widget Theme CSS"
            description="Write real CSS targeting .clara-* classes or override CSS variables. This was auto-generated from your visual controls — edit freely."
            language="css" value={d.customThemeCss}
            onChange={(v) => set("customThemeCss", v)}
            path={`inmemory://widget/${kbId}/theme.css`} height={460} minimap />
          <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 grid grid-cols-2 gap-1">
            {[".clara-widget",".clara-header",".clara-header-name",".clara-avatar",
              ".clara-messages",".clara-msg-user",".clara-msg-bot",".clara-timestamp",
              ".clara-typing",".clara-typing-dot",".clara-input-area",".clara-textarea",
              ".clara-send-btn",".clara-send-icon",".clara-branding",
            ].map((cls) => (
              <span key={cls} className="text-[11px] font-mono text-indigo-300/80 rounded bg-white/[0.04] px-2 py-0.5">{cls}</span>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="inject" className="mt-4">
          <LiveCodeEditor title="Custom CSS Injection"
            description="CSS injected directly into the widget's shadow DOM. Use for custom animations, @import font rules, or anything that needs priority over theme.css."
            language="css" value={d.customCss}
            onChange={(v) => set("customCss", v)}
            path={`inmemory://widget/${kbId}/inject.css`} height={400} minimap />
        </TabsContent>

        <TabsContent value="header" className="mt-4">
          <LiveCodeEditor title="Header HTML Slot"
            description="HTML rendered inside the widget header bar. Add icons, a close button, or a status badge."
            language="html" value={d.customHeaderHtml}
            onChange={(v) => set("customHeaderHtml", v)}
            path={`inmemory://widget/${kbId}/header.html`} height={280} />
        </TabsContent>

        <TabsContent value="footer" className="mt-4">
          <LiveCodeEditor title="Footer HTML Slot"
            description='Replaces the "Powered by" branding with custom HTML. Add a logo, link, or legal text.'
            language="html" value={d.customFooterHtml}
            onChange={(v) => set("customFooterHtml", v)}
            path={`inmemory://widget/${kbId}/footer.html`} height={240} />
        </TabsContent>

        <TabsContent value="launcher" className="mt-4">
          <LiveCodeEditor title="Floating Launcher SVG Icon"
            description="Replace the default chat bubble with any SVG. Paste raw <svg> markup here."
            language="html" value={d.customLauncherSvg}
            onChange={(v) => set("customLauncherSvg", v)}
            path={`inmemory://widget/${kbId}/launcher.svg`} height={280} />
        </TabsContent>

        <TabsContent value="hooks" className="mt-4">
          <LiveCodeEditor title="Widget Behaviour Hooks (JS)"
            description="JavaScript hooks injected into the end-user's page. Auto-generated from your current settings — uncomment any hook you need."
            language="typescript" value={d.customInjectJs}
            onChange={(v) => set("customInjectJs", v)}
            path={`inmemory://widget/${kbId}/hooks.js`} height={420} minimap />
          <p className="mt-3 text-xs text-amber-300/70 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <strong className="text-amber-200">Note:</strong> Hook code runs on the visitor&apos;s page. Keep it minimal. Errors are silently caught.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main exported component
// ─────────────────────────────────────────────────────────────────────────────

export function WidgetDesignPanel({ kbId }: { kbId: string }) {
  const [design, setDesign] = useState<WidgetDesign>(D);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [err,     setErr]     = useState<string | null>(null);
  const [tab,     setTab]     = useState<"visual" | "code" | "preview">("visual");
  const [sandbox, setSandbox] = useState(false);

  /* ── Load ── */
  useEffect(() => {
    if (!kbId) return;
    fetch(apiUrl(`/api/kbs/${kbId}/config`), { headers: withAuthHeaders({}) })
      .then((r) => r.json())
      .then((data: Record<string, unknown>) => {
        setDesign({
          primaryColour:   String(data.primaryColour  ?? D.primaryColour),
          accentColour:    String(data.accentColour   ?? D.accentColour),
          launcherColour:  String(data.launcherColour ?? data.primaryColour ?? D.launcherColour),
          widgetTheme:     data.widgetTheme === "dark" ? "dark" : "light",
          widgetPosition:  data.widgetPosition === "bottom-left" ? "bottom-left" : "bottom-right",
          widgetButtonSize:   Number(data.widgetButtonSize   ?? D.widgetButtonSize),
          widgetBorderRadius: Number(data.widgetBorderRadius ?? D.widgetBorderRadius),
          widgetFontFamily:   String(data.widgetFontFamily   ?? D.widgetFontFamily),
          widgetChatHeight:   Number(data.widgetChatHeight   ?? D.widgetChatHeight),
          widgetShowBranding: data.widgetShowBranding !== false,
          widgetLauncherLabel: String(data.widgetLauncherLabel ?? ""),
          widgetMode: (["floating","inline","headless"].includes(String(data.widgetMode ?? ""))
            ? data.widgetMode : "floating") as WidgetDesign["widgetMode"],
          assistantName:   String(data.assistantName   ?? D.assistantName),
          welcomeMessage:  String(data.welcomeMessage  ?? D.welcomeMessage),
          avatarUrl:       String(data.avatarUrl       ?? ""),
          headerBg:        String(data.headerBg        ?? ""),
          headerTextColor: String(data.headerTextColor ?? D.headerTextColor),
          headerHeight:    Number(data.headerHeight    ?? D.headerHeight),
          headerBlur:      Boolean(data.headerBlur),
          showStatusDot:   data.showStatusDot !== false,
          statusDotColor:  String(data.statusDotColor  ?? D.statusDotColor),
          avatarShape:     (["circle","rounded","square"].includes(String(data.avatarShape ?? ""))
            ? data.avatarShape : "circle") as WidgetDesign["avatarShape"],
          chatAreaBg:      String(data.chatAreaBg      ?? ""),
          userBubbleBg:    String(data.userBubbleBg    ?? ""),
          userBubbleText:  String(data.userBubbleText  ?? D.userBubbleText),
          userBubbleRadius:  String(data.userBubbleRadius  ?? D.userBubbleRadius),
          userBubblePadding: String(data.userBubblePadding ?? D.userBubblePadding),
          userBubbleShadow:  String(data.userBubbleShadow  ?? D.userBubbleShadow),
          botBubbleBg:    String(data.botBubbleBg    ?? ""),
          botBubbleText:  String(data.botBubbleText  ?? ""),
          botBubbleRadius:  String(data.botBubbleRadius  ?? D.botBubbleRadius),
          botBubbleBorder:  String(data.botBubbleBorder  ?? ""),
          botBubblePadding: String(data.botBubblePadding ?? D.botBubblePadding),
          botBubbleShadow:  String(data.botBubbleShadow  ?? D.botBubbleShadow),
          messageGap:        Number(data.messageGap        ?? D.messageGap),
          messageMaxWidth:   Number(data.messageMaxWidth   ?? D.messageMaxWidth),
          messageFontSize:   Number(data.messageFontSize   ?? D.messageFontSize),
          messageLineHeight: Number(data.messageLineHeight ?? D.messageLineHeight),
          showTimestamps:    Boolean(data.showTimestamps),
          timestampColor:    String(data.timestampColor    ?? D.timestampColor),
          timestampFontSize: Number(data.timestampFontSize ?? D.timestampFontSize),
          typingDotColor: String(data.typingDotColor ?? D.typingDotColor),
          typingDotSize:  Number(data.typingDotSize  ?? D.typingDotSize),
          inputBg:    String(data.inputBg    ?? ""),
          inputBorder:String(data.inputBorder ?? ""),
          inputBorderFocus: String(data.inputBorderFocus ?? ""),
          inputRadius:  Number(data.inputRadius  ?? D.inputRadius),
          inputTextColor:        String(data.inputTextColor        ?? ""),
          inputPlaceholderColor: String(data.inputPlaceholderColor ?? ""),
          inputPadding:   String(data.inputPadding   ?? D.inputPadding),
          inputAreaBg:    String(data.inputAreaBg    ?? ""),
          inputAreaBorder:String(data.inputAreaBorder ?? ""),
          sendBtnBg:       String(data.sendBtnBg       ?? ""),
          sendBtnHoverBg:  String(data.sendBtnHoverBg  ?? ""),
          sendBtnTextColor:String(data.sendBtnTextColor ?? D.sendBtnTextColor),
          sendBtnRadius:   Number(data.sendBtnRadius   ?? D.sendBtnRadius),
          sendBtnSize:     Number(data.sendBtnSize     ?? D.sendBtnSize),
          scrollbarWidth:      Number(data.scrollbarWidth      ?? D.scrollbarWidth),
          scrollbarColor:      String(data.scrollbarColor      ?? D.scrollbarColor),
          scrollbarTrackColor: String(data.scrollbarTrackColor ?? D.scrollbarTrackColor),
          footerBg:        String(data.footerBg        ?? ""),
          footerTextColor: String(data.footerTextColor ?? ""),
          customPoweredBy: String(data.customPoweredBy ?? D.customPoweredBy),
          animationsEnabled: data.animationsEnabled !== false,
          messageAnimationStyle: (["fade","slide","pop","none"].includes(String(data.messageAnimationStyle ?? ""))
            ? data.messageAnimationStyle : "fade") as WidgetDesign["messageAnimationStyle"],
          customCss:         String(data.customCss         ?? ""),
          customLauncherSvg: String(data.customLauncherSvg ?? ""),
          customHeaderHtml:  String(data.customHeaderHtml  ?? ""),
          customFooterHtml:  String(data.customFooterHtml  ?? ""),
          customThemeCss:    String(data.customThemeCss    ?? ""),
          customInjectJs:    String(data.customInjectJs    ?? ""),
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [kbId]);

  const set = useCallback(<K extends keyof WidgetDesign>(key: K, val: WidgetDesign[K]) => {
    setDesign((prev) => ({ ...prev, [key]: val }));
    setSaved(false);
  }, []);

  /* ── Save ── */
  const save = async () => {
    setSaving(true); setErr(null); setSaved(false);
    try {
      const body: Record<string, unknown> = { ...design };
      // Coerce empty strings to null for nullable DB columns
      const nullable = ["headerBg","chatAreaBg","userBubbleBg","botBubbleBg","botBubbleText",
        "botBubbleBorder","inputBg","inputBorder","inputBorderFocus","inputTextColor",
        "inputPlaceholderColor","inputAreaBg","inputAreaBorder","sendBtnBg","sendBtnHoverBg",
        "footerBg","footerTextColor","avatarUrl","widgetLauncherLabel","customCss",
        "customLauncherSvg","customHeaderHtml","customFooterHtml","customThemeCss","customInjectJs"];
      for (const k of nullable) if (body[k] === "") body[k] = null;

      const res = await fetch(apiUrl(`/api/kbs/${kbId}/config`), {
        method: "PATCH",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) throw new Error((data.error as string) ?? "Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 3500);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  const reset = () => {
    if (!confirm("Reset ALL design settings to factory defaults?")) return;
    setDesign(D); setSaved(false);
  };

  if (loading) return (
    <div className="flex items-center gap-3 text-white/40 py-10 text-sm">
      <RefreshCw className="w-4 h-4 animate-spin" /> Loading widget design…
    </div>
  );

  return (
    <div className="space-y-5">
      {/* ── Top bar ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-white">Widget Design</h2>
          <p className="mt-0.5 text-sm text-white/50">
            Customise every visual element. Live preview updates instantly — save when ready.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap shrink-0">
          <Button variant="ghost" size="sm" onClick={reset}
            className="text-white/35 hover:text-white text-xs">Reset defaults</Button>
          <Button size="sm" onClick={save} disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-5 gap-2">
            {saving ? <><RefreshCw className="h-3 w-3 animate-spin" /> Saving…</> :
             saved  ? <><Check className="h-3 w-3" /> Saved!</>                  :
             "Save design"}
          </Button>
        </div>
      </div>

      {err && (
        <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{err}</p>
      )}

      {/* ── Tab switcher ── */}
      <div className="flex items-center gap-1 rounded-xl bg-white/[0.03] border border-white/[0.08] p-1 w-fit">
        {([
          { id:"visual",  label:"Visual Controls", icon:Palette },
          { id:"code",    label:"Code Editor",     icon:Code2   },
          { id:"preview", label:"Preview",          icon:Eye     },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all ${
              tab === id
                ? "bg-indigo-600/20 text-indigo-200 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.4)]"
                : "text-white/45 hover:text-white hover:bg-white/[0.04]"
            }`}>
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>

      {/* ── Visual Controls + inline preview ── */}
      {tab === "visual" && (
        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] items-start">
          {/* Scrollable controls column */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5
            lg:max-h-[calc(100vh-13rem)] lg:overflow-y-auto">
            <Suspense fallback={<div className="h-12 animate-pulse rounded-xl bg-white/5" />}>
              <ControlsPanel d={design} set={set} />
            </Suspense>
          </div>

          {/* Live preview — always visible, no iframe, no collapse */}
          <div className="lg:sticky lg:top-6 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-white/30">Live Preview</p>
                <p className="text-xs text-white/35 mt-0.5">Reflects every change instantly. Try sending a message!</p>
              </div>
              <button onClick={() => setSandbox(!sandbox)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10
                  bg-white/[0.03] px-3 py-1.5 text-xs text-white/50 hover:text-white hover:bg-white/[0.06]">
                <Monitor className="h-3.5 w-3.5" />
                {sandbox ? "Hide sandbox" : "Real runtime sandbox"}
              </button>
            </div>
            <WidgetPreview design={design} />
            {sandbox && <FloatingSandboxPreview design={design} />}
            <p className="text-[11px] text-white/20 text-center">
              React preview = instant · Real sandbox = actual clara.js runtime
            </p>
          </div>
        </div>
      )}

      {/* ── Code Editor ── */}
      {tab === "code" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
          <AdvancedCodePanel d={design} set={set} kbId={kbId} />
          <div className="lg:sticky lg:top-6 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/30">Live Preview</p>
            <WidgetPreview design={design} />
          </div>
        </div>
      )}

      {/* ── Full preview ── */}
      {tab === "preview" && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2 items-start">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/30">React Preview</p>
              <p className="text-xs text-white/35">Fully interactive — try sending a message.</p>
              <WidgetPreview design={design} />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/30">Real Runtime Sandbox</p>
              <p className="text-xs text-white/35">Actual clara.js widget. Click the launcher button to open.</p>
              <FloatingSandboxPreview design={design} />
            </div>
          </div>

          {/* Inline embed (collapsed by default) */}
          <Collapsible>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02]">
              <div className="flex items-center justify-between gap-4 px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-white">Inline embed preview</p>
                  <p className="text-xs text-white/40 mt-0.5">
                    Load the actual <code className="bg-white/10 rounded px-1">/embed/widget</code> page in preview mode.
                  </p>
                </div>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm"
                    className="border-white/10 bg-white/[0.03] text-white/60 hover:text-white shrink-0">
                    <ChevronDown className="mr-1.5 h-4 w-4" /> Show
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <div className="border-t border-white/[0.06]">
                  <iframe title="Inline embed" src="/embed/widget?preview=1"
                    onLoad={(e) => {
                      const win = (e.target as HTMLIFrameElement).contentWindow;
                      win?.postMessage({ type: "clara-admin-preview-config", payload: design },
                        window.location.origin);
                    }}
                    className="w-full" style={{ height: 520 }}
                    sandbox="allow-scripts allow-same-origin allow-forms" />
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        </div>
      )}
    </div>
  );
}
