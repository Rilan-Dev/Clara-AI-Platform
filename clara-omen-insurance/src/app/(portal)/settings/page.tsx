"use client";
import { useEffect, useState } from "react";
import { Save, Palette, Bot, Bell, Shield, RefreshCw } from "lucide-react";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3010";
const ORG_ID  = process.env.NEXT_PUBLIC_ORG_ID || "";

type AssistantConfig = {
  id: string; kb_id: string;
  assistant_name: string; avatar_url: string | null;
  system_prompt: string; tone: string;
  primary_colour: string; accent_colour: string;
  voice_enabled: boolean; voice_provider: string;
};
type KB = { id: string; name: string; assistant_config?: AssistantConfig };

export default function SettingsPage() {
  const [kbs, setKbs] = useState<KB[]>([]);
  const [activeKbId, setActiveKbId] = useState<string>("");
  const [config, setConfig] = useState<Partial<AssistantConfig>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${BACKEND}/api/kbs/all?orgId=${ORG_ID}`)
      .then(r => r.json())
      .then(d => {
        const list: KB[] = d.kbs ?? [];
        setKbs(list);
        if (list.length > 0) { setActiveKbId(list[0].id); }
        setLoading(false);
      }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!activeKbId) return;
    setLoading(true);
    fetch(`${BACKEND}/api/kbs/${activeKbId}/assistant-config`)
      .then(r => r.json())
      .then(d => { setConfig(d ?? {}); setLoading(false); })
      .catch(() => setLoading(false));
  }, [activeKbId]);

  async function save() {
    if (!activeKbId) return;
    setSaving(true);
    try {
      await fetch(`${BACKEND}/api/kbs/${activeKbId}/assistant-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  }

  function field(label: string, key: keyof AssistantConfig, type = "text") {
    return (
      <div>
        <label className="block text-xs font-medium text-white/50 mb-1">{label}</label>
        <input
          type={type}
          value={(config[key] as string) ?? ""}
          onChange={e => setConfig(c => ({ ...c, [key]: e.target.value }))}
          className="w-full bg-white/[0.05] border border-white/[0.10] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
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
        <select value={activeKbId} onChange={e => setActiveKbId(e.target.value)}
                className="bg-white/[0.05] border border-white/[0.10] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500">
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
              {field("Assistant Name", "assistant_name")}
              {field("Avatar URL", "avatar_url")}
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
                  value={(config.system_prompt as string) ?? ""}
                  onChange={e => setConfig(c => ({ ...c, system_prompt: e.target.value }))}
                  className="w-full bg-white/[0.05] border border-white/[0.10] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1">Tone</label>
                <select value={(config.tone as string) ?? "professional"}
                        onChange={e => setConfig(c => ({ ...c, tone: e.target.value }))}
                        className="bg-white/[0.05] border border-white/[0.10] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                  <option value="professional">Professional</option>
                  <option value="friendly">Friendly</option>
                  <option value="concise">Concise</option>
                  <option value="formal">Formal</option>
                </select>
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
              {field("Primary Colour", "primary_colour", "color")}
              {field("Accent Colour", "accent_colour", "color")}
            </div>
          </section>

          {/* Voice */}
          <section className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-white">Voice Settings</h2>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="voice_enabled"
                checked={!!config.voice_enabled}
                onChange={e => setConfig(c => ({ ...c, voice_enabled: e.target.checked }))}
                className="w-4 h-4 rounded text-indigo-500"
              />
              <label htmlFor="voice_enabled" className="text-sm text-white/70">Enable voice assistant</label>
            </div>
          </section>

          <button onClick={save} disabled={saving}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all">
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save Settings"}
          </button>
        </div>
      )}
    </div>
  );
}
