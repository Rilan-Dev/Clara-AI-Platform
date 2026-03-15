/**
 * APPROACH 7 — Live Design Switcher (Design API demo)
 * src/components/clara/ClaraDesignSwitcher.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Interactive panel that demonstrates every design change approach live.
 * Calls PATCH /api/embed/design — requires design_edit_enabled on the key.
 *
 * Usage:  <ClaraDesignSwitcher />
 */
import { useState } from "react";
import { updateDesign, ClaraPresets } from "@/lib/clara/claraDesignAPI";
import type { DesignPatch } from "@/lib/clara/claraDesignAPI";

type Preset = {
  label: string;
  emoji: string;
  description: string;
  patch: DesignPatch;
};

const PRESETS: Preset[] = [
  {
    label: "AmazeTech Blue",
    emoji: "🔵",
    description: "Brand blue with rounded corners",
    patch: { primaryColour: "#1d4ed8", accentColour: "#3b82f6", widgetTheme: "light", widgetBorderRadius: 20 },
  },
  {
    label: "Dark Premium",
    emoji: "🌑",
    description: "Dark theme with purple accent",
    patch: { primaryColour: "#7c3aed", accentColour: "#a78bfa", widgetTheme: "dark", widgetBorderRadius: 16 },
  },
  {
    label: "Emerald Fresh",
    emoji: "🌿",
    description: "Clean green — light and airy",
    patch: { primaryColour: "#059669", accentColour: "#34d399", widgetTheme: "light", widgetBorderRadius: 24 },
  },
  {
    label: "Rose Gold",
    emoji: "🌸",
    description: "Soft pink with large radius",
    patch: { primaryColour: "#e11d48", accentColour: "#fb7185", widgetTheme: "light", widgetBorderRadius: 32 },
  },
  {
    label: "Midnight",
    emoji: "🌙",
    description: "Deep dark with blue tint",
    patch: { primaryColour: "#0f172a", accentColour: "#38bdf8", widgetTheme: "dark", widgetBorderRadius: 12 },
  },
  {
    label: "Warm Orange",
    emoji: "🔶",
    description: "Energetic orange palette",
    patch: { primaryColour: "#ea580c", accentColour: "#fb923c", widgetTheme: "light", widgetBorderRadius: 20 },
  },
];

const CSS_EXAMPLES: Array<{ label: string; css: string }> = [
  {
    label: "Gradient Header",
    css: "#hdr { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important; }",
  },
  {
    label: "Rounded Bubbles",
    css: ".mu { border-radius: 4px !important; } .ma { border-radius: 4px !important; }",
  },
  {
    label: "Glowing FAB",
    css: "#tbtn { box-shadow: 0 0 40px rgba(124,58,237,0.8) !important; animation: none; }",
  },
  {
    label: "Serif Font",
    css: "#panel { font-family: Georgia, serif !important; } #itxt { font-family: Georgia, serif !important; }",
  },
  {
    label: "Reset CSS",
    css: "",
  },
];

export function ClaraDesignSwitcher() {
  const [status, setStatus]       = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastApplied, setLastApplied] = useState<string>("");
  const [customCss, setCustomCss] = useState("");
  const [customPrimary, setCustomPrimary] = useState("#6366f1");
  const [customAccent, setCustomAccent]   = useState("#818cf8");

  const apply = async (patch: DesignPatch, label: string) => {
    setStatus("saving");
    try {
      await updateDesign(patch);
      setLastApplied(label); setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error"); setTimeout(() => setStatus("idle"), 3000);
    }
  };

  return (
    <div className="space-y-6 p-6 bg-white rounded-2xl border border-gray-100 shadow-sm max-w-2xl">
      <div>
        <h3 className="text-lg font-bold text-gray-900">Live Design Switcher</h3>
        <p className="text-sm text-gray-500 mt-1">
          Changes are applied live to the widget via <code className="bg-gray-100 px-1 rounded text-xs">PATCH /api/embed/design</code>.
          No page reload needed.
        </p>
      </div>

      {/* Status bar */}
      {status !== "idle" && (
        <div className={`text-sm rounded-xl px-4 py-2.5 ${status === "saving" ? "bg-indigo-50 text-indigo-700" : status === "saved" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {status === "saving" && "⏳ Applying design…"}
          {status === "saved"  && `✅ Applied: ${lastApplied}`}
          {status === "error"  && "❌ Failed — check that design_edit_enabled is ON for this key"}
        </div>
      )}

      {/* Colour presets */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Theme Presets</p>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map(p => (
            <button key={p.label} disabled={status === "saving"}
              onClick={() => apply(p.patch, p.label)}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-200 p-3 hover:border-indigo-300 hover:bg-indigo-50 transition-all disabled:opacity-50 text-center">
              <span className="text-2xl">{p.emoji}</span>
              <span className="text-xs font-semibold text-gray-700">{p.label}</span>
              <span className="text-[10px] text-gray-400">{p.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Custom colour picker */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Custom Colours</p>
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Primary</label>
            <input type="color" value={customPrimary} onChange={e => setCustomPrimary(e.target.value)}
              className="h-10 w-16 rounded-lg border border-gray-200 cursor-pointer p-0.5" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Accent</label>
            <input type="color" value={customAccent} onChange={e => setCustomAccent(e.target.value)}
              className="h-10 w-16 rounded-lg border border-gray-200 cursor-pointer p-0.5" />
          </div>
          <button onClick={() => apply({ primaryColour: customPrimary, accentColour: customAccent }, "Custom Colours")}
            disabled={status === "saving"}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50 transition-colors">
            Apply colours
          </button>
        </div>
      </div>

      {/* CSS injection */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">CSS Injection</p>
        <div className="flex gap-2 flex-wrap mb-3">
          {CSS_EXAMPLES.map(ex => (
            <button key={ex.label} onClick={() => setCustomCss(ex.css)}
              className="px-3 py-1 rounded-lg border border-gray-200 hover:border-indigo-300 text-xs text-gray-600 hover:text-indigo-600 transition-colors">
              {ex.label}
            </button>
          ))}
        </div>
        <textarea value={customCss} onChange={e => setCustomCss(e.target.value)} rows={3}
          placeholder="/* Write any CSS here — injected into widget Shadow DOM */"
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none" />
        <button onClick={() => apply({ customCss: customCss || null }, "Custom CSS")}
          disabled={status === "saving"}
          className="mt-2 px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-700 text-white text-sm font-medium disabled:opacity-50 transition-colors">
          Inject CSS
        </button>
      </div>

      {/* Quick toggles */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Quick Toggles</p>
        <div className="flex gap-2 flex-wrap">
          {[
            { label: "☀ Light",        patch: { widgetTheme: "light" } as DesignPatch },
            { label: "🌙 Dark",         patch: { widgetTheme: "dark"  } as DesignPatch },
            { label: "⬅ Move left",    patch: { widgetPosition: "bottom-left"  } as DesignPatch },
            { label: "➡ Move right",   patch: { widgetPosition: "bottom-right" } as DesignPatch },
            { label: "🔲 Square",       patch: { widgetBorderRadius: 0  } as DesignPatch },
            { label: "🔘 Pill",         patch: { widgetBorderRadius: 40 } as DesignPatch },
            { label: "📏 Tall (700px)", patch: { widgetChatHeight: 700  } as DesignPatch },
            { label: "📏 Short (400px)",patch: { widgetChatHeight: 400  } as DesignPatch },
            { label: "🚫 No branding",  patch: { widgetShowBranding: false } as DesignPatch },
            { label: "✅ Branding",     patch: { widgetShowBranding: true, customPoweredBy: "Powered by AmazeTechCLANS" } as DesignPatch },
          ].map(t => (
            <button key={t.label} onClick={() => apply(t.patch, t.label)} disabled={status === "saving"}
              className="px-3 py-1.5 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-xs text-gray-700 disabled:opacity-50 transition-all">
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
