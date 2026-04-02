"use client";
/**
 * WidgetDesignPanel.tsx — Complete deep widget design editor.
 * • Every property saves to DB via PATCH /api/kbs/:kbId/config
 * • Advanced code editors are SYNCED with visual controls (generate real CSS from design state)
 * • Every control has plain-English placeholder/hint for non-technical users
 * • Live React preview reflects design instantly, no iframe collapse
 */

import React, { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import dynamic from "next/dynamic";
import {
  ChevronDown, Code2, Eye, RefreshCw, Palette, Layout, Type,
  MessageSquare, Send, Sliders, Sparkles, Monitor, Wand2, Check, Radio,
} from "lucide-react";
import { Button }          from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { LiveCodeEditor }  from "@/components/admin/live-code-editor";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl }          from "@/lib/runtime";

// Voice preview — dynamically imported (uses browser APIs, no SSR)
const VoiceSandboxPreview = dynamic(
  () => import("@/components/admin/VoiceSandboxPreview").then(m => ({ default: m.VoiceSandboxPreview })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08]
        bg-white/[0.02] px-5 py-6 text-sm text-white/35">
        <span className="h-4 w-4 animate-spin rounded-full border border-white/20 border-t-white/60"/>
        Loading voice preview…
      </div>
    ),
  }
);

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
  // Voice mode design
  voiceBtnBg: string; voiceBtnSize: number; voiceBtnRadius: number;
  voiceBtnActiveColor: string; voicePanelBg: string; voiceWaveColor: string;
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
  // Voice mode design
  voiceBtnBg:"",             voiceBtnSize:36,    voiceBtnRadius:10,
  voiceBtnActiveColor:"#ef4444", voicePanelBg:"", voiceWaveColor:"#6366f1",
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
  const [inp, setInp]       = useState("");
  const [typing, setTyp]    = useState(false);
  const [imgErr, setImgErr] = useState(false);   // avatar image error fallback
  const [sendHov, setSendHov] = useState(false); // send button hover state
  const [voiceActive, setVoiceActive] = useState(false);
  const botRef = useRef<HTMLDivElement>(null);

  // Sync welcome message
  useEffect(() => {
    setMsgs((p) => p.map((m) => m.id === "w" ? { ...m, content: d.welcomeMessage } : m));
  }, [d.welcomeMessage]);

  // Reset avatar error when URL changes
  useEffect(() => { setImgErr(false); }, [d.avatarUrl]);

  useEffect(() => { botRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  // ── Resolve all design tokens with proper fallbacks ───────────────────────
  const primary  = d.primaryColour  || "#6366f1";
  const accent   = d.accentColour   || "#818cf8";
  const dark     = d.widgetTheme === "dark";

  // Header: always prefer explicit headerBg; fall back to primaryColour
  const hdrBg    = (d.headerBg && d.headerBg.trim()) ? d.headerBg.trim() : primary;

  const chatBg   = (d.chatAreaBg && d.chatAreaBg.trim()) ? d.chatAreaBg.trim()
                   : (dark ? "#0f0f1a" : "#f8f9fd");
  const userBg   = (d.userBubbleBg && d.userBubbleBg.trim()) ? d.userBubbleBg.trim() : primary;
  const botBg    = (d.botBubbleBg && d.botBubbleBg.trim()) ? d.botBubbleBg.trim()
                   : (dark ? "#2a2a40" : "#f0f0f8");
  const botTxt   = (d.botBubbleText && d.botBubbleText.trim()) ? d.botBubbleText.trim()
                   : (dark ? "#e2e2f0" : "#1f2937");
  const inputBg2 = (d.inputBg && d.inputBg.trim()) ? d.inputBg.trim()
                   : (dark ? "#1a1a2e" : "#fff");
  const inputBrd = (d.inputBorder && d.inputBorder.trim()) ? d.inputBorder.trim()
                   : `1px solid ${dark ? "rgba(255,255,255,0.1)" : "#e5e7eb"}`;
  const areaB    = (d.inputAreaBorder && d.inputAreaBorder.trim()) ? d.inputAreaBorder.trim()
                   : `1px solid ${dark ? "rgba(255,255,255,0.08)" : "#e5e7eb"}`;
  const areaBg   = (d.inputAreaBg && d.inputAreaBg.trim()) ? d.inputAreaBg.trim()
                   : (dark ? "#0f0f1a" : "#fff");

  // Send button: active bg / hover bg
  const sendBgActive = (d.sendBtnBg && d.sendBtnBg.trim()) ? d.sendBtnBg.trim() : primary;
  const sendBgHover  = (d.sendBtnHoverBg && d.sendBtnHoverBg.trim()) ? d.sendBtnHoverBg.trim() : sendBgActive;
  const sendBgInactive = dark ? "#2a2a40" : "#e5e7eb";
  const voiceBtnBg = (d.voiceBtnBg && d.voiceBtnBg.trim()) ? d.voiceBtnBg.trim() : (dark ? "#2a2a40" : "#e5e7eb");
  const voiceBtnSize = d.voiceBtnSize || 36;
  const voiceBtnRadius = d.voiceBtnRadius || 10;
  const voiceActiveColor = (d.voiceBtnActiveColor && d.voiceBtnActiveColor.trim()) ? d.voiceBtnActiveColor.trim() : "#ef4444";
  const voicePanelBg = (d.voicePanelBg && d.voicePanelBg.trim()) ? d.voicePanelBg.trim() : (dark ? "rgba(39,39,59,0.92)" : "#eef2ff");
  const voiceWaveColor = (d.voiceWaveColor && d.voiceWaveColor.trim()) ? d.voiceWaveColor.trim() : accent;

  // Footer
  const footTxt  = (d.footerTextColor && d.footerTextColor.trim()) ? d.footerTextColor.trim()
                   : (dark ? "#4a4a6a" : "#d1d5db");

  // Avatar shape → border-radius
  const avatarBr = d.avatarShape === "square" ? "4px"
                 : d.avatarShape === "rounded" ? "8px"
                 : "50%";

  // Placeholder colour (used as CSS variable so ::placeholder works)
  const phColor  = (d.inputPlaceholderColor && d.inputPlaceholderColor.trim())
                 ? d.inputPlaceholderColor.trim()
                 : (dark ? "#555575" : "#9ca3af");

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
    /* Placeholder colour — must be CSS, cannot be set via inline style */
    textarea.pvw-ta::placeholder,
    .pvw-ta::placeholder { color: ${phColor} !important; }
    /* User-defined code overrides (applied AFTER base styles above) */
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

  // Mode badge label
  const modeBadge = d.widgetMode === "inline" ? "Inline embed"
                  : d.widgetMode === "headless" ? "Headless (API only)"
                  : "Floating launcher";

  return (
    <div style={{ fontFamily: d.widgetFontFamily, height: panelH, borderRadius: d.widgetBorderRadius,
        display: "flex", flexDirection: "column", overflow: "hidden" }}
      className="border border-white/[0.1] shadow-2xl">
      <style>{dynCss}</style>

      {/* Header — background uses explicit inline style so it always wins over CSS classes */}
      <div className="clara-header shrink-0 flex items-center gap-3 px-4"
        style={{
          height: d.headerHeight,
          background: hdrBg,          /* explicit; overrides all CSS class rules */
          color: d.headerTextColor,
          backdropFilter: d.headerBlur ? "blur(12px)" : undefined,
          WebkitBackdropFilter: d.headerBlur ? "blur(12px)" : undefined,
        }}>
        {/* Avatar — shows image if URL is valid, falls back to initials on 404/error */}
        {d.avatarUrl && !imgErr
          ? <img
              key={d.avatarUrl}   /* remount on URL change = fresh load */
              src={d.avatarUrl}
              alt=""
              className="clara-avatar shrink-0"
              crossOrigin="anonymous"
              onError={() => setImgErr(true)}
              style={{ width: 32, height: 32, borderRadius: avatarBr, objectFit: "cover",
                flexShrink: 0 }}
            />
          : <div className="clara-avatar shrink-0 flex items-center justify-center font-bold"
              style={{ width: 32, height: 32, borderRadius: avatarBr, background: accent,
                color: d.headerTextColor, fontSize: 14, flexShrink: 0 }}>
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
        {/* Header slot — guard: skip if it looks like a full HTML page (corruption from old bug) */}
        {d.customHeaderHtml && !d.customHeaderHtml.includes("<!DOCTYPE") && !d.customHeaderHtml.includes("<html") && d.customHeaderHtml.length < 2000 && (
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
          <button
            onClick={() => setVoiceActive((v) => !v)}
            title={voiceActive ? "Stop voice" : "Start voice"}
            className="clara-voice-btn shrink-0 flex items-center justify-center transition-all"
            style={{
              width: voiceBtnSize,
              height: voiceBtnSize,
              borderRadius: voiceBtnRadius,
              background: voiceActive ? voiceActiveColor : voiceBtnBg,
              color: voiceActive ? "#fff" : (dark ? "#9ca3af" : "#6b7280"),
              border: "none",
              cursor: "pointer",
              transition: "background 0.18s, transform 0.1s",
              transform: voiceActive ? "scale(1.08)" : "scale(1)",
            }}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
              {voiceActive
                ? <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zm0 16a7 7 0 0 1-7-7H3a9 9 0 0 0 8 8.94V21h2v-2.06A9 9 0 0 0 21 10h-2a7 7 0 0 1-7 7z"/>
                : <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 3.02-3.04 5.35-6.12 5.35S5.58 14.02 5.09 11H3.07c.52 3.85 3.65 6.83 7.43 7.18V21h3v-2.82c3.78-.35 6.91-3.33 7.43-7.18h-2.02z"/>
              }
            </svg>
          </button>
          <button onClick={send} disabled={!inp.trim()}
            className="clara-send-btn shrink-0 flex items-center justify-center transition-all"
            onMouseEnter={() => setSendHov(true)}
            onMouseLeave={() => setSendHov(false)}
            style={{
              width: d.sendBtnSize, height: d.sendBtnSize,
              borderRadius: d.sendBtnRadius,
              /* Hover: use sendBtnHoverBg if set; otherwise darken active bg */
              background: !inp.trim() ? sendBgInactive
                          : sendHov   ? sendBgHover
                          :             sendBgActive,
              color: inp.trim() ? d.sendBtnTextColor : (dark ? "#555" : "#aaa"),
              border: "none",
              cursor: inp.trim() ? "pointer" : "not-allowed",
              transition: "background 0.18s, transform 0.1s",
              transform: sendHov && inp.trim() ? "scale(1.06)" : "scale(1)",
            }}>
            <svg className="clara-send-icon" viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
        {voiceActive && (
          <div style={{
            marginTop: 10,
            padding: "10px 12px",
            borderRadius: Math.max(12, voiceBtnRadius),
            background: voicePanelBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: dark ? "#f5f7ff" : "#1f2937" }}>
                Voice mode active
              </div>
              <div style={{ fontSize: 11, color: dark ? "#a5b0c5" : "#6b7280", marginTop: 2 }}>
                Voice controls preview your saved widget styling.
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 18 }}>
              {[8, 14, 10, 16].map((h, i) => (
                <span key={i} style={{
                  width: 4,
                  height: h,
                  borderRadius: 999,
                  background: voiceWaveColor,
                  opacity: 0.95,
                }} />
              ))}
            </div>
          </div>
        )}
        {/* Branding footer — explicit boolean cast prevents "false" string rendering */}
        {Boolean(d.widgetShowBranding) && (
          <div className="clara-branding text-center mt-1.5"
            style={{ fontSize: 10, color: footTxt, background: d.footerBg || "transparent" }}>
            {d.customFooterHtml
              ? <span dangerouslySetInnerHTML={{ __html: d.customFooterHtml }} />
              : (d.customPoweredBy && d.customPoweredBy.trim()) ? d.customPoweredBy.trim() : "Powered by Clara AI"}
          </div>
        )}
      </div>

      {/* Widget mode badge — shows which deploy mode is currently selected */}
      <div style={{ background: dark ? "#0f0f1a" : "#f8f9fd", borderTop: `1px solid ${dark ? "rgba(255,255,255,0.06)" : "#e5e7eb"}` }}
        className="shrink-0 px-3 py-1.5 flex items-center justify-between">
        <span style={{ fontSize: 10, color: dark ? "#4a4a6a" : "#aaa" }}>
          Mode: <strong style={{ color: dark ? "#818cf8" : "#6366f1" }}>{modeBadge}</strong>
        </span>
        <span style={{ fontSize: 10, color: dark ? "#4a4a6a" : "#bbb" }}>Live preview</span>
      </div>
    </div>
  );
}

function FloatingSandboxPreview({ design }: { design: WidgetDesign }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const previewKeyRef = useRef(`clara-admin-preview:${Math.random().toString(36).slice(2, 10)}`);
  const origin   = typeof window !== "undefined" ? window.location.origin : "";

  const payload = useMemo(() => ({
    kbId: "preview-kb",
    kbName: "Admin preview",
    assistantName:   design.assistantName,
    avatarUrl:       design.avatarUrl || null,
    welcomeMessage:  design.welcomeMessage,
    defaultLanguage: "en",
    // Core colours
    primaryColour:   design.primaryColour,
    accentColour:    design.accentColour,
    launcherColour:  design.launcherColour,
    // Widget layout
    widgetTheme:         design.widgetTheme,
    widgetBorderRadius:  design.widgetBorderRadius,
    widgetFontFamily:    design.widgetFontFamily,
    widgetChatHeight:    design.widgetChatHeight,
    widgetShowBranding:  design.widgetShowBranding,
    widgetMode:          "floating",
    // Header
    headerBg:           design.headerBg || null,
    headerTextColor:    design.headerTextColor,
    headerHeight:       design.headerHeight,
    headerBlur:         design.headerBlur,
    showStatusDot:      design.showStatusDot,
    statusDotColor:     design.statusDotColor,
    avatarShape:        design.avatarShape,
    // Chat area
    chatAreaBg:         design.chatAreaBg || null,
    // User bubble
    userBubbleBg:       design.userBubbleBg || null,
    userBubbleText:     design.userBubbleText,
    userBubbleRadius:   design.userBubbleRadius,
    userBubblePadding:  design.userBubblePadding,
    userBubbleShadow:   design.userBubbleShadow,
    // Bot bubble
    botBubbleBg:        design.botBubbleBg || null,
    botBubbleText:      design.botBubbleText || null,
    botBubbleRadius:    design.botBubbleRadius,
    botBubbleBorder:    design.botBubbleBorder || null,
    botBubblePadding:   design.botBubblePadding,
    botBubbleShadow:    design.botBubbleShadow,
    // Messages
    messageGap:         design.messageGap,
    messageMaxWidth:    design.messageMaxWidth,
    messageFontSize:    design.messageFontSize,
    messageLineHeight:  design.messageLineHeight,
    // Timestamps
    showTimestamps:     design.showTimestamps,
    timestampColor:     design.timestampColor,
    timestampFontSize:  design.timestampFontSize,
    // Typing
    typingDotColor:     design.typingDotColor,
    typingDotSize:      design.typingDotSize,
    // Input
    inputBg:            design.inputBg || null,
    inputBorder:        design.inputBorder || null,
    inputBorderFocus:   design.inputBorderFocus || null,
    inputRadius:        design.inputRadius,
    inputTextColor:     design.inputTextColor || null,
    inputPlaceholderColor: design.inputPlaceholderColor || null,
    inputPadding:       design.inputPadding,
    inputAreaBg:        design.inputAreaBg || null,
    inputAreaBorder:    design.inputAreaBorder || null,
    // Send button
    sendBtnBg:          design.sendBtnBg || null,
    sendBtnHoverBg:     design.sendBtnHoverBg || null,
    sendBtnTextColor:   design.sendBtnTextColor,
    sendBtnRadius:      design.sendBtnRadius,
    sendBtnSize:        design.sendBtnSize,
    // Scrollbar
    scrollbarWidth:     design.scrollbarWidth,
    scrollbarColor:     design.scrollbarColor,
    scrollbarTrackColor: design.scrollbarTrackColor,
    // Footer
    footerBg:           design.footerBg || null,
    footerTextColor:    design.footerTextColor || null,
    customPoweredBy:    design.customPoweredBy || null,
    // Animations
    animationsEnabled:     design.animationsEnabled,
    messageAnimationStyle: design.messageAnimationStyle,
    voiceEnabled:         true,
    voiceProvider:        "openai",
    voiceBtnBg:           design.voiceBtnBg || null,
    voiceBtnSize:         design.voiceBtnSize,
    voiceBtnRadius:       design.voiceBtnRadius,
    voiceBtnActiveColor:  design.voiceBtnActiveColor,
    voicePanelBg:         design.voicePanelBg || null,
    voiceWaveColor:       design.voiceWaveColor,
    // Custom code
    customCss:          design.customCss || null,
    customThemeCss:     design.customThemeCss || null,
    customHeaderHtml:   (design.customHeaderHtml && design.customHeaderHtml.length < 2000) ? design.customHeaderHtml : null,
    customFooterHtml:   design.customFooterHtml || null,
  }), [design]);

  const postMsg = useCallback(() => {
    if (!frameRef.current?.contentWindow || !origin) return;
    frameRef.current.contentWindow.postMessage(
      { type: "clara-admin-preview-config", payload }, origin);
  }, [origin, payload]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(previewKeyRef.current, JSON.stringify(payload));
    } catch {}
  }, [payload]);

  useEffect(() => {
    return () => {
      if (typeof window === "undefined") return;
      try {
        window.sessionStorage.removeItem(previewKeyRef.current);
      } catch {}
    };
  }, []);

  useEffect(() => { postMsg(); }, [postMsg]);

  useEffect(() => {
    function handleFrameMessage(ev: MessageEvent) {
      if (ev.origin !== origin) return;
      if (ev.source !== frameRef.current?.contentWindow) return;
      const data = ev.data as { type?: string } | null;
      if (data?.type !== "clara-admin-preview-ready") return;
      postMsg();
    }

    window.addEventListener("message", handleFrameMessage);
    return () => window.removeEventListener("message", handleFrameMessage);
  }, [origin, postMsg]);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a1120]">
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-white">Live Sandbox Preview</p>
          <p className="text-xs text-white/40">
            Powered by <code className="bg-white/10 rounded px-1">/embed/widget</code> - 
            shell-free widget renderer with live unsaved design tokens
          </p>
        </div>
        <div className="flex gap-1.5 items-center">
          <span className="text-[10px] text-emerald-400/70 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-0.5">
            Synced ✓
          </span>
          {["rose-400/70","amber-300/70","emerald-400/70"].map((c) => (
            <span key={c} className={`h-2.5 w-2.5 rounded-full bg-${c}`} />
          ))}
        </div>
      </div>
        <iframe
          ref={frameRef}
          title="Widget embed preview"
          src={`/embed/widget?preview=1&previewKey=${encodeURIComponent(previewKeyRef.current)}`}
          onLoad={postMsg}
          className="w-full"
        style={{ height: 520, background: "transparent" }}
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
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

      <SectionHeader icon={Mic} label="Voice Mode Design" />
      <div className="space-y-3 pb-2">
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3 mb-1">
          <p className="text-xs text-white/60 leading-relaxed">
            <strong className="text-white/90">Voice button styling.</strong>{" "}
            The voice button appears in the input area when voice is enabled for this assistant.
            Enable voice in the AI Settings tab. Design it here.
          </p>
        </div>
        <Field label="Voice button background" hint="Background of the mic button. Leave empty for the default grey.">
          <ColourInput value={d.voiceBtnBg} onChange={(v) => set("voiceBtnBg", v)} placeholder="empty = grey (light) / dark grey (dark theme)" />
        </Field>
        <Field label="Active / recording colour" hint="Colour of the button while the microphone is recording. Red (#ef4444) is the standard signal.">
          <ColourInput value={d.voiceBtnActiveColor} onChange={(v) => set("voiceBtnActiveColor", v)} placeholder="#ef4444" />
        </Field>
        <Field label="Voice button size" hint="Width and height of the mic button in pixels.">
          <RangeInput value={d.voiceBtnSize} min={24} max={64} unit="px" onChange={(v) => set("voiceBtnSize", v)} />
        </Field>
        <Field label="Voice button corner radius" hint="0 = square. 50 = perfect circle.">
          <RangeInput value={d.voiceBtnRadius} min={0} max={50} unit="px" onChange={(v) => set("voiceBtnRadius", v)} />
        </Field>
        <Field label="Voice panel background" hint="Background of the fullscreen voice overlay. Leave empty for the theme default.">
          <ColourInput value={d.voicePanelBg} onChange={(v) => set("voicePanelBg", v)} placeholder="empty = theme default" />
        </Field>
        <Field label="Voice waveform colour" hint="Colour of the animated waveform bars shown while speaking.">
          <ColourInput value={d.voiceWaveColor} onChange={(v) => set("voiceWaveColor", v)} placeholder="#6366f1" />
        </Field>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// TypeScript type definitions injected into Monaco for full widget API types
// ─────────────────────────────────────────────────────────────────────────────

const WIDGET_TYPE_DEFS = `
/** Clara AI Widget — full TypeScript type definitions */

/** Message object in the conversation */
interface ClaraMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ title: string; snippet: string; index: number }>;
}

/** Tailwind-aware CSS class names for Clara elements */
type ClaraClass =
  | ".clara-widget" | ".clara-header" | ".clara-header-name" | ".clara-avatar"
  | ".clara-messages" | ".clara-msg-user" | ".clara-msg-bot" | ".clara-timestamp"
  | ".clara-sources" | ".clara-typing" | ".clara-typing-dot"
  | ".clara-input-area" | ".clara-textarea" | ".clara-send-btn" | ".clara-send-icon"
  | ".clara-branding" | ".clara-header-status";

/** CSS variables available in the widget */
interface ClaraCssVars {
  "--clara-primary": string;
  "--clara-accent": string;
  "--clara-radius": string;
  "--clara-font": string;
  "--clara-header-h": string;
  "--clara-msg-gap": string;
}

/** Behaviour hooks you can attach to window.ClaraHooks */
interface ClaraHooks {
  /** Return false to block the message from being sent */
  onBeforeSend?: (message: string) => boolean | Promise<boolean>;
  /** Called when the assistant finishes a full response */
  onResponse?: (text: string, sources: ClaraMessage["sources"]) => void;
  /** Called for each streaming token */
  onToken?: (token: string) => void;
  /** Called when the chat panel opens */
  onOpen?: () => void;
  /** Called when the chat panel closes */
  onClose?: () => void;
  /** Called when the user submits a message */
  onSend?: (message: string) => void;
  /** Called when an error occurs */
  onError?: (error: Error) => void;
}

/** The global ClaraWidget runtime API */
interface ClaraWidgetAPI {
  open(): void;
  close(): void;
  toggle(): void;
  sendMessage(text: string): void;
  clearHistory(): void;
  refreshDesign(): void;
  getMessages(): ClaraMessage[];
}

declare global {
  interface Window {
    ClaraHooks: ClaraHooks;
    ClaraWidget: ClaraWidgetAPI;
  }
}
`;

/** Tailwind CDN snippet — injected into the widget sandbox so Tailwind classes work */
const TAILWIND_CDN = `<script src="https://cdn.tailwindcss.com"></script>`;

/** Generate a full interactive HTML widget template with Tailwind + CSS + JS */
function generateFullHtmlTemplate(d: WidgetDesign): string {
  const primary = d.primaryColour || "#6366f1";
  const dark    = d.widgetTheme === "dark";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${d.assistantName} Widget</title>
  <!-- Tailwind CSS CDN — use any Tailwind class directly in your HTML -->
  ${TAILWIND_CDN}
  <style>
    /* ─── CSS Variables ────────────────────────────────────────────────── */
    :root {
      --clara-primary:  ${primary};
      --clara-accent:   ${d.accentColour || "#818cf8"};
      --clara-radius:   ${d.widgetBorderRadius}px;
      --clara-font:     ${d.widgetFontFamily};
      --clara-header-h: ${d.headerHeight}px;
      --clara-msg-gap:  ${d.messageGap}px;
    }

    /* ─── Base widget reset ────────────────────────────────────────────── */
    .clara-widget {
      font-family: var(--clara-font);
      border-radius: var(--clara-radius);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      height: 100%;
      background: ${dark ? "#0f0f1a" : "#f8f9fd"};
      color: ${dark ? "#e2e2f0" : "#1f2937"};
    }

    /* ─── Header ───────────────────────────────────────────────────────── */
    .clara-header {
      background: ${d.headerBg || primary};
      color: ${d.headerTextColor || "#fff"};
      height: var(--clara-header-h);
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 16px;
      flex-shrink: 0;
    }

    /* ─── Messages area ────────────────────────────────────────────────── */
    .clara-messages {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: var(--clara-msg-gap);
      padding: 16px;
    }

    /* ─── User bubble ──────────────────────────────────────────────────── */
    .clara-msg-user {
      background: ${d.userBubbleBg || primary};
      color: ${d.userBubbleText || "#fff"};
      border-radius: ${d.userBubbleRadius || "18px 18px 4px 18px"};
      padding: ${d.userBubblePadding || "10px 14px"};
      max-width: ${d.messageMaxWidth}%;
      align-self: flex-end;
      font-size: ${d.messageFontSize}px;
      line-height: ${d.messageLineHeight};
      box-shadow: ${d.userBubbleShadow || "0 1px 4px rgba(0,0,0,.15)"};
    }

    /* ─── Bot bubble ───────────────────────────────────────────────────── */
    .clara-msg-bot {
      background: ${d.botBubbleBg || (dark ? "#2a2a40" : "#f0f0f8")};
      color: ${d.botBubbleText || (dark ? "#e2e2f0" : "#1f2937")};
      border-radius: ${d.botBubbleRadius || "18px 18px 18px 4px"};
      padding: ${d.botBubblePadding || "10px 14px"};
      border: ${d.botBubbleBorder || `1px solid ${dark ? "rgba(255,255,255,.08)" : "#e5e7eb"}`};
      max-width: ${d.messageMaxWidth}%;
      align-self: flex-start;
      font-size: ${d.messageFontSize}px;
      line-height: ${d.messageLineHeight};
      box-shadow: ${d.botBubbleShadow || "0 1px 3px rgba(0,0,0,.08)"};
    }

    /* ─── Input area ───────────────────────────────────────────────────── */
    .clara-input-area {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      padding: 12px;
      border-top: ${d.inputAreaBorder || `1px solid ${dark ? "rgba(255,255,255,.08)" : "#e5e7eb"}`};
      background: ${d.inputAreaBg || (dark ? "#0f0f1a" : "#fff")};
      flex-shrink: 0;
    }

    /* ─── Textarea ─────────────────────────────────────────────────────── */
    .clara-textarea {
      flex: 1;
      resize: none;
      border-radius: ${d.inputRadius}px;
      border: ${d.inputBorder || `1px solid ${dark ? "rgba(255,255,255,.1)" : "#e5e7eb"}`};
      padding: ${d.inputPadding || "8px 12px"};
      background: ${d.inputBg || (dark ? "#1a1a2e" : "#fff")};
      color: ${d.inputTextColor || (dark ? "#e2e2f0" : "#1f2937")};
      font-size: 13px;
      font-family: inherit;
      outline: none;
      line-height: 1.5;
    }
    .clara-textarea::placeholder {
      color: ${d.inputPlaceholderColor || (dark ? "#555575" : "#9ca3af")};
    }
    .clara-textarea:focus {
      border-color: ${d.inputBorderFocus || primary};
      box-shadow: 0 0 0 3px ${d.inputBorderFocus || primary}33;
    }

    /* ─── Send button ──────────────────────────────────────────────────── */
    .clara-send-btn {
      background: ${d.sendBtnBg || primary};
      color: ${d.sendBtnTextColor || "#fff"};
      border-radius: ${d.sendBtnRadius}px;
      width: ${d.sendBtnSize}px;
      height: ${d.sendBtnSize}px;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.18s, transform 0.1s;
      flex-shrink: 0;
    }
    .clara-send-btn:hover {
      background: ${d.sendBtnHoverBg || d.sendBtnBg || primary};
      transform: scale(1.06);
    }

    /* ─── Scrollbar ────────────────────────────────────────────────────── */
    .clara-messages::-webkit-scrollbar { width: ${d.scrollbarWidth}px; }
    .clara-messages::-webkit-scrollbar-track { background: ${d.scrollbarTrackColor || "transparent"}; }
    .clara-messages::-webkit-scrollbar-thumb { background: ${d.scrollbarColor || "#c7d2fe"}; border-radius: 99px; }

    /* ─── Message animations ───────────────────────────────────────────── */
    @keyframes claraBounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-4px)} }
    @keyframes claraFadeIn  { from { opacity:0; transform:translateY(6px); } }
    @keyframes claraSlideIn { from { opacity:0; transform:translateX(20px); } }
    @keyframes claraPopIn   { from { opacity:0; transform:scale(.88); } }

    /* ══════════════════════════════════════════════════════════════════════
       ✏️  ADD YOUR OWN CSS HERE — or use Tailwind classes in your HTML!
       You can mix Tailwind utility classes with these CSS rules freely.
    ══════════════════════════════════════════════════════════════════════ */
  </style>
</head>
<body class="${dark ? "bg-gray-950 text-gray-100" : "bg-gray-50 text-gray-900"} m-0 p-0">

  <!-- Widget container — Tailwind classes work here! -->
  <div id="clara-widget" class="clara-widget" style="height:100vh; max-width:420px; margin:0 auto;">

    <!-- Header -->
    <header class="clara-header">
      <!-- Avatar — Tailwind rounded classes work here -->
      <div id="clara-avatar" class="clara-avatar flex items-center justify-center font-bold text-sm select-none"
        style="width:32px; height:32px; border-radius:${d.avatarShape==="square"?"4px":d.avatarShape==="rounded"?"8px":"50%"};
          background:${d.accentColour||"#818cf8"}; color:${d.headerTextColor||"#fff"}; flex-shrink:0;">
        ${d.assistantName.charAt(0).toUpperCase()}
      </div>
      <!-- Assistant info -->
      <div class="flex-1 min-w-0">
        <div class="clara-header-name font-semibold truncate text-sm">${d.assistantName}</div>
        ${d.showStatusDot!==false ? `
        <div class="flex items-center gap-1.5">
          <span class="clara-header-status inline-block rounded-full"
            style="width:7px;height:7px;background:${d.statusDotColor||"#4ade80"};"></span>
          <span style="font-size:11px;opacity:.75;">Online</span>
        </div>` : ""}
      </div>
    </header>

    <!-- Message list -->
    <div id="clara-messages" class="clara-messages" role="log" aria-live="polite">
      <!-- Bot welcome message -->
      <div class="clara-msg-bot">
        ${d.welcomeMessage}
      </div>
    </div>

    <!-- Input area -->
    <div class="clara-input-area">
      <textarea id="clara-input" class="clara-textarea"
        placeholder="Ask ${d.assistantName}…" rows="1"
        aria-label="Type your message"></textarea>
      <button id="clara-send" class="clara-send-btn" aria-label="Send message">
        <!-- Send arrow SVG -->
        <svg class="clara-send-icon" viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
        </svg>
      </button>
    </div>

    ${d.widgetShowBranding!==false ? `
    <!-- Branding footer -->
    <div class="clara-branding text-center py-1.5"
      style="font-size:10px; color:${d.footerTextColor||"#d1d5db"}; background:${d.footerBg||"transparent"};">
      ${d.customPoweredBy||"Powered by Clara AI"}
    </div>` : ""}

  </div><!-- /#clara-widget -->

  <script>
  /* ══════════════════════════════════════════════════════════════════════════
     Clara Widget — TypeScript-friendly JavaScript controller
     All types are documented in the TypeScript definitions above.
  ══════════════════════════════════════════════════════════════════════════ */

  /** @type {HTMLDivElement} */
  const messagesEl = document.getElementById("clara-messages");
  /** @type {HTMLTextAreaElement} */
  const inputEl    = document.getElementById("clara-input");
  /** @type {HTMLButtonElement} */
  const sendBtn    = document.getElementById("clara-send");

  /** @param {"user"|"assistant"} role @param {string} content */
  function addMessage(role, content) {
    const div = document.createElement("div");
    div.className = role === "user" ? "clara-msg-user" : "clara-msg-bot";
    div.style.animation = "claraFadeIn 0.18s ease both";
    div.textContent = content;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  /** Typing indicator */
  function showTyping() {
    const el = document.createElement("div");
    el.id = "clara-typing";
    el.className = "clara-typing flex items-center gap-1 rounded-2xl px-3 py-2";
    el.style.cssText = "background:${d.botBubbleBg||(dark?"#2a2a40":"#f0f0f8")}; display:inline-flex; align-self:flex-start;";
    [0,150,300].forEach(delay => {
      const dot = document.createElement("span");
      dot.className = "clara-typing-dot inline-block rounded-full";
      dot.style.cssText = \`width:${d.typingDotSize}px; height:${d.typingDotSize}px; background:${d.typingDotColor||"#9ca3af"}; animation:claraBounce 1.2s \${delay}ms infinite;\`;
      el.appendChild(dot);
    });
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  async function send() {
    const text = inputEl.value.trim();
    if (!text) return;

    // ClaraHooks.onBeforeSend
    if (window.ClaraHooks?.onBeforeSend) {
      const ok = await window.ClaraHooks.onBeforeSend(text);
      if (ok === false) return;
    }

    inputEl.value = "";
    inputEl.rows = 1;
    addMessage("user", text);

    const typingEl = showTyping();

    try {
      // Streaming chat request
      const res = await fetch("/api/embed/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: text }] }),
      });

      typingEl.remove();
      const botEl = addMessage("assistant", "");
      let fullText = "";

      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of dec.decode(value).split("\\n").filter(Boolean)) {
            try {
              const ev = JSON.parse(line);
              if (ev.type === "token") { fullText += ev.payload; botEl.textContent = fullText; }
            } catch {}
          }
        }
      } else {
        botEl.textContent = "Sorry, something went wrong.";
      }

      // ClaraHooks.onResponse
      window.ClaraHooks?.onResponse?.(fullText, []);

    } catch (err) {
      typingEl.remove();
      addMessage("assistant", "Network error. Please try again.");
      window.ClaraHooks?.onError?.(/** @type {Error} */ (err));
    }
  }

  // ── Event listeners ────────────────────────────────────────────────────────
  sendBtn.addEventListener("click", send);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  // Auto-resize textarea
  inputEl.addEventListener("input", () => {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + "px";
  });

  // ── Behaviour hooks — uncomment to use ────────────────────────────────────
  // window.ClaraHooks = {
  //   onBeforeSend(message) { console.log("Sending:", message); return true; },
  //   onResponse(text, sources) { console.log("Got response", text.length, "chars"); },
  //   onOpen() { document.title = "Chat with ${d.assistantName}"; },
  //   onClose() { document.title = "My Site"; },
  // };

  </script>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Advanced code editor panel — full TypeScript + Tailwind + HTML experience
// ─────────────────────────────────────────────────────────────────────────────

function AdvancedCodePanel({ d, set, kbId }: {
  d: WidgetDesign;
  set: <K extends keyof WidgetDesign>(k: K, v: WidgetDesign[K]) => void;
  kbId: string;
}) {
  const [activeTab, setActiveTab] = useState("theme");
  // widgetHtml is LOCAL-ONLY — it's always generated from visual settings
  // It is NOT saved to the DB (the full HTML template is a deploy artifact, not a stored config)
  const [widgetHtml, setWidgetHtml] = useState(() => generateFullHtmlTemplate(d));
  const [widgetHtmlCopied, setWidgetHtmlCopied] = useState(false);

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
    setWidgetHtml(generateFullHtmlTemplate(d));
  }

  function copyWidgetHtml() {
    navigator.clipboard.writeText(widgetHtml).then(() => {
      setWidgetHtmlCopied(true);
      setTimeout(() => setWidgetHtmlCopied(false), 2000);
    }).catch(() => {});
  }

  // TypeScript extra libs — give Monaco full Clara widget type knowledge
  const tsLibs = useMemo(() => [
    { filePath: "ts:filename/clara-widget.d.ts", content: WIDGET_TYPE_DEFS },
  ], []);

  const tabs = [
    { value:"theme",     label:"theme.css",      hint:"CSS + variables",     icon:"🎨" },
    { value:"widget",    label:"widget.html",     hint:"HTML + Tailwind + JS", icon:"🌐" },
    { value:"typescript",label:"widget.ts",       hint:"TypeScript API",      icon:"🔷" },
    { value:"inject",    label:"inject.css",      hint:"Shadow-DOM CSS",      icon:"💉" },
    { value:"header",    label:"header.html",     hint:"Header slot",         icon:"📌" },
    { value:"footer",    label:"footer.html",     hint:"Footer slot",         icon:"🔖" },
    { value:"launcher",  label:"launcher.svg",    hint:"FAB icon",            icon:"🚀" },
    { value:"hooks",     label:"hooks.ts",        hint:"Event hooks (TS)",    icon:"⚡" },
  ] as const;

  return (
    <div className="space-y-4">
      {/* Info bar */}
      <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Code2 className="h-4 w-4 text-indigo-300 mt-0.5 shrink-0" />
            <div className="text-xs text-white/60 leading-relaxed space-y-1">
              <div>
                <strong className="text-white/90">Full design control via code.</strong>{" "}
                Editors are pre-filled from your Visual Controls. All editors support{" "}
                <strong className="text-indigo-300">TypeScript</strong>,{" "}
                <strong className="text-cyan-300">Tailwind CSS</strong>, and plain CSS/HTML.
              </div>
              <div className="text-white/40">
                💡 <strong className="text-white/60">widget.html</strong> = full interactive HTML template with Tailwind CDN + JS controller ·{" "}
                <strong className="text-white/60">widget.ts</strong> = TypeScript API access with full type definitions
              </div>
            </div>
          </div>
          <button onClick={resync}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30
              bg-indigo-600/10 px-3 py-1.5 text-xs text-indigo-300 hover:bg-indigo-600/20 transition-all">
            <Wand2 className="h-3 w-3" /> Sync from visual
          </button>
        </div>
      </div>

      {/* Capability badges */}
      <div className="flex flex-wrap gap-2">
        {[
          { label:"TypeScript", color:"text-blue-300 bg-blue-500/10 border-blue-500/20" },
          { label:"Tailwind CSS", color:"text-cyan-300 bg-cyan-500/10 border-cyan-500/20" },
          { label:"CSS Variables", color:"text-purple-300 bg-purple-500/10 border-purple-500/20" },
          { label:"HTML Templates", color:"text-orange-300 bg-orange-500/10 border-orange-500/20" },
          { label:"Event Hooks", color:"text-yellow-300 bg-yellow-500/10 border-yellow-500/20" },
          { label:"Monaco Editor", color:"text-green-300 bg-green-500/10 border-green-500/20" },
        ].map(({ label, color }) => (
          <span key={label} className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${color}`}>
            {label}
          </span>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-xl bg-[#0b1020] p-1.5">
          {tabs.map(({ value, label, hint, icon }) => (
            <TabsTrigger key={value} value={value}
              className="flex flex-col items-start rounded-lg bg-transparent px-3 py-2 text-left min-w-0
                data-[state=active]:bg-indigo-600/20 data-[state=active]:text-indigo-200
                data-[state=active]:shadow-[inset_0_0_0_1px_rgba(99,102,241,0.4)]
                text-white/45 hover:text-white transition-all">
              <span className="text-xs font-semibold">{icon} {label}</span>
              <span className="text-[10px] opacity-55">{hint}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── theme.css — full CSS with variables ── */}
        <TabsContent value="theme" className="mt-4">
          <LiveCodeEditor
            title="Widget Theme CSS (synced from Visual Controls)"
            description="Real CSS targeting .clara-* classes and CSS variables. Auto-generated from your visual controls. You can also use Tailwind @apply and any standard CSS."
            language="css" value={d.customThemeCss}
            onChange={(v) => set("customThemeCss", v)}
            path={`inmemory://widget/${kbId}/theme.css`} height={500} minimap />
          <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="text-[11px] font-semibold text-white/40 mb-2 uppercase tracking-widest">Target these CSS classes</p>
            <div className="grid grid-cols-2 gap-1">
              {[".clara-widget",".clara-header",".clara-header-name",".clara-header-status",".clara-avatar",
                ".clara-messages",".clara-msg-user",".clara-msg-bot",".clara-timestamp",
                ".clara-sources",".clara-typing",".clara-typing-dot",
                ".clara-input-area",".clara-textarea",".clara-send-btn",".clara-send-icon",".clara-branding",
              ].map((cls) => (
                <span key={cls} className="text-[11px] font-mono text-indigo-300/80 rounded bg-white/[0.04] px-2 py-0.5">{cls}</span>
              ))}
            </div>
            <p className="text-[11px] font-semibold text-white/40 mt-3 mb-2 uppercase tracking-widest">CSS Variables</p>
            <div className="grid grid-cols-2 gap-1">
              {["--clara-primary","--clara-accent","--clara-radius","--clara-font","--clara-header-h","--clara-msg-gap"].map((v) => (
                <span key={v} className="text-[11px] font-mono text-emerald-300/80 rounded bg-white/[0.04] px-2 py-0.5">{v}</span>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ── widget.html — full HTML + Tailwind + JS template (LOCAL-ONLY, not saved to DB) ── */}
        <TabsContent value="widget" className="mt-4">
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 mb-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs text-cyan-200/80 leading-relaxed">
                <strong className="text-cyan-200">🌐 Full HTML Widget Template</strong> — generated from your Visual Controls.
                Includes <strong className="text-cyan-100">Tailwind CDN</strong>, all CSS variables, and a complete JS controller.
                The live iframe preview on the right shows exactly how it renders with Tailwind classes loaded.
              </p>
              <button onClick={copyWidgetHtml}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30
                  bg-cyan-600/10 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-600/20 transition-all">
                {widgetHtmlCopied ? <><Check className="h-3 w-3" /> Copied!</> : <>📋 Copy code</>}
              </button>
            </div>
          </div>
          {/* Split: editor + live iframe preview with Tailwind */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div>
              <LiveCodeEditor
                title="Full Widget HTML Template (Tailwind + CSS + JS)"
                description="Complete standalone widget. Tailwind classes work here — see the live preview update on the right as you edit."
                language="html"
                value={widgetHtml}
                onChange={setWidgetHtml}
                path={`inmemory://widget/${kbId}/widget-full.html`} height={560} minimap />
            </div>
            {/* Live Tailwind iframe preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-widest text-white/30">Live HTML Preview</p>
                <span className="text-[10px] text-cyan-400/70 bg-cyan-500/10 border border-cyan-500/20 rounded px-2 py-0.5">Tailwind loaded ✓</span>
              </div>
              <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a1120]">
                <div className="flex items-center gap-1.5 border-b border-white/[0.06] bg-white/[0.02] px-3 py-2">
                  {["rose-400/70","amber-300/70","emerald-400/70"].map((c) => (
                    <span key={c} className={`h-2 w-2 rounded-full bg-${c}`} />
                  ))}
                  <span className="ml-2 text-[10px] text-white/30">widget.html — live render</span>
                </div>
                <iframe
                  title="Widget HTML preview"
                  srcDoc={widgetHtml}
                  className="w-full bg-white"
                  style={{ height: 520 }}
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
              <p className="text-[11px] text-white/25 text-center">
                Renders the actual HTML with Tailwind CDN. Edit the code → see it live.
              </p>
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 flex items-center gap-2">
            <span className="text-[11px] text-amber-300/80">💡</span>
            <span className="text-[11px] text-white/40">
              This template is <strong className="text-white/60">not saved to the database</strong> — use{" "}
              <strong className="text-white/60">&quot;Sync from visual&quot;</strong> to regenerate from your Visual Controls at any time.
              Tailwind classes like <code className="bg-white/10 rounded px-1">rounded-2xl</code>, <code className="bg-white/10 rounded px-1">shadow-xl</code>, <code className="bg-white/10 rounded px-1">bg-indigo-600</code> all work.
            </span>
          </div>
        </TabsContent>

        {/* ── widget.ts — TypeScript API access ── */}
        <TabsContent value="typescript" className="mt-4">
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 mb-4">
            <p className="text-xs text-blue-200/80 leading-relaxed">
              <strong className="text-blue-200">🔷 TypeScript Widget Controller</strong> — full type definitions are loaded into Monaco.
              Get autocomplete for <code className="bg-white/10 rounded px-1 text-[11px]">window.ClaraWidget</code>, <code className="bg-white/10 rounded px-1 text-[11px]">window.ClaraHooks</code>, message types, and all widget API methods.
            </p>
          </div>
          <LiveCodeEditor
            title="TypeScript Widget Controller (full type definitions)"
            description="Full TypeScript access to the Clara widget API. All types are defined — press Ctrl+Space for autocomplete."
            language="typescript" value={d.customInjectJs}
            onChange={(v) => set("customInjectJs", v)}
            path={`inmemory://widget/${kbId}/widget.ts`} height={500} minimap
            typescriptExtraLibs={tsLibs} />
          <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="text-[11px] font-semibold text-white/40 mb-2 uppercase tracking-widest">Available TypeScript APIs</p>
            <div className="grid grid-cols-2 gap-1">
              {[
                "window.ClaraWidget.open()",
                "window.ClaraWidget.close()",
                "window.ClaraWidget.sendMessage(text)",
                "window.ClaraWidget.getMessages()",
                "window.ClaraWidget.clearHistory()",
                "window.ClaraWidget.refreshDesign()",
                "window.ClaraHooks.onBeforeSend",
                "window.ClaraHooks.onResponse",
                "window.ClaraHooks.onToken",
                "window.ClaraHooks.onOpen",
                "window.ClaraHooks.onClose",
                "window.ClaraHooks.onError",
              ].map((api) => (
                <span key={api} className="text-[11px] font-mono text-blue-300/80 rounded bg-white/[0.04] px-2 py-0.5 truncate">{api}</span>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ── inject.css ── */}
        <TabsContent value="inject" className="mt-4">
          <LiveCodeEditor title="Shadow-DOM CSS Injection"
            description="Raw CSS injected into the widget's shadow DOM (floating mode) or page (inline mode). Use for custom animations, @import font rules, or global overrides."
            language="css" value={d.customCss}
            onChange={(v) => set("customCss", v)}
            path={`inmemory://widget/${kbId}/inject.css`} height={420} minimap />
        </TabsContent>

        {/* ── header.html ── */}
        <TabsContent value="header" className="mt-4">
          <LiveCodeEditor title="Header Slot HTML (with Tailwind support)"
            description="HTML injected inside the header bar. Use Tailwind classes freely — e.g. add a close button with class='ml-auto text-white/70 hover:text-white'."
            language="html" value={d.customHeaderHtml}
            onChange={(v) => set("customHeaderHtml", v)}
            path={`inmemory://widget/${kbId}/header-slot.html`} height={300} />
        </TabsContent>

        {/* ── footer.html ── */}
        <TabsContent value="footer" className="mt-4">
          <LiveCodeEditor title="Footer Slot HTML"
            description='Replaces the "Powered by" branding. Add a logo, link, or legal text with Tailwind classes.'
            language="html" value={d.customFooterHtml}
            onChange={(v) => set("customFooterHtml", v)}
            path={`inmemory://widget/${kbId}/footer-slot.html`} height={260} />
        </TabsContent>

        {/* ── launcher.svg ── */}
        <TabsContent value="launcher" className="mt-4">
          <LiveCodeEditor title="Floating Launcher SVG Icon"
            description="Replace the default chat bubble with any SVG. Paste raw <svg> markup."
            language="html" value={d.customLauncherSvg}
            onChange={(v) => set("customLauncherSvg", v)}
            path={`inmemory://widget/${kbId}/launcher.svg`} height={300} />
        </TabsContent>

        {/* ── hooks.ts — TypeScript event hooks ── */}
        <TabsContent value="hooks" className="mt-4">
          <LiveCodeEditor title="Widget Event Hooks (TypeScript)"
            description="Full TypeScript hooks with autocomplete. Auto-generated template — uncomment any hook you need. Press Ctrl+Space for suggestions."
            language="typescript" value={d.customInjectJs}
            onChange={(v) => set("customInjectJs", v)}
            path={`inmemory://widget/${kbId}/hooks.ts`} height={460} minimap
            typescriptExtraLibs={tsLibs} />
          <p className="mt-3 text-xs text-amber-300/70 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <strong className="text-amber-200">Note:</strong> Hook code runs on the visitor&apos;s page. TypeScript is transpiled at runtime. Errors are silently caught.
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
  const [sandbox, setSandbox] = useState(true);

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
          customHeaderHtml: (() => {
            const raw = String(data.customHeaderHtml ?? "");
            // Clear if corrupted (contains a full HTML page from the old widget.html bug)
            if (raw.includes("<!DOCTYPE") || raw.includes("<html") || raw.length > 2000) return "";
            return raw;
          })(),
          customFooterHtml:  String(data.customFooterHtml  ?? ""),
          customThemeCss:    String(data.customThemeCss    ?? ""),
          customInjectJs:    String(data.customInjectJs    ?? ""),
          // Voice mode design
          voiceBtnBg:          String(data.voiceBtnBg          ?? ""),
          voiceBtnSize:        Number(data.voiceBtnSize        ?? 36),
          voiceBtnRadius:      Number(data.voiceBtnRadius      ?? 10),
          voiceBtnActiveColor: String(data.voiceBtnActiveColor ?? "#ef4444"),
          voicePanelBg:        String(data.voicePanelBg        ?? ""),
          voiceWaveColor:      String(data.voiceWaveColor      ?? "#6366f1"),
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
      // Guard: if customHeaderHtml was corrupted by the old widget.html bug, clear it
      if (typeof body.customHeaderHtml === "string" &&
          (body.customHeaderHtml.includes("<!DOCTYPE") || body.customHeaderHtml.includes("<html") ||
           (body.customHeaderHtml as string).length > 2000)) {
        body.customHeaderHtml = null;
      }
      // Coerce empty strings to null for nullable DB columns
      const nullable = ["headerBg","chatAreaBg","userBubbleBg","botBubbleBg","botBubbleText",
        "botBubbleBorder","inputBg","inputBorder","inputBorderFocus","inputTextColor",
        "inputPlaceholderColor","inputAreaBg","inputAreaBorder","sendBtnBg","sendBtnHoverBg",
        "footerBg","footerTextColor","avatarUrl","widgetLauncherLabel","customCss",
        "customLauncherSvg","customHeaderHtml","customFooterHtml","customThemeCss","customInjectJs",
        // Voice fields
        "voiceBtnBg","voiceBtnActiveColor","voicePanelBg","voiceWaveColor"];
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
                {sandbox ? "Hide embed preview" : "Show embed preview"}
              </button>
            </div>
            <WidgetPreview design={design} />
            {sandbox && <FloatingSandboxPreview design={design} />}
            <p className="text-[11px] text-white/20 text-center">
              React preview = fast inline approximation · Embed preview = public /embed/widget renderer
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
        <div className="space-y-5">
          {/* Explanation banner */}
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3 flex items-start gap-3">
            <Eye className="h-4 w-4 text-indigo-300 mt-0.5 shrink-0" />
            <div className="text-xs text-white/60 leading-relaxed">
              <strong className="text-white/90">Embed Preview is the public embed page.</strong>{" "}
              React Preview = fast inline approximation using your current design tokens.{" "}
              Embed Preview = the real <code className="bg-white/10 rounded px-1">/embed/widget</code> page
              loaded in an iframe. It uses the same renderer as the hosted embed page and updates live as you edit.
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2 items-start">
            {/* React Preview */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-white/30">React Preview</p>
                <span className="text-[10px] bg-white/[0.05] border border-white/10 rounded px-2 py-0.5 text-white/40">
                  Instant · in-page
                </span>
              </div>
              <p className="text-xs text-white/35">Try sending a message — responses stream in real time.</p>
              <WidgetPreview design={design} />
            </div>

            {/* Embed Preview */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-white/30">Embed Preview</p>
                <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-0.5 text-emerald-400/80">
                  Public renderer
                </span>
              </div>
              <p className="text-xs text-white/35">
                Real <code className="bg-white/10 rounded px-1 text-[11px]">/embed/widget</code> page with live preview config.
              </p>
              <FloatingSandboxPreview design={design} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalize raw DB/API data → WidgetDesign
// ─────────────────────────────────────────────────────────────────────────────

function fromApi(data: Record<string, unknown>): WidgetDesign {
  const s  = (v: unknown, fb: string)  => (v != null && String(v).trim() ? String(v) : fb);
  const sn = (v: unknown)              => (v != null && String(v).trim() ? String(v) : "");
  const n  = (v: unknown, fb: number)  => (v != null && Number.isFinite(Number(v)) ? Number(v) : fb);
  const b  = (v: unknown, fb: boolean) => (v != null ? Boolean(v) : fb);

  const primary = s(data.primaryColour, "#6366f1");
  return {
    primaryColour: primary,
    accentColour:  s(data.accentColour, "#818cf8"),
    launcherColour:s(data.launcherColour, primary),
    widgetTheme:         data.widgetTheme === "dark" ? "dark" : "light",
    widgetPosition:      data.widgetPosition === "bottom-left" ? "bottom-left" : "bottom-right",
    widgetButtonSize:    n(data.widgetButtonSize, 56),
    widgetBorderRadius:  n(data.widgetBorderRadius, 20),
    widgetFontFamily:    s(data.widgetFontFamily, "system-ui,sans-serif"),
    widgetChatHeight:    n(data.widgetChatHeight, 580),
    widgetShowBranding:  b(data.widgetShowBranding, true),
    widgetLauncherLabel: sn(data.widgetLauncherLabel),
    widgetMode: (["inline","headless"].includes(String(data.widgetMode))
      ? data.widgetMode : "floating") as WidgetDesign["widgetMode"],
    assistantName:  s(data.assistantName, "Clara"),
    welcomeMessage: s(data.welcomeMessage, "Hi! How can I help you today?"),
    avatarUrl:      sn(data.avatarUrl),
    headerBg:         sn(data.headerBg),
    headerTextColor:  s(data.headerTextColor, "#ffffff"),
    headerHeight:     n(data.headerHeight, 60),
    headerBlur:       b(data.headerBlur, false),
    showStatusDot:    b(data.showStatusDot, true),
    statusDotColor:   s(data.statusDotColor, "#4ade80"),
    avatarShape: (["circle","rounded","square"].includes(String(data.avatarShape))
      ? data.avatarShape : "circle") as WidgetDesign["avatarShape"],
    chatAreaBg:         sn(data.chatAreaBg),
    userBubbleBg:       sn(data.userBubbleBg),
    userBubbleText:     s(data.userBubbleText, "#ffffff"),
    userBubbleRadius:   s(data.userBubbleRadius, "18px 18px 4px 18px"),
    userBubblePadding:  s(data.userBubblePadding, "10px 14px"),
    userBubbleShadow:   s(data.userBubbleShadow, "0 1px 4px rgba(0,0,0,0.15)"),
    botBubbleBg:        sn(data.botBubbleBg),
    botBubbleText:      sn(data.botBubbleText),
    botBubbleRadius:    s(data.botBubbleRadius, "18px 18px 18px 4px"),
    botBubbleBorder:    sn(data.botBubbleBorder),
    botBubblePadding:   s(data.botBubblePadding, "10px 14px"),
    botBubbleShadow:    s(data.botBubbleShadow, "0 1px 3px rgba(0,0,0,0.08)"),
    messageGap:         n(data.messageGap, 12),
    messageMaxWidth:    n(data.messageMaxWidth, 85),
    messageFontSize:    n(data.messageFontSize, 13),
    messageLineHeight:  n(data.messageLineHeight, 1.5),
    showTimestamps:     b(data.showTimestamps, false),
    timestampColor:     s(data.timestampColor, "#9ca3af"),
    timestampFontSize:  n(data.timestampFontSize, 10),
    typingDotColor:     s(data.typingDotColor, "#9ca3af"),
    typingDotSize:      n(data.typingDotSize, 6),
    inputBg:               sn(data.inputBg),
    inputBorder:           sn(data.inputBorder),
    inputBorderFocus:      sn(data.inputBorderFocus),
    inputRadius:           n(data.inputRadius, 12),
    inputTextColor:        sn(data.inputTextColor),
    inputPlaceholderColor: sn(data.inputPlaceholderColor),
    inputPadding:          s(data.inputPadding, "8px 12px"),
    inputAreaBg:           sn(data.inputAreaBg),
    inputAreaBorder:       sn(data.inputAreaBorder),
    sendBtnBg:        sn(data.sendBtnBg),
    sendBtnHoverBg:   sn(data.sendBtnHoverBg),
    sendBtnTextColor: s(data.sendBtnTextColor, "#ffffff"),
    sendBtnRadius:    n(data.sendBtnRadius, 10),
    sendBtnSize:      n(data.sendBtnSize, 36),
    scrollbarWidth:      n(data.scrollbarWidth, 4),
    scrollbarColor:      s(data.scrollbarColor, "#c7d2fe"),
    scrollbarTrackColor: s(data.scrollbarTrackColor, "transparent"),
    footerBg:        sn(data.footerBg),
    footerTextColor: sn(data.footerTextColor),
    customPoweredBy: s(data.customPoweredBy, "Powered by Clara AI"),
    animationsEnabled:     b(data.animationsEnabled, true),
    messageAnimationStyle: (["fade","slide","pop","none"].includes(String(data.messageAnimationStyle))
      ? data.messageAnimationStyle : "fade") as WidgetDesign["messageAnimationStyle"],
    customCss:         sn(data.customCss),
    customLauncherSvg: sn(data.customLauncherSvg),
    customHeaderHtml:  sn(data.customHeaderHtml),
    customFooterHtml:  sn(data.customFooterHtml),
    customThemeCss:    sn(data.customThemeCss),
    customInjectJs:    sn(data.customInjectJs),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Small UI atom components
// ─────────────────────────────────────────────────────────────────────────────

function Sec({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2.5 pt-4 pb-1">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md
        bg-indigo-500/15 border border-indigo-500/20">
        <Icon className="h-3.5 w-3.5 text-indigo-300" />
      </div>
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
        {label}
      </span>
      <div className="flex-1 h-px bg-white/[0.05]" />
    </div>
  );
}

function Field({ label, hint, example, children }: {
  label: string; hint?: string; example?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-white/70">{label}</label>
      {children}
      {hint    && <p className="text-[11px] text-white/35 leading-snug">{hint}</p>}
      {example && (
        <p className="text-[11px] text-indigo-300/60 leading-snug">
          <span className="font-semibold">Example:</span> {example}
        </p>
      )}
    </div>
  );
}

function ColourPicker({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const isHex = /^#[0-9a-fA-F]{3,8}$/.test(value);
  return (
    <div className="flex items-center gap-2">
      <input type="color"
        value={isHex ? value : "#6366f1"}
        onChange={e => onChange(e.target.value)}
        className="h-8 w-10 shrink-0 cursor-pointer rounded-lg border border-white/10
          bg-transparent p-0.5" />
      <input type="text" value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? "e.g. #6366f1"}
        className="flex-1 min-w-0 rounded-lg border border-white/[0.1] bg-white/[0.04]
          px-3 py-1.5 text-sm font-mono text-white/80 placeholder-white/20
          focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30" />
    </div>
  );
}

function Slider({ value, min, max, step = 1, unit = "", onChange }: {
  value: number; min: number; max: number; step?: number; unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 accent-indigo-500 cursor-pointer" />
      <input type="number" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Math.min(Math.max(Number(e.target.value), min), max))}
        className="w-16 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2 py-1
          text-center text-sm font-mono text-white/80 focus:border-indigo-500/50 focus:outline-none" />
      {unit && <span className="text-xs text-white/40 w-6 shrink-0">{unit}</span>}
    </div>
  );
}

function TextBox({ value, onChange, placeholder, mono = false }: {
  value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean;
}) {
  return (
    <input type="text" value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2
        text-sm text-white/80 placeholder-white/20 focus:border-indigo-500/50
        focus:outline-none focus:ring-1 focus:ring-indigo-500/30
        ${mono ? "font-mono text-xs" : ""}`} />
  );
}

function Toggle({ value, onChange, label, hint }: {
  value: boolean; onChange: (v: boolean) => void; label: string; hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-xs font-medium text-white/70">{label}</p>
        {hint && <p className="text-[11px] text-white/35">{hint}</p>}
      </div>
      <button onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full
          transition-colors ${value ? "bg-indigo-600" : "bg-white/[0.12]"}`}>
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow
          transition-transform ${value ? "translate-x-4" : "translate-x-1"}`} />
      </button>
    </div>
  );
}

function Seg<T extends string>({ value, opts, onChange, sm }: {
  value: T; opts: { label: string; v: T }[];
  onChange: (v: T) => void; sm?: boolean;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {opts.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)}
          className={`flex-1 rounded-lg border py-2 transition-all
            ${sm ? "text-xs" : "text-sm"}
            ${value === o.v
              ? "border-indigo-500/50 bg-indigo-600/20 text-indigo-300 font-medium"
              : "border-white/[0.1] bg-white/[0.03] text-white/45 hover:text-white hover:border-white/20"
            }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Sel({ value, opts, onChange }: {
  value: string; opts: { label: string; value: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2
        text-sm text-white/80 focus:border-indigo-500/50 focus:outline-none cursor-pointer">
      {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Live React Preview — fully driven by design state, zero iframe collapse
// ─────────────────────────────────────────────────────────────────────────────

type PM = { id: string; role: "user"|"assistant"; content: string };

function WidgetPreview({ d }: { d: WidgetDesign }) {
  const [msgs, setMsgs] = useState<PM[]>([
    { id:"w",  role:"assistant", content: d.welcomeMessage },
    { id:"u1", role:"user",      content: "How does this work?" },
    { id:"a1", role:"assistant", content: "I answer questions about your documents instantly! Try asking me anything — I'll show you how it looks." },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const bot = useRef<HTMLDivElement>(null);

  // Keep welcome in sync with design edits
  useEffect(() => {
    setMsgs(p => p.map(m => m.id === "w" ? { ...m, content: d.welcomeMessage } : m));
  }, [d.welcomeMessage]);

  useEffect(() => { bot.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs]);

  const dark       = d.widgetTheme === "dark";
  const primary    = d.primaryColour  || "#6366f1";
  const accent     = d.accentColour   || "#818cf8";
  const hdrBg      = d.headerBg       || primary;
  const chatBg     = d.chatAreaBg     || (dark ? "#0f0f1a" : "#f8f9fd");
  const userBg     = d.userBubbleBg   || primary;
  const botBg      = d.botBubbleBg    || (dark ? "#2a2a40" : "#f0f0f8");
  const botTxt     = d.botBubbleText  || (dark ? "#e2e2f0" : "#1f2937");
  const inputBg    = d.inputBg        || (dark ? "#1a1a2e" : "#ffffff");
  const inputBrd   = d.inputBorder    || `1px solid ${dark ? "rgba(255,255,255,.1)" : "#e5e7eb"}`;
  const inputTxt   = d.inputTextColor || (dark ? "#e2e2f0" : "#1f2937");
  const inputPh    = d.inputPlaceholderColor || (dark ? "#555575" : "#9ca3af");
  const iaBg       = d.inputAreaBg    || (dark ? "#0f0f1a" : "#ffffff");
  const iaB        = d.inputAreaBorder|| `1px solid ${dark ? "rgba(255,255,255,.08)" : "#e5e7eb"}`;
  const sendBg     = d.sendBtnBg      || primary;
  const dotClr     = d.typingDotColor || "#9ca3af";
  const footTxt    = d.footerTextColor|| (dark ? "#3a3a5a" : "#d1d5db");
  const avBr       = d.avatarShape==="square"?"4px":d.avatarShape==="rounded"?"8px":"50%";

  const css = `
    .cwm::-webkit-scrollbar{width:${d.scrollbarWidth}px}
    .cwm::-webkit-scrollbar-track{background:${d.scrollbarTrackColor||"transparent"}}
    .cwm::-webkit-scrollbar-thumb{background:${d.scrollbarColor||"#c7d2fe"};border-radius:99px}
    .cwmsg{animation:${
      d.messageAnimationStyle==="slide"?"cwSl .22s ease":
      d.messageAnimationStyle==="pop"  ?"cwPo .18s cubic-bezier(.34,1.56,.64,1)":
      d.messageAnimationStyle==="none" ?"none":"cwFd .18s ease"
    } both}
    @keyframes cwFd{from{opacity:0;transform:translateY(6px)}}
    @keyframes cwSl{from{opacity:0;transform:translateX(20px)}}
    @keyframes cwPo{from{opacity:0;transform:scale(.88)}}
    @keyframes cwBo{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-4px)}}
    .cwta::placeholder{color:${inputPh}}
    ${d.customThemeCss||""}
    ${d.customCss||""}
  `;

  function send() {
    const t = input.trim(); if (!t) return;
    const uid = `u${Date.now()}`, aid = `a${Date.now()}`;
    setMsgs(p => [...p, { id:uid, role:"user", content:t }]);
    setInput(""); setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMsgs(p => [...p, {
        id:aid, role:"assistant",
        content:`Preview reply to: "${t}". All design changes are reflected here live — no save needed.`,
      }]);
    }, 1100);
  }

  const panelH = Math.min(d.widgetChatHeight, 560);

  return (
    <div style={{
      fontFamily:d.widgetFontFamily, height:panelH, display:"flex", flexDirection:"column",
      borderRadius:d.widgetBorderRadius, overflow:"hidden", border:"1px solid rgba(255,255,255,.1)",
      boxShadow:"0 20px 60px rgba(0,0,0,.4)",
    }}>
      <style>{css}</style>

      {/* Header */}
      <div className="clara-header" style={{
        display:"flex", alignItems:"center", gap:12, padding:"0 16px",
        height:d.headerHeight, background:hdrBg, color:d.headerTextColor||"#fff",
        flexShrink:0, backdropFilter:d.headerBlur?"blur(12px)":undefined,
      }}>
        {d.avatarUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={d.avatarUrl} alt="" className="clara-avatar"
              style={{width:32,height:32,borderRadius:avBr,objectFit:"cover"}}/>
          : <div className="clara-avatar" style={{
              width:32,height:32,borderRadius:avBr,background:accent,
              color:d.headerTextColor||"#fff",display:"flex",alignItems:"center",
              justifyContent:"center",fontWeight:700,fontSize:14,flexShrink:0,
            }}>{d.assistantName.charAt(0).toUpperCase()}</div>
        }
        <div style={{flex:1,minWidth:0}}>
          <div className="clara-header-name" style={{fontWeight:600,fontSize:14,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
            {d.assistantName}
          </div>
          {d.showStatusDot && (
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{width:7,height:7,borderRadius:"50%",background:d.statusDotColor,display:"inline-block"}}/>
              <span style={{fontSize:11,opacity:.75}}>Online</span>
            </div>
          )}
        </div>
        {d.customHeaderHtml && (
          <div dangerouslySetInnerHTML={{__html:d.customHeaderHtml}} style={{display:"flex",alignItems:"center"}}/>
        )}
      </div>

      {/* Messages */}
      <div className="cwm clara-messages" style={{
        flex:1,overflowY:"auto",padding:12,display:"flex",
        flexDirection:"column",gap:d.messageGap,background:chatBg,
      }}>
        {msgs.map(m => (
          <div key={m.id} className="cwmsg" style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
            <div className={m.role==="user"?"clara-msg-user":"clara-msg-bot"} style={{
              maxWidth:`${d.messageMaxWidth}%`,
              borderRadius:m.role==="user"?d.userBubbleRadius:d.botBubbleRadius,
              padding:m.role==="user"?d.userBubblePadding:d.botBubblePadding,
              fontSize:d.messageFontSize,lineHeight:d.messageLineHeight,
              background:m.role==="user"?userBg:botBg,
              color:m.role==="user"?d.userBubbleText:botTxt,
              border:m.role==="user"?"none":(d.botBubbleBorder||`1px solid ${dark?"rgba(255,255,255,.07)":"#e5e7eb"}`),
              boxShadow:m.role==="user"?d.userBubbleShadow:d.botBubbleShadow,
              wordBreak:"break-word",
            }}>
              {m.content}
              {d.showTimestamps && (
                <div style={{fontSize:d.timestampFontSize,color:d.timestampColor,opacity:.65,marginTop:4}}>
                  just now
                </div>
              )}
            </div>
          </div>
        ))}
        {typing && (
          <div className="clara-typing" style={{display:"flex",alignItems:"center",gap:4,
            background:botBg,border:`1px solid ${dark?"rgba(255,255,255,.07)":"#e5e7eb"}`,
            borderRadius:18,padding:"8px 12px",alignSelf:"flex-start"}}>
            {[0,150,300].map(dl => (
              <span key={dl} className="clara-typing-dot" style={{
                width:d.typingDotSize,height:d.typingDotSize,background:dotClr,borderRadius:"50%",
                display:"inline-block",animation:`cwBo 1.2s ${dl}ms infinite`,
              }}/>
            ))}
          </div>
        )}
        <div ref={bot}/>
      </div>

      {/* Input */}
      <div className="clara-input-area" style={{background:iaBg,borderTop:iaB,padding:10,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"flex-end",gap:8}}>
          <textarea value={input} rows={1} className="cwta clara-textarea"
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
            placeholder={`Ask ${d.assistantName}…`}
            style={{
              flex:1,resize:"none",borderRadius:d.inputRadius,border:inputBrd,
              padding:d.inputPadding,fontSize:13,fontFamily:"inherit",
              outline:"none",lineHeight:1.5,maxHeight:80,overflowY:"auto",
              background:inputBg,color:inputTxt,
            }}/>
          <button onClick={send} disabled={!input.trim()} className="clara-send-btn" style={{
            width:d.sendBtnSize,height:d.sendBtnSize,borderRadius:d.sendBtnRadius,
            background:input.trim()?sendBg:(dark?"#2a2a40":"#e5e7eb"),
            color:input.trim()?d.sendBtnTextColor:(dark?"#555":"#aaa"),
            border:"none",cursor:input.trim()?"pointer":"not-allowed",
            display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
            transition:"background .2s",
          }}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
        {d.widgetShowBranding && (
          <div className="clara-branding" style={{textAlign:"center",marginTop:6,fontSize:10,
            color:footTxt,background:d.footerBg||"transparent"}}>
            {d.customFooterHtml
              ? <span dangerouslySetInnerHTML={{__html:d.customFooterHtml}}/>
              : (d.customPoweredBy||"Powered by Clara AI")
            }
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Floating sandbox (real clara.js runtime in isolated iframe)
// ─────────────────────────────────────────────────────────────────────────────

function buildSandbox(origin: string, d: WidgetDesign): string {
  const cfg = JSON.stringify({
    ...d, kbId:"preview-kb", kbName:"Admin preview",
    defaultLanguage:"en", voiceEnabled:false, widgetMode:"floating",
  }).replace(/</g,"\\u003c").replace(/>/g,"\\u003e")
    .replace(/&/g,"\\u0026");
  return `<!doctype html><html><head><meta charset="utf-8"/>
<style>
html,body{margin:0;min-height:100%;font-family:Inter,system-ui,sans-serif;
background:radial-gradient(circle at top,rgba(99,102,241,.14),transparent 40%),#0b1020;color:#cbd5e1}
body{overflow:hidden}.sh{min-height:100vh;padding:28px 24px 110px;box-sizing:border-box}
.card{max-width:440px;border:1px solid rgba(255,255,255,.08);border-radius:20px;
padding:18px;background:rgba(15,23,42,.6);backdrop-filter:blur(14px)}
.ey{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.5)}
h1{margin:10px 0 6px;font-size:22px;color:#fff}p{margin:0;font-size:13px;line-height:1.7;color:rgba(255,255,255,.65)}
</style></head><body>
<div class="sh"><div class="card">
<div class="ey">Floating sandbox · real clara.js runtime</div>
<h1>Click the launcher bubble ↘</h1>
<p>This is the real embed widget running on an isolated page. Every design change is synced live.</p>
</div></div>
<script>
window.__CLARA_PREVIEW_CONFIG=${cfg};
const _f=window.fetch.bind(window);
window.fetch=function(input,init){
const url=typeof input==="string"?input:input.url;
if(url.includes("/api/embed/config"))return Promise.resolve(new Response(JSON.stringify(window.__CLARA_PREVIEW_CONFIG),{status:200,headers:{"Content-Type":"application/json"}}));
if(url.includes("/api/embed/chat")){
const b=JSON.parse((init&&init.body)||"{}");
const msgs=Array.isArray(b.messages)?b.messages:[];
const last=msgs.filter(m=>m&&m.role==="user").slice(-1)[0];
const q=last&&typeof last.content==="string"?last.content.trim():"your question";
const ans="This is the real clara.js widget. Echoing: "+q+". All design edits are live!";
const chunks=ans.match(/.{1,26}(\\s|$)/g)||[ans];
const stream=new ReadableStream({start(c){let i=0;function p(){if(i>=chunks.length){c.close();return;}
c.enqueue(new TextEncoder().encode(JSON.stringify({type:"token",payload:chunks[i]})+"\\n"));
i++;setTimeout(p,35);}p();}});
return Promise.resolve(new Response(stream,{status:200,headers:{"Content-Type":"application/x-ndjson"}}));}
return _f(input,init);};
window.addEventListener("message",function(ev){
if(ev.origin!==window.location.origin)return;
if(!ev.data||ev.data.type!=="clara-design-sync")return;
window.__CLARA_PREVIEW_CONFIG={...window.__CLARA_PREVIEW_CONFIG,...ev.data.payload,widgetMode:"floating"};
if(window.ClaraWidget&&typeof window.ClaraWidget.refreshDesign==="function")window.ClaraWidget.refreshDesign();
});
</script>
<script src="${origin}/embed/clara.js" data-key="preview-key" data-mode="floating"></script>
</body></html>`;
}

function FloatingSandbox({ d }: { d: WidgetDesign }) {
  const ref    = useRef<HTMLIFrameElement>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const initD  = useRef(d);
  const src    = useMemo(() => (origin ? buildSandbox(origin, initD.current) : ""), [origin]);

  const post = useCallback(() => {
    if (!ref.current?.contentWindow || !origin) return;
    ref.current.contentWindow.postMessage({ type:"clara-design-sync", payload:d }, origin);
  }, [d, origin]);

  useEffect(() => { post(); }, [post]);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a1120]">
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
        <div>
          <p className="text-sm font-semibold text-white">Floating sandbox</p>
          <p className="text-xs text-white/35">Real clara.js runtime — click the bubble ↘</p>
        </div>
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70"/>
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300/70"/>
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70"/>
        </div>
      </div>
      <iframe ref={ref} title="Sandbox" srcDoc={src} onLoad={post}
        className="w-full bg-[#09101f]" style={{height:400}}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Visual Controls Panel — all granular controls with non-technical hints
// ─────────────────────────────────────────────────────────────────────────────

function Controls({ d, set }: {
  d: WidgetDesign;
  set: <K extends keyof WidgetDesign>(k: K, v: WidgetDesign[K]) => void;
}) {
  return (
    <div className="space-y-1">

      <Sec icon={Palette} label="Brand Colours" />
      <Field label="Primary colour" hint="Used for the header background, user message bubbles, and send button. Pick your main brand colour." example="#6366f1 — or any HEX colour">
        <ColourPicker value={d.primaryColour} onChange={v=>set("primaryColour",v)}/>
      </Field>
      <Field label="Accent colour" hint="Used for avatar backgrounds, hover states, and subtle highlights. Usually a lighter shade of your primary." example="#818cf8">
        <ColourPicker value={d.accentColour} onChange={v=>set("accentColour",v)}/>
      </Field>
      <Field label="Launcher button colour" hint="The floating chat button colour. Leave as-is to use your primary colour." example="#6366f1">
        <ColourPicker value={d.launcherColour} onChange={v=>set("launcherColour",v)}/>
      </Field>

      <Sec icon={Layout} label="Layout & Window" />
      <Field label="Light or Dark theme" hint="Dark mode gives the widget a night-friendly dark background. Light mode is the default for most websites.">
        <Seg value={d.widgetTheme} opts={[{label:"☀️ Light",v:"light"},{label:"🌙 Dark",v:"dark"}]} onChange={v=>set("widgetTheme",v)}/>
      </Field>
      <Field label="Widget position on screen" hint="Where the floating chat button appears on your visitors' screen.">
        <Seg value={d.widgetPosition} opts={[{label:"Bottom Right",v:"bottom-right"},{label:"Bottom Left",v:"bottom-left"}]} onChange={v=>set("widgetPosition",v)} sm/>
      </Field>
      <Field label="Chat window height" hint="How tall the chat panel opens. 300 is compact, 580 is the comfortable default, 900 is full-screen-like." example="580px">
        <Slider value={d.widgetChatHeight} min={300} max={900} step={10} unit="px" onChange={v=>set("widgetChatHeight",v)}/>
      </Field>
      <Field label="Corner rounding" hint="0 = sharp square corners, 20 = friendly rounded (default), 40 = very pill-shaped." example="20px">
        <Slider value={d.widgetBorderRadius} min={0} max={40} unit="px" onChange={v=>set("widgetBorderRadius",v)}/>
      </Field>
      <Field label="Chat area background" hint="The colour behind all the messages. Leave empty to use the theme default (white or dark)." example="#f8f9fd or linear-gradient(to bottom, #f0f4ff, #fff)">
        <ColourPicker value={d.chatAreaBg} onChange={v=>set("chatAreaBg",v)} placeholder="empty = theme default"/>
      </Field>

      <Sec icon={Type} label="Typography (Text Style)" />
      <Field label="Font family" hint="The text style for the whole widget. System UI looks native on any device. Inter is modern and clean.">
        <Sel value={d.widgetFontFamily} opts={FONTS} onChange={v=>set("widgetFontFamily",v)}/>
      </Field>
      <Field label="Message text size" hint="How large the chat bubble text appears. 13px is comfortable for most screens." example="13px">
        <Slider value={d.messageFontSize} min={10} max={22} unit="px" onChange={v=>set("messageFontSize",v)}/>
      </Field>
      <Field label="Line spacing" hint="Space between lines of text inside a bubble. 1.5 is the comfortable standard." example="1.5">
        <Slider value={d.messageLineHeight} min={1} max={2.5} step={0.05} unit="×" onChange={v=>set("messageLineHeight",v)}/>
      </Field>

      <Sec icon={Sparkles} label="Identity" />
      <Field label="Assistant display name" hint="The name shown in the chat header. Use your brand name or your AI assistant's name." example="Aria, Luna, HelpBot">
        <TextBox value={d.assistantName} onChange={v=>set("assistantName",v)} placeholder="e.g. Clara, Aria, Support Bot"/>
      </Field>
      <Field label="First message (greeting)" hint="The first message visitors see when they open the chat. Make it friendly and tell them what they can ask." example="Hi! I'm here to help. What would you like to know?">
        <textarea value={d.welcomeMessage} rows={2}
          onChange={e=>set("welcomeMessage",e.target.value)}
          placeholder="Hi! How can I help you today?"
          className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm
            text-white/80 placeholder-white/20 focus:border-indigo-500/50 focus:outline-none resize-none"/>
      </Field>
      <Field label="Avatar image URL" hint="A link to your assistant's profile picture. Leave empty to show the first letter of the name instead." example="https://yoursite.com/bot-avatar.png">
        <TextBox value={d.avatarUrl} onChange={v=>set("avatarUrl",v)} placeholder="https://example.com/avatar.png (leave empty for initials)" mono/>
      </Field>
      <Field label="Avatar shape" hint="The shape of the assistant's profile picture in the header.">
        <Seg value={d.avatarShape} opts={[{label:"⬤ Circle",v:"circle"},{label:"▢ Rounded",v:"rounded"},{label:"■ Square",v:"square"}]} onChange={v=>set("avatarShape",v)} sm/>
      </Field>

      <Sec icon={Layout} label="Header Bar" />
      <Field label="Header background" hint="The top bar background. Leave empty to use your primary colour. You can also use a gradient!" example="linear-gradient(135deg, #6366f1, #8b5cf6)">
        <ColourPicker value={d.headerBg} onChange={v=>set("headerBg",v)} placeholder="empty = primary colour"/>
      </Field>
      <Field label="Header text colour" hint="The colour of the assistant name and status text in the header." example="#ffffff (white is best on coloured backgrounds)">
        <ColourPicker value={d.headerTextColor} onChange={v=>set("headerTextColor",v)}/>
      </Field>
      <Field label="Header height" hint="How tall the header bar is. 60px is the default comfortable height." example="60px">
        <Slider value={d.headerHeight} min={44} max={100} unit="px" onChange={v=>set("headerHeight",v)}/>
      </Field>
      <Toggle value={d.headerBlur} onChange={v=>set("headerBlur",v)}
        label="Frosted glass (blur) effect"
        hint="Gives the header a modern blurred glass look. Works best with semi-transparent backgrounds."/>
      <Toggle value={d.showStatusDot} onChange={v=>set("showStatusDot",v)}
        label="Show 'Online' status dot"
        hint="Displays a green dot next to the assistant's name to show it's active and ready."/>
      {d.showStatusDot && (
        <Field label="Status dot colour" hint="The colour of the online indicator dot." example="#4ade80 (green)">
          <ColourPicker value={d.statusDotColor} onChange={v=>set("statusDotColor",v)}/>
        </Field>
      )}
      <Field label="Custom header HTML" hint="Advanced: add extra content inside the header bar — like an icon, badge, or close button. Leave empty if unsure." example='<span style="font-size:11px;opacity:.8">Beta</span>'>
        <textarea value={d.customHeaderHtml} rows={2}
          onChange={e=>set("customHeaderHtml",e.target.value)}
          placeholder='Leave empty, or try: <span style="font-size:11px;background:#fff2;padding:2px 8px;border-radius:999px">Beta</span>'
          className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2
            text-xs font-mono text-white/80 placeholder-white/20 focus:border-indigo-500/50 focus:outline-none resize-none"/>
      </Field>

      <Sec icon={MessageSquare} label="User Message Bubble" />
      <Field label="Background colour" hint="The colour of your visitor's message bubbles. Leave empty to use your primary colour." example="#6366f1">
        <ColourPicker value={d.userBubbleBg} onChange={v=>set("userBubbleBg",v)} placeholder="empty = primary colour"/>
      </Field>
      <Field label="Text colour" hint="The colour of text inside user message bubbles. White works best on coloured backgrounds." example="#ffffff">
        <ColourPicker value={d.userBubbleText} onChange={v=>set("userBubbleText",v)}/>
      </Field>
      <Field label="Corner rounding" hint="Controls the shape of each corner. The default creates a speech-bubble effect with one pointed corner." example="18px 18px 4px 18px — the small 4px is the 'tail'">
        <TextBox value={d.userBubbleRadius} onChange={v=>set("userBubbleRadius",v)} placeholder="18px 18px 4px 18px" mono/>
      </Field>
      <Field label="Inner padding" hint="Space inside the bubble between the text and the bubble edges." example="10px 14px (top/bottom · left/right)">
        <TextBox value={d.userBubblePadding} onChange={v=>set("userBubblePadding",v)} placeholder="10px 14px" mono/>
      </Field>
      <Field label="Drop shadow" hint="A subtle shadow under the bubble to make it feel elevated." example="0 2px 8px rgba(0,0,0,0.2)">
        <TextBox value={d.userBubbleShadow} onChange={v=>set("userBubbleShadow",v)} placeholder="0 1px 4px rgba(0,0,0,0.15)" mono/>
      </Field>

      <Sec icon={MessageSquare} label="Bot / AI Reply Bubble" />
      <Field label="Background colour" hint="The colour of the assistant's reply bubbles. Leave empty for the theme default (light grey or dark)." example="#f0f0f8 (light) or #2a2a40 (dark)">
        <ColourPicker value={d.botBubbleBg} onChange={v=>set("botBubbleBg",v)} placeholder="empty = theme default"/>
      </Field>
      <Field label="Text colour" hint="The colour of the assistant's reply text. Leave empty for the theme default." example="#1f2937 (dark text on light background)">
        <ColourPicker value={d.botBubbleText} onChange={v=>set("botBubbleText",v)} placeholder="empty = theme default"/>
      </Field>
      <Field label="Border" hint="A thin line around the bot bubble. Leave empty for the default subtle border." example="1px solid #e5e7eb — or 'none' to remove it">
        <TextBox value={d.botBubbleBorder} onChange={v=>set("botBubbleBorder",v)} placeholder="1px solid #e5e7eb (or leave empty)" mono/>
      </Field>
      <Field label="Corner rounding" hint="Shape of the bot bubble corners. 4px on the bottom-left creates the speech tail effect." example="18px 18px 18px 4px">
        <TextBox value={d.botBubbleRadius} onChange={v=>set("botBubbleRadius",v)} placeholder="18px 18px 18px 4px" mono/>
      </Field>
      <Field label="Inner padding" example="10px 14px">
        <TextBox value={d.botBubblePadding} onChange={v=>set("botBubblePadding",v)} placeholder="10px 14px" mono/>
      </Field>
      <Field label="Drop shadow" example="0 1px 3px rgba(0,0,0,0.08)">
        <TextBox value={d.botBubbleShadow} onChange={v=>set("botBubbleShadow",v)} placeholder="0 1px 3px rgba(0,0,0,0.08)" mono/>
      </Field>

      <Sec icon={Sliders} label="Message List" />
      <Field label="Space between messages" hint="How much breathing room there is between each message bubble. More gap = more open, airy feel." example="12px">
        <Slider value={d.messageGap} min={4} max={40} unit="px" onChange={v=>set("messageGap",v)}/>
      </Field>
      <Field label="Maximum bubble width" hint="How wide a single message bubble can grow. 85% means it uses most of the chat width." example="85%">
        <Slider value={d.messageMaxWidth} min={50} max={100} unit="%" onChange={v=>set("messageMaxWidth",v)}/>
      </Field>
      <Toggle value={d.showTimestamps} onChange={v=>set("showTimestamps",v)}
        label="Show message timestamps"
        hint="Displays 'just now', '2 min ago', etc. below each message."/>
      {d.showTimestamps && <>
        <Field label="Timestamp text colour" example="#9ca3af (grey)">
          <ColourPicker value={d.timestampColor} onChange={v=>set("timestampColor",v)}/>
        </Field>
        <Field label="Timestamp font size" example="10px">
          <Slider value={d.timestampFontSize} min={8} max={14} unit="px" onChange={v=>set("timestampFontSize",v)}/>
        </Field>
      </>}
      <Field label="Message appear animation" hint="How new messages animate in. Fade is subtle. Slide comes from the side. Pop is bouncy. None = instant.">
        <Seg value={d.messageAnimationStyle}
          opts={[{label:"Fade",v:"fade"},{label:"Slide",v:"slide"},{label:"Pop",v:"pop"},{label:"None",v:"none"}]}
          onChange={v=>set("messageAnimationStyle",v)} sm/>
      </Field>

      <Sec icon={MessageSquare} label="Typing Indicator (…)" />
      <Field label="Dot colour" hint="The colour of the three animated dots that appear while the AI is thinking." example="#9ca3af (grey)">
        <ColourPicker value={d.typingDotColor} onChange={v=>set("typingDotColor",v)}/>
      </Field>
      <Field label="Dot size" hint="How big each bouncing dot is." example="6px">
        <Slider value={d.typingDotSize} min={3} max={12} unit="px" onChange={v=>set("typingDotSize",v)}/>
      </Field>

      <Sec icon={Send} label="Text Input Area" />
      <Field label="Input area background" hint="The strip at the bottom that contains the text box and send button. Leave empty for the theme default." example="#ffffff (light) or #0f0f1a (dark)">
        <ColourPicker value={d.inputAreaBg} onChange={v=>set("inputAreaBg",v)} placeholder="empty = theme default"/>
      </Field>
      <Field label="Top divider line" hint="The line separating the input area from the messages. Leave empty for the theme default." example="1px solid #e5e7eb">
        <TextBox value={d.inputAreaBorder} onChange={v=>set("inputAreaBorder",v)} placeholder="1px solid #e5e7eb (or leave empty)" mono/>
      </Field>
      <Field label="Text box background" hint="The background colour of the text input field. Leave empty for the theme default." example="#ffffff">
        <ColourPicker value={d.inputBg} onChange={v=>set("inputBg",v)} placeholder="empty = theme default"/>
      </Field>
      <Field label="Text box border" hint="The border around the text input. Leave empty for the default subtle border." example="1px solid #e5e7eb">
        <TextBox value={d.inputBorder} onChange={v=>set("inputBorder",v)} placeholder="1px solid #e5e7eb (or leave empty)" mono/>
      </Field>
      <Field label="Focused border colour" hint="The border colour when the user clicks on the text box. Leave empty to use your primary colour." example="#6366f1">
        <ColourPicker value={d.inputBorderFocus} onChange={v=>set("inputBorderFocus",v)} placeholder="empty = primary colour"/>
      </Field>
      <Field label="Text box corner rounding" example="12px">
        <Slider value={d.inputRadius} min={0} max={40} unit="px" onChange={v=>set("inputRadius",v)}/>
      </Field>
      <Field label="Text colour" hint="Colour of what the user types. Leave empty for the theme default." example="#1f2937">
        <ColourPicker value={d.inputTextColor} onChange={v=>set("inputTextColor",v)} placeholder="empty = theme default"/>
      </Field>
      <Field label="Placeholder text colour" hint="The greyed-out hint text before the user starts typing." example="#9ca3af (grey)">
        <ColourPicker value={d.inputPlaceholderColor} onChange={v=>set("inputPlaceholderColor",v)} placeholder="empty = theme default"/>
      </Field>
      <Field label="Inner padding" hint="Space inside the text box." example="8px 12px">
        <TextBox value={d.inputPadding} onChange={v=>set("inputPadding",v)} placeholder="8px 12px" mono/>
      </Field>

      <Sec icon={Send} label="Send Button" />
      <Field label="Button background colour" hint="The colour of the send button. Leave empty to use your primary colour." example="#6366f1">
        <ColourPicker value={d.sendBtnBg} onChange={v=>set("sendBtnBg",v)} placeholder="empty = primary colour"/>
      </Field>
      <Field label="Hover colour" hint="The colour when the user hovers over the send button. Leave empty for a slight darkening." example="#4f46e5 (slightly darker)">
        <ColourPicker value={d.sendBtnHoverBg} onChange={v=>set("sendBtnHoverBg",v)} placeholder="empty = auto"/>
      </Field>
      <Field label="Arrow icon colour" example="#ffffff (white)">
        <ColourPicker value={d.sendBtnTextColor} onChange={v=>set("sendBtnTextColor",v)}/>
      </Field>
      <Field label="Button corner rounding" hint="Set to 50 or more for a perfectly circular button." example="10px (pill-ish) or 50px (circle)">
        <Slider value={d.sendBtnRadius} min={0} max={50} unit="px" onChange={v=>set("sendBtnRadius",v)}/>
      </Field>
      <Field label="Button size" hint="Width and height of the send button." example="36px">
        <Slider value={d.sendBtnSize} min={24} max={64} unit="px" onChange={v=>set("sendBtnSize",v)}/>
      </Field>

      <Sec icon={Sliders} label="Scrollbar" />
      <Field label="Width" hint="0 = hidden scrollbar (modern invisible style), 4 = slim, 8 = classic." example="4px">
        <Slider value={d.scrollbarWidth} min={0} max={16} unit="px" onChange={v=>set("scrollbarWidth",v)}/>
      </Field>
      <Field label="Thumb colour" hint="The colour of the draggable part of the scrollbar." example="#c7d2fe (light indigo)">
        <ColourPicker value={d.scrollbarColor} onChange={v=>set("scrollbarColor",v)}/>
      </Field>
      <Field label="Track colour" hint="The background behind the scrollbar thumb. Usually transparent." example="transparent or #f1f5f9">
        <ColourPicker value={d.scrollbarTrackColor} onChange={v=>set("scrollbarTrackColor",v)} placeholder="transparent"/>
      </Field>

      <Sec icon={Type} label="Branding Footer" />
      <Toggle value={d.widgetShowBranding} onChange={v=>set("widgetShowBranding",v)}
        label='Show "Powered by" footer'
        hint="Toggle the small branding line at the bottom of the chat."/>
      {d.widgetShowBranding && <>
        <Field label="Branding text" hint="Replace the default 'Powered by Clara AI' with your own text or leave as-is." example="Powered by Acme AI">
          <TextBox value={d.customPoweredBy} onChange={v=>set("customPoweredBy",v)} placeholder="Powered by Clara AI"/>
        </Field>
        <Field label="Footer background" hint="Background behind the branding text. Leave empty for transparent." example="transparent">
          <ColourPicker value={d.footerBg} onChange={v=>set("footerBg",v)} placeholder="transparent"/>
        </Field>
        <Field label="Footer text colour" hint="Colour of the branding text. Leave empty for the theme default." example="#d1d5db">
          <ColourPicker value={d.footerTextColor} onChange={v=>set("footerTextColor",v)} placeholder="empty = theme default"/>
        </Field>
        <Field label="Custom footer HTML" hint="Replace the branding text with fully custom HTML — add logos, links, or disclaimers. Leave empty to use the text above." example='<a href="https://yoursite.com">Your Site</a>'>
          <textarea value={d.customFooterHtml} rows={2}
            onChange={e=>set("customFooterHtml",e.target.value)}
            placeholder='Leave empty, or try: <a href="https://yoursite.com" style="color:inherit">Powered by YourBrand</a>'
            className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2
              text-xs font-mono text-white/80 placeholder-white/20 focus:border-indigo-500/50 focus:outline-none resize-none"/>
        </Field>
      </>}

      <Sec icon={Monitor} label="Widget Mode & Launcher" />
      <Field label="Widget render mode" hint="Floating = the default chat button on your site. Inline = embeds the full chat in a section of your page. Headless = for developers building a custom chat UI.">
        <Seg value={d.widgetMode}
          opts={[{label:"💬 Floating",v:"floating"},{label:"📄 Inline",v:"inline"},{label:"⚙️ Headless",v:"headless"}]}
          onChange={v=>set("widgetMode",v)} sm/>
      </Field>
      <Field label="Launcher button size" hint="How large the floating chat button is." example="56px">
        <Slider value={d.widgetButtonSize} min={40} max={80} unit="px" onChange={v=>set("widgetButtonSize",v)}/>
      </Field>
      <Field label="Launcher label text" hint="Optional text shown next to the floating button, like a call to action." example="Chat with us!">
        <TextBox value={d.widgetLauncherLabel} onChange={v=>set("widgetLauncherLabel",v)} placeholder="Chat with us! (leave empty to hide)"/>
      </Field>
      <Field label="Custom launcher icon (SVG)" hint="Paste an SVG icon to replace the default chat bubble icon on the floating button. Leave empty to keep the default." example="<svg viewBox='0 0 24 24'>...</svg>">
        <textarea value={d.customLauncherSvg} rows={3}
          onChange={e=>set("customLauncherSvg",e.target.value)}
          placeholder={"Leave empty for default chat icon.\nOr paste SVG: <svg viewBox=\"0 0 24 24\" ...>...</svg>"}
          className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2
            text-xs font-mono text-white/80 placeholder-white/20 focus:border-indigo-500/50 focus:outline-none resize-none"/>
      </Field>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Advanced Code Editor Panel — synced with design state
// ─────────────────────────────────────────────────────────────────────────────

function CodePanel({ d, set, kbId }: {
  d: WidgetDesign;
  set: <K extends keyof WidgetDesign>(k: K, v: WidgetDesign[K]) => void;
  kbId: string;
}) {
  // Regenerate synced CSS from design state whenever design changes
  const themeCssValue = useMemo(() => {
    // If user has typed custom content, use theirs; otherwise generate
    const generated = generateThemeCss(d);
    if (!d.customThemeCss || d.customThemeCss.startsWith("/* ═══")) return generated;
    return d.customThemeCss;
  }, [d]);

  const injectJsValue = useMemo(() => {
    if (!d.customInjectJs || d.customInjectJs.startsWith("/* ════")) return generateInjectJs(d);
    return d.customInjectJs;
  }, [d]);

  const customCssValue = useMemo(() => {
    if (!d.customCss || d.customCss.startsWith("/* ════")) return generateCustomCss(d);
    return d.customCss;
  }, [d]);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.06] px-4 py-3">
        <div className="flex items-start gap-3">
          <Code2 className="h-4 w-4 text-indigo-300 mt-0.5 shrink-0"/>
          <div className="text-xs text-white/65 leading-relaxed space-y-1">
            <p><strong className="text-white/90">Developer code editors.</strong> These are pre-filled with working code generated from your visual controls above.</p>
            <p>Edit any file — the preview updates live. Switch back to Visual Controls and all your colours/sizes stay in sync.</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="theme">
        <TabsList className="h-auto flex-wrap gap-1 rounded-xl bg-[#0b1020] p-1.5">
          {[
            {v:"theme",   label:"theme.css",    hint:"Full CSS control — auto-synced"},
            {v:"inject",  label:"inject.css",   hint:"Raw shadow-DOM injection"},
            {v:"header",  label:"header.html",  hint:"Header slot HTML"},
            {v:"footer",  label:"footer.html",  hint:"Footer / branding slot"},
            {v:"launcher",label:"launcher.svg", hint:"FAB icon SVG"},
            {v:"hooks",   label:"hooks.js",     hint:"Event behaviour hooks"},
          ].map(({v,label,hint}) => (
            <TabsTrigger key={v} value={v}
              className="flex flex-col items-start rounded-lg bg-transparent px-3 py-2
                data-[state=active]:bg-indigo-600/20 data-[state=active]:text-indigo-200
                data-[state=active]:shadow-[inset_0_0_0_1px_rgba(99,102,241,0.4)]
                text-white/40 hover:text-white transition-all text-left">
              <span className="text-xs font-semibold">{label}</span>
              <span className="text-[10px] opacity-60 hidden sm:block">{hint}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* theme.css — auto-generated + editable */}
        <TabsContent value="theme" className="mt-4 space-y-3">
          <div className="flex items-start gap-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15 px-3 py-2">
            <Check className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0"/>
            <p className="text-[11px] text-emerald-300/80 leading-snug">
              This CSS is <strong>auto-generated</strong> from your visual controls and stays in sync. Edit it freely — your changes will be saved when you click Save Design.
            </p>
          </div>
          <LiveCodeEditor
            title="Widget Theme CSS — targeting .clara-* classes"
            description="Full CSS control over every widget element. Targets real CSS classes on the widget. Auto-generated from your visual settings above — edit and customise freely."
            language="css"
            value={themeCssValue}
            onChange={v=>set("customThemeCss",v)}
            path={`inmemory://widget/${kbId}/theme.css`}
            height={520}
            minimap
          />
          {/* Quick class reference */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="text-[11px] font-semibold text-white/40 mb-2 uppercase tracking-wider">
              Available CSS class names you can target:
            </p>
            <div className="grid grid-cols-2 gap-1 text-[11px] font-mono">
              {[".clara-widget",".clara-header",".clara-header-name",".clara-avatar",
                ".clara-messages",".clara-msg-user",".clara-msg-bot",".clara-timestamp",
                ".clara-typing",".clara-typing-dot",".clara-input-area",".clara-textarea",
                ".clara-send-btn",".clara-send-icon",".clara-branding",".clara-sources",
              ].map(cls=>(
                <span key={cls} className="rounded bg-indigo-500/10 px-2 py-0.5 text-indigo-300/80">{cls}</span>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="inject" className="mt-4">
          <LiveCodeEditor
            title="Custom CSS Injection"
            description="Raw CSS injected into the widget after all default styles. Use for one-off overrides, animations, or @import font rules. The above theme.css is more powerful for full control."
            language="css"
            value={customCssValue}
            onChange={v=>set("customCss",v)}
            path={`inmemory://widget/${kbId}/inject.css`}
            height={420}
            minimap
          />
        </TabsContent>

        <TabsContent value="header" className="mt-4">
          <LiveCodeEditor
            title="Header HTML Slot"
            description="HTML rendered inside the widget header bar. Add status chips, close buttons, or icons. Your visual control value is shown here — edit to customise further."
            language="html"
            value={d.customHeaderHtml || '<!-- Header slot is empty. Add HTML below: -->\n<!-- Example: -->\n<!-- <span style="font-size:11px;background:rgba(255,255,255,.15);padding:2px 8px;border-radius:999px;margin-left:auto">Beta</span> -->'}
            onChange={v=>set("customHeaderHtml",v==="<!-- Header slot is empty. Add HTML below: -->\n<!-- Example: -->\n<!-- <span style=\"font-size:11px;background:rgba(255,255,255,.15);padding:2px 8px;border-radius:999px;margin-left:auto\">Beta</span> -->"?"":v)}
            path={`inmemory://widget/${kbId}/header.html`}
            height={280}
          />
        </TabsContent>

        <TabsContent value="footer" className="mt-4">
          <LiveCodeEditor
            title="Footer / Branding HTML Slot"
            description="Custom HTML for the branding footer area. Replaces the 'Powered by' text when provided. Add links, logos, or legal disclaimers."
            language="html"
            value={d.customFooterHtml || `<!-- Footer slot. Replace "Powered by Clara AI" with custom HTML -->\n<!-- Example: -->\n<!-- <a href="https://yoursite.com" style="color:inherit;text-decoration:none;font-size:10px">Powered by YourBrand</a> -->`}
            onChange={v=>set("customFooterHtml",v.startsWith("<!-- Footer slot")?"":v)}
            path={`inmemory://widget/${kbId}/footer.html`}
            height={240}
          />
        </TabsContent>

        <TabsContent value="launcher" className="mt-4">
          <LiveCodeEditor
            title="Floating Launcher Icon (SVG)"
            description="Replace the default chat bubble icon with any custom SVG. Paste raw <svg> markup. Leave empty to keep the default bubble icon."
            language="html"
            value={d.customLauncherSvg || `<!-- Launcher SVG icon slot -->\n<!-- Paste your SVG markup here to replace the default chat bubble icon -->\n<!-- Example — a heart icon: -->\n<!-- <svg viewBox="0 0 24 24" fill="currentColor">\n  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5\n       2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09\n       C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5\n       c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>\n</svg> -->`}
            onChange={v=>set("customLauncherSvg",v.startsWith("<!-- Launcher SVG")?"":v)}
            path={`inmemory://widget/${kbId}/launcher.svg`}
            height={300}
          />
        </TabsContent>

        <TabsContent value="hooks" className="mt-4 space-y-3">
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/5 border border-amber-500/15 px-3 py-2">
            <Wand2 className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0"/>
            <p className="text-[11px] text-amber-300/80 leading-snug">
              These JS hooks run on your visitors' page. Every available hook is pre-filled with a commented example — just uncomment what you need.
            </p>
          </div>
          <LiveCodeEditor
            title="Widget Behaviour Hooks (JavaScript)"
            description="Intercept widget events: onBeforeSend, onResponse, onToken, onOpen, onClose. Pre-filled with working commented examples. Uncomment any hook to activate it."
            language="typescript"
            value={injectJsValue}
            onChange={v=>set("customInjectJs",v)}
            path={`inmemory://widget/${kbId}/hooks.js`}
            height={480}
            minimap
          />
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
  const [error,   setError]   = useState<string|null>(null);
  const [tab,     setTab]     = useState<"visual"|"code"|"preview">("visual");
  const [sandbox, setSandbox] = useState(false);
  const [inlineOpen, setInlineOpen] = useState(false);

  // Load config from DB on mount
  useEffect(() => {
    if (!kbId) return;
    fetch(apiUrl(`/api/kbs/${kbId}/config`), { headers: withAuthHeaders({}) })
      .then(r => r.json())
      .then((data: Record<string,unknown>) => {
        if (!data.error) setDesign(fromApi(data));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [kbId]);

  // Setter — marks unsaved
  const set = useCallback(<K extends keyof WidgetDesign>(key: K, val: WidgetDesign[K]) => {
    setDesign(prev => ({ ...prev, [key]: val }));
    setSaved(false);
  }, []);

  // Save ALL fields to DB via PATCH
  const save = async () => {
    setSaving(true); setError(null); setSaved(false);
    try {
      const body: Record<string,unknown> = {
        primaryColour: design.primaryColour,    accentColour: design.accentColour,
        launcherColour: design.launcherColour,
        widgetTheme: design.widgetTheme,         widgetPosition: design.widgetPosition,
        widgetButtonSize: design.widgetButtonSize,
        widgetBorderRadius: design.widgetBorderRadius,
        widgetFontFamily: design.widgetFontFamily,
        widgetChatHeight: design.widgetChatHeight,
        widgetShowBranding: design.widgetShowBranding,
        widgetLauncherLabel: design.widgetLauncherLabel || null,
        widgetMode: design.widgetMode,
        assistantName: design.assistantName,     welcomeMessage: design.welcomeMessage,
        avatarUrl: design.avatarUrl || null,
        headerBg: design.headerBg || null,       headerTextColor: design.headerTextColor,
        headerHeight: design.headerHeight,       headerBlur: design.headerBlur,
        showStatusDot: design.showStatusDot,     statusDotColor: design.statusDotColor,
        avatarShape: design.avatarShape,
        chatAreaBg: design.chatAreaBg || null,
        userBubbleBg: design.userBubbleBg || null,
        userBubbleText: design.userBubbleText,
        userBubbleRadius: design.userBubbleRadius,
        userBubblePadding: design.userBubblePadding,
        userBubbleShadow: design.userBubbleShadow,
        botBubbleBg: design.botBubbleBg || null,
        botBubbleText: design.botBubbleText || null,
        botBubbleRadius: design.botBubbleRadius,
        botBubbleBorder: design.botBubbleBorder || null,
        botBubblePadding: design.botBubblePadding,
        botBubbleShadow: design.botBubbleShadow,
        messageGap: design.messageGap,           messageMaxWidth: design.messageMaxWidth,
        messageFontSize: design.messageFontSize, messageLineHeight: design.messageLineHeight,
        showTimestamps: design.showTimestamps,   timestampColor: design.timestampColor,
        timestampFontSize: design.timestampFontSize,
        typingDotColor: design.typingDotColor,   typingDotSize: design.typingDotSize,
        inputBg: design.inputBg || null,         inputBorder: design.inputBorder || null,
        inputBorderFocus: design.inputBorderFocus || null,
        inputRadius: design.inputRadius,
        inputTextColor: design.inputTextColor || null,
        inputPlaceholderColor: design.inputPlaceholderColor || null,
        inputPadding: design.inputPadding,
        inputAreaBg: design.inputAreaBg || null, inputAreaBorder: design.inputAreaBorder || null,
        sendBtnBg: design.sendBtnBg || null,     sendBtnHoverBg: design.sendBtnHoverBg || null,
        sendBtnTextColor: design.sendBtnTextColor,
        sendBtnRadius: design.sendBtnRadius,     sendBtnSize: design.sendBtnSize,
        scrollbarWidth: design.scrollbarWidth,   scrollbarColor: design.scrollbarColor,
        scrollbarTrackColor: design.scrollbarTrackColor,
        footerBg: design.footerBg || null,       footerTextColor: design.footerTextColor || null,
        customPoweredBy: design.customPoweredBy || null,
        animationsEnabled: design.animationsEnabled,
        messageAnimationStyle: design.messageAnimationStyle,
        customCss: design.customCss || null,
        customLauncherSvg: design.customLauncherSvg || null,
        customHeaderHtml: design.customHeaderHtml || null,
        customFooterHtml: design.customFooterHtml || null,
        customThemeCss: design.customThemeCss || null,
        customInjectJs: design.customInjectJs || null,
      };
      const res = await fetch(apiUrl(`/api/kbs/${kbId}/config`), {
        method: "PATCH",
        headers: withAuthHeaders({ "Content-Type":"application/json" }),
        body: JSON.stringify(body),
      });
      const data = await res.json() as Record<string,unknown>;
      if (!res.ok) throw new Error(String(data.error ?? "Failed to save"));
      setSaved(true);
      setTimeout(() => setSaved(false), 3500);
    } catch (e) {
      setError((e as Error).message);
    } finally { setSaving(false); }
  };

  const reset = () => {
    if (!confirm("Reset all design settings to factory defaults? Your current design will be lost.")) return;
    setDesign(D); setSaved(false);
  };

  if (loading) return (
    <div className="flex items-center gap-3 text-white/40 py-8">
      <RefreshCw className="w-4 h-4 animate-spin"/> Loading widget design…
    </div>
  );

  return (
    <div className="space-y-5">

      {/* Top bar */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-white">Widget Design</h2>
          <p className="mt-0.5 text-sm text-white/45">
            Customise every visual element — no coding needed. Changes are previewed live and saved to your database.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Button variant="ghost" size="sm" onClick={reset}
            className="text-white/30 hover:text-white text-xs">Reset defaults</Button>
          <Button size="sm" onClick={save} disabled={saving}
            className={`text-xs px-5 ${saved?"bg-emerald-600 hover:bg-emerald-500":"bg-indigo-600 hover:bg-indigo-500"} text-white`}>
            {saving ? (
              <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin"/>Saving…</>
            ) : saved ? (
              <><Check className="w-3.5 h-3.5 mr-1.5"/>Saved to database!</>
            ) : "Save design"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          ⚠️ {error}
        </p>
      )}

      {/* Main tab switcher */}
      <div className="flex items-center gap-1 rounded-xl bg-white/[0.03] p-1 border border-white/[0.07] w-fit flex-wrap">
        {([
          {id:"visual", label:"🎨 Visual Controls", desc:"For everyone"},
          {id:"code",   label:"</> Code Editor",    desc:"For developers"},
          {id:"preview",label:"👁 Preview",          desc:"Side-by-side"},
        ] as const).map(({id, label, desc}) => (
          <button key={id} onClick={() => setTab(id)}
            className={`rounded-lg px-4 py-2 text-xs font-medium transition-all flex flex-col items-center
              ${tab===id
                ? "bg-indigo-600/20 text-indigo-200 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.4)]"
                : "text-white/40 hover:text-white hover:bg-white/[0.04]"}`}>
            <span>{label}</span>
            <span className="text-[10px] opacity-60">{desc}</span>
          </button>
        ))}
      </div>

      {/* ── Visual Controls tab ── */}
      {tab === "visual" && (
        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] items-start">
          {/* Controls — scrollable */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5
            lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto">
            <Suspense fallback={<div className="h-10 animate-pulse rounded-xl bg-white/5"/>}>
              <Controls d={design} set={set}/>
            </Suspense>
          </div>
          {/* Preview — always full height, no collapse */}
          <div className="lg:sticky lg:top-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-white/30">Live Preview</p>
                <p className="text-xs text-white/35 mt-0.5">Updates instantly — no save needed to see changes.</p>
              </div>
              <button onClick={()=>setSandbox(s=>!s)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1]
                  bg-white/[0.03] px-3 py-1.5 text-xs text-white/45 hover:text-white hover:bg-white/[0.06]">
                <Monitor className="h-3.5 w-3.5"/>
                {sandbox ? "Hide sandbox" : "Real runtime sandbox"}
              </button>
            </div>
            <WidgetPreview d={design}/>
            {sandbox && <FloatingSandbox d={design}/>}
          </div>
        </div>
      )}

      {/* ── Code Editor tab ── */}
      {tab === "code" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
          <CodePanel d={design} set={set} kbId={kbId}/>
          <div className="lg:sticky lg:top-6 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/30">Live Preview</p>
            <WidgetPreview d={design}/>
          </div>
        </div>
      )}

      {/* ── Preview tab ── */}
      {tab === "preview" && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2 items-start">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/30">Design Preview</p>
              <p className="text-[11px] text-white/35">
                Rendered directly from your design settings. Fully interactive — send a test message!
              </p>
              <WidgetPreview d={design}/>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/30">Real Runtime Sandbox</p>
              <p className="text-[11px] text-white/35">
                The actual clara.js widget in an isolated page. Click the launcher button ↘
              </p>
              <FloatingSandbox d={design}/>
            </div>
          </div>

          {/* Inline embed preview (collapsible) */}
          <Collapsible open={inlineOpen} onOpenChange={setInlineOpen}>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02]">
              <div className="flex items-center justify-between gap-4 px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-white">Inline embed preview</p>
                  <p className="text-xs text-white/35 mt-0.5">
                    Load the real <code className="bg-white/10 rounded px-1">/embed/widget</code> page in preview mode.
                  </p>
                </div>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="outline" size="sm"
                    className="border-white/10 bg-white/[0.03] text-white/55 hover:text-white shrink-0">
                    <ChevronDown className={`mr-1.5 h-4 w-4 transition-transform ${inlineOpen?"rotate-180":""}`}/>
                    {inlineOpen ? "Collapse" : "Show inline embed"}
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <div className="border-t border-white/[0.06]">
                  <InlineEmbed d={design} kbId={kbId}/>
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
// Inline embed preview (real /embed/widget?preview=1 with postMessage sync)
// ─────────────────────────────────────────────────────────────────────────────

function InlineEmbed({ d, kbId }: { d: WidgetDesign; kbId: string }) {
  const ref    = useRef<HTMLIFrameElement>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const payload = useMemo(() => ({
    kbId, kbName:"Admin preview", assistantName:d.assistantName,
    avatarUrl:d.avatarUrl||null, welcomeMessage:d.welcomeMessage,
    primaryColour:d.primaryColour, accentColour:d.accentColour,
    defaultLanguage:"en", widgetTheme:d.widgetTheme,
    widgetBorderRadius:d.widgetBorderRadius, widgetFontFamily:d.widgetFontFamily,
    widgetShowBranding:d.widgetShowBranding,
    customCss:d.customCss||null, customThemeCss:d.customThemeCss||null,
    customPoweredBy:d.customPoweredBy||null,
    customHeaderHtml:d.customHeaderHtml||null, customFooterHtml:d.customFooterHtml||null,
    headerBg:d.headerBg||null, headerTextColor:d.headerTextColor,
    headerHeight:d.headerHeight, showStatusDot:d.showStatusDot,
    statusDotColor:d.statusDotColor, avatarShape:d.avatarShape,
    chatAreaBg:d.chatAreaBg||null,
    userBubbleBg:d.userBubbleBg||null, userBubbleText:d.userBubbleText,
    userBubbleRadius:d.userBubbleRadius,
    botBubbleBg:d.botBubbleBg||null, botBubbleText:d.botBubbleText||null,
    botBubbleBorder:d.botBubbleBorder||null,
    messageFontSize:d.messageFontSize, messageLineHeight:d.messageLineHeight,
    messageGap:d.messageGap, messageMaxWidth:d.messageMaxWidth,
    showTimestamps:d.showTimestamps, timestampColor:d.timestampColor,
    typingDotColor:d.typingDotColor, typingDotSize:d.typingDotSize,
    inputBg:d.inputBg||null, inputBorder:d.inputBorder||null,
    inputRadius:d.inputRadius, inputPadding:d.inputPadding,
    inputAreaBg:d.inputAreaBg||null, inputAreaBorder:d.inputAreaBorder||null,
    sendBtnBg:d.sendBtnBg||null, sendBtnTextColor:d.sendBtnTextColor,
    sendBtnRadius:d.sendBtnRadius, sendBtnSize:d.sendBtnSize,
    scrollbarWidth:d.scrollbarWidth, scrollbarColor:d.scrollbarColor,
    scrollbarTrackColor:d.scrollbarTrackColor,
    footerBg:d.footerBg||null, footerTextColor:d.footerTextColor||null,
    animationsEnabled:d.animationsEnabled,
    messageAnimationStyle:d.messageAnimationStyle,
  }), [d, kbId]);

  const post = useCallback(() => {
    if (!ref.current?.contentWindow || !origin) return;
    ref.current.contentWindow.postMessage(
      { type:"clara-admin-preview-config", payload }, origin);
  }, [origin, payload]);

  useEffect(() => { post(); }, [post]);

  return (
    <iframe ref={ref} title="Inline embed preview"
      src="/embed/widget?preview=1" onLoad={post}
      className="w-full" style={{height:520}}
      sandbox="allow-scripts allow-same-origin allow-forms"/>
  );
}
