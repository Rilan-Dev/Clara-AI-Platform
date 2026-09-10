"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { KeyRound, Copy, CheckCircle2, AlertCircle, Save, Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/runtime";
import { withAuthHeaders } from "@/lib/client-auth";

/* ── types ──────────────────────────────────────────────────────────────────── */

type EmbedKeyInfo = {
  key: string;
  isSet: boolean;
  updatedAt: string;
};

const MASK = "●●●●●●●●";

/* ── helpers ─────────────────────────────────────────────────────────────────── */

async function saveSetting(key: string, value: string): Promise<void> {
  const tokenRes = await fetch(
    apiUrl(`/api/platform/env?token=1&key=${encodeURIComponent(key)}&value=${encodeURIComponent(value)}`),
    { headers: withAuthHeaders() },
  );
  const tokenData = await tokenRes.json() as { confirmation_token?: string; timestamp?: number; error?: string };
  if (!tokenRes.ok || !tokenData.confirmation_token)
    throw new Error(tokenData.error ?? "Could not create confirmation token");

  const res = await fetch(apiUrl("/api/platform/env"), {
    method: "POST",
    headers: withAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      key, value,
      confirmation_token: tokenData.confirmation_token,
      timestamp: tokenData.timestamp,
    }),
  });
  const data = await res.json() as { ok?: boolean; error?: string };
  if (!res.ok) throw new Error(data.error ?? "Failed to save");
}

/* ── component ──────────────────────────────────────────────────────────────── */

export function EmbedApiKeyPanel() {
  const [info, setInfo] = useState<EmbedKeyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/platform/env"), { headers: withAuthHeaders() });
      const data = await res.json() as { settings: Array<{ key: string; value: string; isSet: boolean; updatedAt: string }>; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      const setting = (data.settings ?? []).find(s => s.key === "NEXT_PUBLIC_LANDING_EMBED_API_KEY");
      setInfo(setting ? { key: setting.value, isSet: setting.isSet, updatedAt: setting.updatedAt } : null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    if (!newValue.trim()) { setError("API key cannot be empty."); return; }
    setSaving(true);
    setError(null);
    try {
      await saveSetting("NEXT_PUBLIC_LANDING_EMBED_API_KEY", newValue.trim());
      setSaved(true);
      setEditing(false);
      setNewValue("");
      setTimeout(() => setSaved(false), 3000);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!info?.key || info.key === MASK) return;
    try {
      await navigator.clipboard.writeText(info.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const el = document.createElement("textarea");
      el.value = info.key;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-10 rounded-xl bg-white/[0.04] animate-pulse" />
        <div className="h-24 rounded-xl bg-white/[0.04] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 p-3">
          <KeyRound className="w-5 h-5 text-indigo-300" />
        </div>
        <div>
          <h2 className="font-semibold text-white">Landing Page Embed API Key</h2>
          <p className="text-sm text-white/40 mt-0.5">
            This key powers the public landing-page chat widget. The database value overrides the <code className="text-xs font-mono text-white/50">.env</code> fallback.
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2 text-sm text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Success */}
      {saved && (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 text-sm text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> Embed API key saved successfully.
        </div>
      )}

      {/* Current key display */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white/70">Current Key</span>
            {info?.isSet ? (
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">Active</Badge>
            ) : (
              <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">Not Set</Badge>
            )}
          </div>
          {info?.updatedAt && (
            <span className="text-[10px] text-white/25">
              Updated {new Date(info.updatedAt).toLocaleDateString()}
            </span>
          )}
        </div>

        {info?.isSet ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-sm font-mono text-white/60 select-all">
              {showKey ? info.key : MASK}
            </code>
            <button
              onClick={() => setShowKey(!showKey)}
              className="p-2 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white/70 transition-colors"
              title={showKey ? "Hide" : "Reveal"}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              onClick={handleCopy}
              className="p-2 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white/70 transition-colors"
              title="Copy"
            >
              {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        ) : (
          <p className="text-sm text-white/30 italic">No embed API key is currently configured.</p>
        )}
      </div>

      {/* Edit form */}
      {editing ? (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white/80">Set New Embed API Key</h3>
            <Link href="/orgs" className="text-xs text-indigo-300 hover:text-indigo-200">
              Create a workspace key →
            </Link>
          </div>

          <input
            type="text"
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            placeholder="clr_… or paste an existing API key"
            className="w-full rounded-lg border border-white/[0.12] bg-white/[0.04] px-3 py-2.5 text-sm font-mono text-white/80 placeholder:text-white/20 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30"
            autoFocus
          />

          <div className="flex gap-2">
            <Button
              variant="outline" 
              size="sm"
              onClick={() => { setEditing(false); setNewValue(""); setError(null); }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !newValue.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {saving ? (
                <span className="flex items-center gap-1"><span className="animate-spin">⏳</span> Saving…</span>
              ) : (
                <span className="flex items-center gap-1"><Save className="w-3.5 h-3.5" /> Save Key</span>
              )}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline" 
          size="sm"
          onClick={() => { setEditing(true); setError(null); setSaved(false); }}
          className="text-sm"
        >
          <KeyRound className="w-3.5 h-3.5 mr-1.5" />
          {info?.isSet ? "Change Embed API Key" : "Set Embed API Key"}
        </Button>
      )}

      {/* Info */}
      <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] px-4 py-3 text-xs text-white/30 space-y-1">
        <p>• This key is used by the public <code className="font-mono text-white/40">&lt;clara-chat&gt;</code> widget on the landing page.</p>
        <p>• The key must match a valid <code className="font-mono text-white/40">embed_api_keys</code> record to function.</p>
        <p>• Changing this key takes effect immediately — no restart needed.</p>
      </div>
    </div>
  );
}
