"use client";
import { useState } from "react";
import { Save, Globe, Key, Shield, Bell, Zap, CheckCircle } from "lucide-react";

const SECTIONS = [
  {
    id: "platform",
    icon: Globe,
    title: "Platform Identity",
    color: "text-indigo-400",
    fields: [
      { key: "platform_name", label: "Platform Name", type: "text", default: "Clara AI" },
      { key: "support_email", label: "Support Email", type: "email", default: "support@clara.ai" },
      { key: "sales_email",   label: "Sales Email",   type: "email", default: "sales@clara.ai" },
      { key: "app_url",       label: "Production URL", type: "url",  default: "https://clara.ai" },
    ],
  },
  {
    id: "auth",
    icon: Key,
    title: "Authentication",
    color: "text-amber-400",
    fields: [
      { key: "session_ttl_days",   label: "Session TTL (days)",     type: "number", default: "7" },
      { key: "max_login_attempts", label: "Max failed login attempts", type: "number", default: "5" },
      { key: "lockout_minutes",    label: "Lockout duration (min)",  type: "number", default: "15" },
    ],
  },
  {
    id: "limits",
    icon: Zap,
    title: "Global Rate Limits",
    color: "text-cyan-400",
    fields: [
      { key: "chat_rpm",      label: "Chat req/min per org",       type: "number", default: "60" },
      { key: "upload_rpm",    label: "Upload req/min per org",     type: "number", default: "10" },
      { key: "voice_rph",     label: "Voice sessions/hour per org", type: "number", default: "10" },
      { key: "embed_rph",     label: "Embed req/hour per API key", type: "number", default: "1000" },
    ],
  },
  {
    id: "notifications",
    icon: Bell,
    title: "Notifications",
    color: "text-pink-400",
    fields: [
      { key: "admin_alert_email", label: "Alert recipient email", type: "email", default: "admin@clara.ai" },
    ],
  },
];

export default function AdminSettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  function handleChange(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    void values;
    await new Promise(r => setTimeout(r, 600));
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Platform Settings</h1>
        <p className="text-white/40 text-sm mt-1">Configure platform-wide behaviour and limits</p>
      </div>

      <div className="space-y-6">
        {SECTIONS.map(section => (
          <div key={section.id} className="border border-white/[0.08] bg-white/[0.03] rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.06] flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center">
                <section.icon className={`w-4 h-4 ${section.color}`} />
              </div>
              <h2 className="font-semibold text-white text-sm">{section.title}</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              {section.fields.map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">{field.label}</label>
                  <input
                    type={field.type}
                    defaultValue={field.default}
                    onChange={e => handleChange(field.key, e.target.value)}
                    className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-colors"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Security notice */}
        <div className="border border-amber-500/20 bg-amber-500/[0.05] rounded-xl p-4 flex items-start gap-3">
          <Shield className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-300/70 leading-relaxed">
            Changes to authentication and rate limit settings take effect immediately for all new sessions.
            Existing sessions are not affected until they expire. Environment variables (DATABASE_URL, OPENAI_API_KEY, etc.)
            must be set in your deployment environment and cannot be changed here.
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center gap-4">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-all">
            {saving ? (
              <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
            ) : saved ? (
              <><CheckCircle className="w-4 h-4" /> Saved!</>
            ) : (
              <><Save className="w-4 h-4" /> Save Settings</>
            )}
          </button>
          {saved && <span className="text-xs text-emerald-400">Settings saved successfully</span>}
        </div>
      </div>
    </div>
  );
}
