"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Play, Mic, MessageSquare, Brain, Shield, Globe,
  ExternalLink, RefreshCw, Loader2, Check, AlertTriangle,
} from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { apiUrl } from "@/lib/runtime";
import { withAuthHeaders } from "@/lib/client-auth";

// ── Types ─────────────────────────────────────────────────────────────────────

type DemoConfig = {
  enabled: boolean;
  voiceEnabled: boolean;
  chatEnabled: boolean;
  kbId: string;
  kbName: string;
  voiceGreeting: string;
  suggestedPrompts: string[];
  rateLimitPerHour: number;
  maxRequestsPerDay: number;
};

type EnvSetting = {
  key: string; value: string; isSet: boolean; description: string;
  category: string; isSecret: boolean; requiresRestart: boolean; updatedAt: string;
};

// ── Main Component ────────────────────────────────────────────────────────────

export default function AdminDemoScreen() {
  const [config, setConfig] = useState<DemoConfig | null>(null);
  const [allSettings, setAllSettings] = useState<EnvSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [kbs, setKbs] = useState<{ id: string; name: string; org: { id: string; name: string }; assistant?: any }[]>([]);
  const [pendingSettings, setPendingSettings] = useState<Record<string, string>>({});

  // ── Load config ───────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, envRes, orgsRes, kbsRes] = await Promise.all([
        fetch(apiUrl("/api/platform/demo-config")),
        fetch(apiUrl("/api/platform/env"), { headers: withAuthHeaders() }),
        fetch(apiUrl("/api/orgs"), { headers: withAuthHeaders() }),
        fetch(apiUrl("/api/kbs/all"), { headers: withAuthHeaders() }),
      ]);
      const cfgData = await cfgRes.json();
      const envData = await envRes.json() as { settings: EnvSetting[] };
      const orgsData = await orgsRes.json().catch(() => []);
      const kbsData = await kbsRes.json().catch(() => ({ kbs: [] }));

      setConfig(cfgData);
      setAllSettings((envData.settings ?? []).filter(s => s.category === "demo"));
      setOrgs(Array.isArray(orgsData) ? orgsData : []);
      setKbs(kbsData?.kbs ?? []);
      setPendingSettings({}); // Clear pending on reload
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveAllSettings = async () => {
    setSaving("global");
    try {
      const keys = Object.keys(pendingSettings);
      if (keys.length === 0) return;

      // Save each setting sequentially
      for (const key of keys) {
        const value = pendingSettings[key];
        
        // 1. Fetch confirmation token
        const tokenRes = await fetch(
          apiUrl(`/api/platform/env?token=1&key=${encodeURIComponent(key)}&value=${encodeURIComponent(value)}`),
          { headers: withAuthHeaders() },
        );
        if (!tokenRes.ok) throw new Error(`Failed to secure token for ${key}`);
        const tokenData = await tokenRes.json() as { confirmation_token: string; timestamp: number };

        // 2. Submit change
        const res = await fetch(apiUrl("/api/platform/env"), {
          method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            key, value,
            confirmation_token: tokenData.confirmation_token,
            timestamp: tokenData.timestamp,
          })
        });
        const data = await res.json() as { ok?: boolean; error?: string };
        if (!res.ok) throw new Error(data.error ?? `Failed to save ${key}`);
      }

      setPendingSettings({});
      setToast({ msg: "All settings saved successfully!", ok: true });
      await load();
    } catch (err) {
      setToast({ msg: (err as Error).message, ok: false });
    }
    setSaving(null);
  };

  const handleLocalChange = useCallback((key: string, val: string) => {
    setPendingSettings(prev => {
      const next = { ...prev, [key]: val };
      if (key === "DEMO_KB_ID") {
        const selectedKb = kbs.find(k => k.id === val);
        if (selectedKb) {
          next["DEMO_KB_NAME"] = selectedKb.assistant?.name || selectedKb.name || "Clara AI";
          next["DEMO_VOICE_GREETING"] = selectedKb.assistant?.welcomeMessage || "Hello! How can I help you?";
          next["DEMO_KB_PERSONA"] = selectedKb.assistant?.systemPrompt || "You are Clara, a helpful voice assistant. Answer ONLY using the context provided.";
        }
      }
      return next;
    });
  }, [kbs]);

  const getVal = useCallback((key: string, def: string) => {
    if (pendingSettings[key] !== undefined) return pendingSettings[key];
    return allSettings.find(s => s.key === key)?.value ?? def;
  }, [allSettings, pendingSettings]);

  // ── Toggle helper ─────────────────────────────────────────────────────────

  const toggleSetting = async (key: string) => {
    const current = getVal(key, "true");
    const nextVal = current === "true" ? "false" : "true";
    setSaving(key);
    try {
      const tokenRes = await fetch(
        apiUrl(`/api/platform/env?token=1&key=${encodeURIComponent(key)}&value=${encodeURIComponent(nextVal)}`),
        { headers: withAuthHeaders() }
      );
      const tokenData = await tokenRes.json() as { confirmation_token: string; timestamp: number };

      const res = await fetch(apiUrl("/api/platform/env"), {
        method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          key, value: nextVal,
          confirmation_token: tokenData.confirmation_token,
          timestamp: tokenData.timestamp,
        })
      });
      if (!res.ok) throw new Error("Failed to save toggle");
      setToast({ msg: "Setting updated", ok: true });
      await load();
    } catch (err) {
      setToast({ msg: (err as Error).message, ok: false });
    }
    setSaving(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl">
        <div className="space-y-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 rounded-2xl bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const isEnabled = config?.enabled ?? true;
  const isVoice = config?.voiceEnabled ?? true;
  const isChat = config?.chatEnabled ?? true;

  return (
    <div className="p-6 lg:p-8 max-w-6xl space-y-6">
      <AdminPageHeader
        icon={Play}
        title="Demo Management"
        description="Configure the public landing page demo experience — toggle features, customise the AI persona, and control rate limits."
        breadcrumbs={[{ label: "Demo" }]}
        chips={[
          isEnabled ? "✓ Demo Active" : "✗ Demo Disabled",
          isVoice ? "Voice ON" : "Voice OFF",
          isChat ? "Chat ON" : "Chat OFF",
        ]}
      />

      {/* Toast */}
      {toast && (
        <div className={`rounded-xl px-4 py-3 text-sm flex items-center gap-2 ${
          toast.ok
            ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
            : "bg-red-500/10 border border-red-500/30 text-red-300"
        }`}>
          {toast.ok ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* ── Master Toggle ──────────────────────────────────────────────── */}
      <div className={`rounded-2xl border p-6 transition-all ${
        isEnabled
          ? "border-emerald-500/30 bg-emerald-500/[0.04]"
          : "border-red-500/30 bg-red-500/[0.04]"
      }`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              isEnabled
                ? "bg-emerald-500/20 border border-emerald-500/30"
                : "bg-red-500/20 border border-red-500/30"
            }`}>
              <Globe className={`w-6 h-6 ${isEnabled ? "text-emerald-400" : "text-red-400"}`} />
            </div>
            <div>
              <h2 className="font-semibold text-white text-lg">Landing Page Demo</h2>
              <p className="text-sm text-white/40 mt-0.5">
                {isEnabled
                  ? "Demo is live — visitors can interact with AI on the landing page"
                  : "Demo is disabled — no AI features shown on the landing page"}
              </p>
            </div>
          </div>
          <ToggleButton
            enabled={isEnabled}
            saving={saving === "DEMO_ENABLED"}
            onClick={() => toggleSetting("DEMO_ENABLED")}
          />
        </div>
        {isEnabled && (
          <div className="mt-4 flex gap-2">
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs text-indigo-300 hover:text-indigo-200 bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-2 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> View Landing Page
            </a>
            <button
              onClick={load}
              className="inline-flex items-center gap-2 text-xs text-white/40 hover:text-white/70 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh Config
            </button>
          </div>
        )}
      </div>

      {/* ── Feature Toggles ────────────────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">
        <ToggleCard
          icon={MessageSquare}
          title="Chat Assistant (FAB)"
          description="Floating chat button in bottom-right. Visitors can ask questions via text with RAG-powered answers."
          enabled={isChat}
          saving={saving === "DEMO_CHAT_ENABLED"}
          onToggle={() => toggleSetting("DEMO_CHAT_ENABLED")}
        />
        <ToggleCard
          icon={Mic}
          title="Voice AI Section"
          description="Full-page voice demo section. Visitors start a real-time voice conversation with the AI."
          enabled={isVoice}
          saving={saving === "DEMO_VOICE_ENABLED"}
          onToggle={() => toggleSetting("DEMO_VOICE_ENABLED")}
        />
      </div>

      {/* ── Knowledge Base Config ──────────────────────────────────────── */}
      <SettingsCard icon={Brain} title="Knowledge Base & Persona">
        <SettingCombo
          label="Organisation Context"
          description="Select the organization for the demo. This ensures data validation and filters the Knowledge Bases below."
          settingKey="DEMO_ORG_ID"
          value={getVal("DEMO_ORG_ID", "")}
          onChange={handleLocalChange}
          options={orgs.map(o => ({ value: o.id, label: o.name }))}
        />
        <SettingCombo
          label="Knowledge Base ID"
          description="Select the knowledge base the demo queries against. Options are filtered by the selected organization."
          settingKey="DEMO_KB_ID"
          value={getVal("DEMO_KB_ID", "")}
          onChange={handleLocalChange}
          options={kbs
            .filter(k => {
              const orgId = getVal("DEMO_ORG_ID", "");
              return !orgId || k.org?.id === orgId;
            })
            .map(k => ({ value: k.id, label: k.name }))}
        />
        <SettingInput
          label="Display Name"
          description="Shown in the chat widget header"
          settingKey="DEMO_KB_NAME"
          value={getVal("DEMO_KB_NAME", "")}
          onChange={handleLocalChange}
        />
        <SettingTextarea
          label="AI Persona / System Prompt"
          description="The full system prompt that shapes the demo AI's personality and behaviour"
          settingKey="DEMO_KB_PERSONA"
          value={getVal("DEMO_KB_PERSONA", "")}
          onChange={handleLocalChange}
        />
      </SettingsCard>

      {/* ── Voice Settings ─────────────────────────────────────────────── */}
      <SettingsCard icon={Mic} title="Voice Settings">
        <SettingTextarea
          label="Voice Greeting"
          description="The message spoken by the AI when a voice session starts"
          settingKey="DEMO_VOICE_GREETING"
          value={getVal("DEMO_VOICE_GREETING", "")}
          onChange={handleLocalChange}
          rows={2}
        />
      </SettingsCard>

      {/* ── Chat Experience ────────────────────────────────────────────── */}
      <SettingsCard icon={MessageSquare} title="Chat Experience">
        <SettingTextarea
          label="Suggested Prompts (JSON Array)"
          description='JSON array of prompt strings shown to visitors, e.g. ["Question 1","Question 2"]'
          settingKey="DEMO_SUGGESTED_PROMPTS"
          value={getVal("DEMO_SUGGESTED_PROMPTS", "[]")}
          onChange={handleLocalChange}
          rows={3}
        />
      </SettingsCard>

      {/* ── Rate Limiting ──────────────────────────────────────────────── */}
      <SettingsCard icon={Shield} title="Rate Limiting">
        <div className="grid md:grid-cols-2 gap-4">
          <SettingInput
            label="Requests per Hour"
            description="Hourly cap for all demo visitors combined"
            settingKey="DEMO_RATE_LIMIT_PER_HOUR"
            value={getVal("DEMO_RATE_LIMIT_PER_HOUR", "100")}
            onChange={handleLocalChange}
            type="number"
          />
          <SettingInput
            label="Requests per Day"
            description="Daily cap for all demo visitors combined"
            settingKey="DEMO_MAX_REQUESTS_PER_DAY"
            value={getVal("DEMO_MAX_REQUESTS_PER_DAY", "1000")}
            onChange={handleLocalChange}
            type="number"
          />
        </div>
      </SettingsCard>

      {/* Sticky Save Changes Bar */}
      {Object.keys(pendingSettings).length > 0 && (
        <div className="fixed bottom-6 right-6 left-6 md:left-[280px] bg-[#0c0d12]/90 backdrop-blur-md border border-indigo-500/20 rounded-2xl p-4 flex items-center justify-between shadow-2xl animate-in slide-in-from-bottom duration-300 z-50">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-medium text-white/90">You have unsaved demo settings changes!</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPendingSettings({})}
              disabled={saving === "global"}
              className="px-4 py-2 rounded-xl border border-white/10 text-white/70 hover:text-white hover:bg-white/5 text-xs font-medium transition-all cursor-pointer disabled:opacity-50"
            >
              Reset
            </button>
            <button
              onClick={saveAllSettings}
              disabled={saving === "global"}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/20 cursor-pointer disabled:opacity-50"
            >
              {saving === "global" ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving Settings...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ToggleButton({ enabled, saving, onClick }: {
  enabled: boolean; saving: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className={`relative w-14 h-7 rounded-full transition-all duration-300 shrink-0 cursor-pointer disabled:opacity-50 ${
        enabled ? "bg-emerald-500" : "bg-white/20"
      }`}
    >
      {saving ? (
        <Loader2 className="w-4 h-4 text-white animate-spin absolute top-1.5 left-1/2 -translate-x-1/2" />
      ) : (
        <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all duration-300 ${
          enabled ? "left-8" : "left-1"
        }`} />
      )}
    </button>
  );
}

function ToggleCard({ icon: Icon, title, description, enabled, saving, onToggle }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string; description: string;
  enabled: boolean; saving: boolean; onToggle: () => void;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 flex items-start justify-between gap-4">
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          enabled
            ? "bg-indigo-500/15 border border-indigo-500/25"
            : "bg-white/[0.06] border border-white/[0.08]"
        }`}>
          <Icon className={`w-5 h-5 ${enabled ? "text-indigo-400" : "text-white/30"}`} />
        </div>
        <div>
          <h3 className="font-semibold text-white text-sm">{title}</h3>
          <p className="text-xs text-white/40 mt-1 leading-relaxed">{description}</p>
        </div>
      </div>
      <ToggleButton enabled={enabled} saving={saving} onClick={onToggle} />
    </div>
  );
}

function SettingsCard({ icon: Icon, title, children }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
          <Icon className="w-4.5 h-4.5 text-indigo-400" />
        </div>
        <h2 className="font-semibold text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function SettingInput({ label, description, settingKey, value, onChange, type = "text" }: {
  label: string; description: string; settingKey: string;
  value: string; onChange: (key: string, val: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5 text-left">
      <label className="text-sm font-medium text-white/80">{label}</label>
      <p className="text-xs text-white/35">{description}</p>
      <input
        type={type}
        value={value}
        onChange={e => onChange(settingKey, e.target.value)}
        className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white font-mono focus:border-indigo-500/40 focus:outline-none transition-colors"
      />
    </div>
  );
}

function SettingTextarea({ label, description, settingKey, value, onChange, rows = 4 }: {
  label: string; description: string; settingKey: string;
  value: string; onChange: (key: string, val: string) => void;
  rows?: number;
}) {
  return (
    <div className="space-y-1.5 text-left">
      <label className="text-sm font-medium text-white/80">{label}</label>
      <p className="text-xs text-white/35">{description}</p>
      <textarea
        value={value}
        onChange={e => onChange(settingKey, e.target.value)}
        rows={rows}
        className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white font-mono focus:border-indigo-500/40 focus:outline-none transition-colors resize-y"
      />
    </div>
  );
}

function SettingCombo({ label, description, settingKey, value, onChange, options }: {
  label: string; description: string; settingKey: string;
  value: string; onChange: (key: string, val: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5 text-left">
      <label className="text-sm font-medium text-white/80">{label}</label>
      <p className="text-xs text-white/35">{description}</p>
      
      <div className="flex flex-col sm:flex-row gap-2 mt-1">
        <select
          value={options.find(o => o.value === value) ? value : ""}
          onChange={(e) => {
            onChange(settingKey, e.target.value);
          }}
          className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-indigo-500/40 focus:outline-none transition-colors"
        >
          <option value="" className="bg-[#0a0a0f] text-white">-- Select from existing --</option>
          {options.map(o => (
            <option key={o.value} value={o.value} className="bg-[#0a0a0f] text-white">{o.label}</option>
          ))}
        </select>

        <input
          type="text"
          value={value}
          onChange={e => onChange(settingKey, e.target.value)}
          placeholder="Or enter manual ID..."
          className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white font-mono focus:border-indigo-500/40 focus:outline-none transition-colors"
        />
      </div>
    </div>
  );
}
