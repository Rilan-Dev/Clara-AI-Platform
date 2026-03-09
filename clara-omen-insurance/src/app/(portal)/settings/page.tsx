"use client";
import { useEffect, useState } from "react";
import { Save, Palette, Bot, Bell, Shield, RefreshCw } from "lucide-react";

const PROXY  = "/api/proxy";
const ORG_ID = process.env.NEXT_PUBLIC_ORG_ID || "";

// Field names match the API response exactly (camelCase)
type AssistantConfig = {
  id: string;
  kbId: string;
  assistantName: string;
  avatarUrl: string | null;
  systemPrompt: string;
  welcomeMessage: string;
  outOfScopeReply: string;
  defaultLanguage: string;
  temperature: number;
  maxTokens: number;
  citeSources: boolean;
  strictMode: boolean;
  primaryColour: string;
  accentColour: string;
  voiceId: string | null;
  speed: number;
};

type KB = { id: string; name: string };

export default function SettingsPage() {
  const [kbs, setKbs]           = useState<KB[]>([]);
  const [activeKbId, setActiveKbId] = useState<string>("");
  const [config, setConfig]     = useState<Partial<AssistantConfig>>({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  // Load KB list
  useEffect(() => {
    fetch(`${PROXY}/kbs/all?orgId=${ORG_ID}`)
      .then(r => r.json())
      .then(d => {
        const list: KB[] = d.kbs ?? [];
        setKbs(list);
        if (list.length > 0) setActiveKbId(list[0].id);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Load config for selected KB
  useEffect(() => {
    if (!activeKbId) return;
    setLoading(true);
    fetch(`${PROXY}/kbs/${activeKbId}/config`)
      .then(r => r.json())
      .then(d => { setConfig(d ?? {}); setLoading(false); })
      .catch(() => setLoading(false));
  }, [activeKbId]);

  async function save() {
    if (!activeKbId) return;
    setSaving(true);
    try {
      await fetch(`${PROXY}/kbs/${activeKbId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  }

  function textField(label: string, key: keyof AssistantConfig, placeholder = "") {
    return (
      <div>
        <label className="block text-xs font-medium text-white/50 mb-1">{label}</label>
        <input
          type="text"
          value={(config[key] as string) ?? ""}
          placeholder={placeholder}
          onChange={e => setConfig(c => ({ ...c, [key]: e.target.value }))}
          className="w-full bg-white/[0.05] border border-white/[0.10] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#c8821a]/60"
        />
      </div>
    );
  }

  function colorField(label: string, key: keyof AssistantConfig) {
    return (
      <div>
        <label className="block text-xs font-medium text-white/50 mb-1">{label}</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={(config[key] as string) ?? "#000000"}
            onChange={e => setConfig(c => ({ ...c, [key]: e.target.value }))}
            className="w-10 h-9 rounded cursor-pointer bg-transparent border-0"
          />
          <input
            type="text"
            value={(config[key] as string) ?? ""}
            onChange={e => setConfig(c => ({ ...c, [key]: e.target.value }))}
            className="flex-1 bg-white/[0.05] border border-white/[0.10] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#c8821a]/60"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Assistant Settings</h1>
        <p className="text-sm text-white/40 mt-1">Configure your AI assistant persona and behaviour per knowledge base</p>
      </div>

      {/* KB selector */}
      <div className="mb-6">
        <label className="block text-xs font-medium text-white/50 mb-2">Configure for Knowledge Base</label>
        <select
          value={activeKbId}
          onChange={e => setActiveKbId(e.target.value)}
          className="bg-white/[0.05] border border-white/[0.10] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#c8821a]/60"
        >
          {kbs.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-white/30 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading settings…
        </div>
      ) : (
        <div className="space-y-6">

          {/* Identity */}
          <section className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bot className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-white">Identity</h2>
            </div>
            <div className="space-y-4">
              {textField("Assistant Name", "assistantName", "e.g. Aria")}
              {textField("Avatar URL", "avatarUrl", "https://…")}
              {textField("Welcome Message", "welcomeMessage", "Greeting shown to users")}
            </div>
          </section>

          {/* Behaviour */}
          <section className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-white">Behaviour</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1">System Prompt</label>
                <textarea
                  rows={5}
                  value={config.systemPrompt ?? ""}
                  onChange={e => setConfig(c => ({ ...c, systemPrompt: e.target.value }))}
                  className="w-full bg-white/[0.05] border border-white/[0.10] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#c8821a]/60 resize-y"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1">Out-of-Scope Reply</label>
                <textarea
                  rows={2}
                  value={config.outOfScopeReply ?? ""}
                  onChange={e => setConfig(c => ({ ...c, outOfScopeReply: e.target.value }))}
                  className="w-full bg-white/[0.05] border border-white/[0.10] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#c8821a]/60 resize-y"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1">Temperature</label>
                  <input
                    type="number" min={0} max={1} step={0.1}
                    value={config.temperature ?? 0.7}
                    onChange={e => setConfig(c => ({ ...c, temperature: parseFloat(e.target.value) }))}
                    className="w-full bg-white/[0.05] border border-white/[0.10] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#c8821a]/60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1">Max Tokens</label>
                  <input
                    type="number" min={100} max={4000} step={100}
                    value={config.maxTokens ?? 500}
                    onChange={e => setConfig(c => ({ ...c, maxTokens: parseInt(e.target.value) }))}
                    className="w-full bg-white/[0.05] border border-white/[0.10] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#c8821a]/60"
                  />
                </div>
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!config.citeSources}
                    onChange={e => setConfig(c => ({ ...c, citeSources: e.target.checked }))}
                    className="w-4 h-4 rounded accent-[#c8821a]"
                  />
                  <span className="text-sm text-white/70">Cite sources ([S1], [S2]…)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!config.strictMode}
                    onChange={e => setConfig(c => ({ ...c, strictMode: e.target.checked }))}
                    className="w-4 h-4 rounded accent-[#c8821a]"
                  />
                  <span className="text-sm text-white/70">Strict mode (KB only)</span>
                </label>
              </div>
            </div>
          </section>

          {/* Appearance */}
          <section className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Palette className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-white">Appearance</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {colorField("Primary Colour", "primaryColour")}
              {colorField("Accent Colour", "accentColour")}
            </div>
          </section>

          {/* Voice */}
          <section className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-white">Voice Settings</h2>
            </div>
            <div className="space-y-3">
              {textField("Voice ID", "voiceId", "e.g. alloy, nova, shimmer")}
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1">Speed ({config.speed ?? 1}×)</label>
                <input
                  type="range" min={0.5} max={2} step={0.1}
                  value={config.speed ?? 1}
                  onChange={e => setConfig(c => ({ ...c, speed: parseFloat(e.target.value) }))}
                  className="w-full accent-[#c8821a]"
                />
              </div>
            </div>
          </section>

          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 bg-[#c8821a] hover:bg-[#a86214] disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save Settings"}
          </button>
        </div>
      )}
    </div>
  );
}
