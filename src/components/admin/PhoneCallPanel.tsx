"use client";
/**
 * PhoneCallPanel.tsx — Admin panel for KB phone call configuration
 * Shows: provider selector, realtime engine (OpenAI relay vs ElevenLabs
 * Agents), phone number, greeting, call settings, call logs
 */
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge }  from "@/components/ui/badge";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";

type PhoneVoiceEngine = "openai" | "elevenlabs";
type PhoneConfig = {
  id: string; kbId: string; provider: "twilio"|"vonage"; enabled: boolean;
  voiceEngine: PhoneVoiceEngine;
  phoneNumber: string|null; greetingMessage: string;
  maxCallDurationSec: number; recordCalls: boolean; transcribeCalls: boolean;
};
type CallLog = {
  id: string; callSid: string; fromNumber: string|null; toNumber: string|null;
  status: string; startedAt: string; durationSec: number|null; turnCount: number;
};

export function PhoneCallPanel({ kbId }: { kbId: string }) {
  const [configs, setConfigs]           = useState<PhoneConfig[]>([]);
  const [logs, setLogs]                 = useState<CallLog[]>([]);
  const [enabled, setEnabled]           = useState(false);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string|null>(null);
  const [showForm, setShowForm]         = useState(false);
  const [form, setForm]                 = useState({
    provider: "twilio" as "twilio"|"vonage",
    voiceEngine: "openai" as PhoneVoiceEngine,
    phoneNumber: "", greetingMessage: "Hello! How can I help you today?",
    maxCallDurationSec: 300, recordCalls: false, transcribeCalls: true, enabled: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, logRes] = await Promise.all([
        fetch(apiUrl(`/api/kbs/${kbId}/phone`),     { headers: withAuthHeaders() }),
        fetch(apiUrl(`/api/phone/calls?kbId=${kbId}`), { headers: withAuthHeaders() }),
      ]);
      const cfgData = await cfgRes.json() as { configs: PhoneConfig[]; phoneCallsEnabled: boolean };
      const logData = await logRes.json() as { logs: CallLog[] };
      setConfigs(cfgData.configs ?? []);
      setEnabled(cfgData.phoneCallsEnabled ?? false);
      setLogs(logData.logs ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [kbId]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const res  = await fetch(apiUrl(`/api/kbs/${kbId}/phone`), {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(form),
      });
      const data = await res.json() as { config?: PhoneConfig; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setShowForm(false);
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this phone configuration?")) return;
    await fetch(apiUrl(`/api/kbs/${kbId}/phone?id=${id}`), {
      method: "DELETE", headers: withAuthHeaders(),
    });
    await load();
  };

  const APP_URL = typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.host}`
    : "";

  if (loading) return <div className="animate-pulse h-32 rounded-xl bg-muted/30" />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">📞 Live Phone Calls</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Let callers speak with your AI assistant over the phone via Twilio or Vonage.
          </p>
        </div>
        {enabled
          ? <Button size="sm" onClick={() => setShowForm(v => !v)}>
              {showForm ? "Cancel" : "+ Add number"}
            </Button>
          : <Badge variant="outline" className="text-warning border-warning/30 bg-warning/5">
              Upgrade to Pro for phone calls
            </Badge>
        }
      </div>

      {!enabled && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
          ⚠️ Phone calls require a <strong>Pro</strong> or <strong>Enterprise</strong> plan.
          <a href="/settings/billing" className="ml-2 underline">Upgrade →</a>
        </div>
      )}

      {/* Add / Edit form */}
      {showForm && enabled && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="font-semibold text-sm">Configure phone number</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium mb-1">Provider</label>
              <select value={form.provider}
                onChange={e => {
                  const provider = e.target.value as "twilio"|"vonage";
                  // The ElevenLabs Agents engine rides on the vendor's Twilio
                  // register-call TwiML — Vonage keeps the OpenAI relay.
                  setForm(f => ({ ...f, provider, ...(provider === "vonage" ? { voiceEngine: "openai" as const } : {}) }));
                }}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="twilio">Twilio</option>
                <option value="vonage">Vonage</option>
              </select>
            </div>
            {form.provider === "twilio" && (
              <div>
                <label className="block text-xs font-medium mb-1">Realtime engine</label>
                <select value={form.voiceEngine}
                  onChange={e => setForm(f => ({ ...f, voiceEngine: e.target.value as PhoneVoiceEngine }))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="openai">OpenAI Realtime (Clara relay)</option>
                  <option value="elevenlabs">ElevenLabs Agents (real-time)</option>
                </select>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {form.voiceEngine === "elevenlabs"
                    ? "Sub-second turns: audio flows Twilio ⇄ ElevenLabs directly; answers are grounded in this KB through the Conversational AI agent binding."
                    : "Clara bridges Twilio audio to OpenAI Realtime (existing behaviour)."}
                </p>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium mb-1">Phone number (E.164)</label>
              <input value={form.phoneNumber}
                onChange={e => setForm(f => ({ ...f, phoneNumber: e.target.value }))}
                placeholder="+1234567890"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Greeting message</label>
              <input value={form.greetingMessage}
                onChange={e => setForm(f => ({ ...f, greetingMessage: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Max call duration (seconds)</label>
              <input type="number" min={30} max={3600} value={form.maxCallDurationSec}
                onChange={e => setForm(f => ({ ...f, maxCallDurationSec: Number(e.target.value) }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div className="flex items-center gap-6 pt-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.transcribeCalls}
                  onChange={e => setForm(f => ({ ...f, transcribeCalls: e.target.checked }))} />
                Transcribe calls
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.enabled}
                  onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} />
                Active
              </label>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="pt-2 border-t border-border text-xs text-muted-foreground space-y-1">
            <p>📌 Webhook URL for <strong>Twilio</strong>:
              <code className="ml-1 bg-muted px-1 rounded">{APP_URL}/api/phone/twilio/incoming</code>
            </p>
            <p>📌 Answer URL for <strong>Vonage</strong>:
              <code className="ml-1 bg-muted px-1 rounded">{APP_URL}/api/phone/vonage/answer</code>
            </p>
            <p>📌 Event URL for <strong>Vonage</strong>:
              <code className="ml-1 bg-muted px-1 rounded">{APP_URL}/api/phone/vonage/event</code>
            </p>
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      )}

      {/* Active configs */}
      {configs.length > 0 && (
        <div className="space-y-2">
          {configs.map(c => (
            <div key={c.id} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{c.phoneNumber ?? "No number"}</span>
                  <Badge variant="outline" className="text-xs">{c.provider}</Badge>
                  {c.voiceEngine === "elevenlabs" && (
                    <Badge variant="outline" className="text-primary border-primary/30 text-xs">ElevenLabs Agents</Badge>
                  )}
                  {c.enabled
                    ? <Badge variant="outline" className="text-success border-success/30 text-xs">Active</Badge>
                    : <Badge variant="outline" className="text-muted-foreground text-xs">Disabled</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">&quot;{c.greetingMessage}&quot;</p>
                <p className="text-xs text-muted-foreground">
                  Max {Math.round(c.maxCallDurationSec / 60)}min · {c.transcribeCalls ? "Transcribed" : "Not transcribed"}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => del(c.id)}
                className="text-destructive hover:text-destructive text-xs">Delete</Button>
            </div>
          ))}
        </div>
      )}

      {/* Call logs */}
      {logs.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Recent calls</h3>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  {["From","To","Status","Duration","Turns","Time"].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.slice(0, 20).map(l => (
                  <tr key={l.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono">{l.fromNumber ?? "—"}</td>
                    <td className="px-3 py-2 font-mono">{l.toNumber ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={`text-[10px] ${
                        l.status==="completed" ? "text-success border-success/30" :
                        l.status==="failed"    ? "text-destructive border-destructive/30" : ""
                      }`}>{l.status}</Badge>
                    </td>
                    <td className="px-3 py-2">{l.durationSec != null ? `${l.durationSec}s` : "—"}</td>
                    <td className="px-3 py-2">{l.turnCount}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(l.startedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
