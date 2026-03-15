"use client";
/**
 * PlatformEnvPanel.tsx — Secure platform-level environment variable editor.
 *
 * Security features:
 *   1. Secret values masked (●●●●●●●●) on GET — only "is set" shown
 *   2. Changes require typing CONFIRM to a dialog before submitting
 *   3. Server verifies a time-limited HMAC token (5-minute window)
 *   4. All changes logged with who changed what and when
 *   5. "Requires restart" warning shown for dangerous keys
 */
import { useState, useEffect, useCallback } from "react";
import { Badge }  from "@/components/ui/badge";
import { apiUrl } from "@/lib/runtime";
import { withAuthHeaders } from "@/lib/client-auth";

type EnvSetting = {
  key: string; value: string; isSet: boolean; description: string;
  category: string; isSecret: boolean; requiresRestart: boolean; updatedAt: string;
};

const CATEGORIES = ["ai","phone","auth","billing","email","general"];
const CATEGORY_LABELS: Record<string, string> = {
  ai: "🤖 AI Providers", phone: "📞 Phone Providers",
  auth: "🔐 Authentication", billing: "💳 Billing",
  email: "📧 Email", general: "⚙️ General",
};

export function PlatformEnvPanel() {
  const [settings, setSettings]     = useState<EnvSetting[]>([]);
  const [loading, setLoading]       = useState(true);
  const [editing, setEditing]       = useState<string|null>(null);
  const [newValue, setNewValue]     = useState("");
  const [confirm, setConfirm]       = useState("");
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string|null>(null);
  const [success, setSuccess]       = useState<string|null>(null);
  const [showValues, setShowValues] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(apiUrl("/api/platform/env"), { headers: withAuthHeaders() });
      const data = await res.json() as { settings: EnvSetting[] };
      setSettings(data.settings ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const startEdit = (key: string, currentValue: string) => {
    setEditing(key);
    setNewValue(currentValue === "●●●●●●●●" ? "" : currentValue);
    setConfirm(""); setError(null); setSuccess(null);
  };

  const cancelEdit = () => { setEditing(null); setNewValue(""); setConfirm(""); setError(null); };

  const saveEdit = async (key: string) => {
    if (confirm !== "CONFIRM") {
      setError("Type CONFIRM exactly to proceed."); return;
    }
    setSaving(true); setError(null); setSuccess(null);
    try {
      // Get confirmation token from server using GET?token=1
      const tokenRes = await fetch(
        apiUrl(`/api/platform/env?token=1&key=${encodeURIComponent(key)}&value=${encodeURIComponent(newValue)}`),
        { headers: withAuthHeaders() }
      );
      const tokenData = await tokenRes.json() as { confirmation_token: string; timestamp: number };

      const res  = await fetch(apiUrl("/api/platform/env"), {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          key, value: newValue,
          confirmation_token: tokenData.confirmation_token,
          timestamp: tokenData.timestamp,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSuccess(`${key} updated successfully.`);
      setEditing(null);
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="animate-pulse h-32 rounded-xl bg-muted/30" />;

  const grouped = CATEGORIES.reduce<Record<string,EnvSetting[]>>((acc, cat) => {
    acc[cat] = settings.filter(s => s.category === cat);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">⚙️ Platform Environment Settings</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Securely manage API keys and platform configuration. All changes are logged.
          Secret values are never displayed — only whether they are set.
        </p>
      </div>

      {success && (
        <div className="rounded-lg bg-success/10 border border-success/30 px-4 py-2 text-sm text-success">
          ✅ {success}
        </div>
      )}

      {CATEGORIES.map(cat => {
        const items = grouped[cat] ?? [];
        if (!items.length) return null;
        return (
          <div key={cat} className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">{CATEGORY_LABELS[cat]}</h3>
            <div className="rounded-xl border border-border overflow-hidden divide-y divide-border/50">
              {items.map(s => (
                <div key={s.key} className="bg-card px-4 py-3">
                  {editing === s.key ? (
                    /* ── Edit mode ── */
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono font-semibold">{s.key}</code>
                        {s.requiresRestart && (
                          <Badge variant="outline" className="text-warning border-warning/30 text-[10px]">
                            ⚠ Requires restart
                          </Badge>
                        )}
                      </div>
                      <input
                        type={s.isSecret ? "password" : "text"}
                        value={newValue}
                        onChange={e => setNewValue(e.target.value)}
                        placeholder={s.isSecret ? "Enter new secret value…" : "Enter value…"}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
                        autoFocus
                      />
                      <div className="rounded-lg bg-warning/5 border border-warning/20 px-3 py-2 text-xs text-warning space-y-1">
                        <p className="font-semibold">⚠ This will update {s.key} immediately.</p>
                        <p>Type <strong>CONFIRM</strong> below to proceed:</p>
                        <input
                          value={confirm}
                          onChange={e => setConfirm(e.target.value)}
                          placeholder="Type CONFIRM"
                          className="mt-1 w-40 rounded border border-warning/40 bg-background px-2 py-1 text-xs font-mono uppercase"
                        />
                      </div>
                      {error && <p className="text-xs text-destructive">{error}</p>}
                      <div className="flex gap-2">
                        <button onClick={cancelEdit}
                          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted/30">
                          Cancel
                        </button>
                        <button
                          onClick={() => saveEdit(s.key)}
                          disabled={saving || confirm !== "CONFIRM"}
                          className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs disabled:opacity-40">
                          {saving ? "Saving…" : "Apply change"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── View mode ── */
                    <div className="flex items-center justify-between gap-4 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-xs font-mono font-semibold">{s.key}</code>
                          {s.isSecret && (
                            <Badge variant="outline" className="text-[10px]">secret</Badge>
                          )}
                          {s.requiresRestart && (
                            <Badge variant="outline" className="text-warning border-warning/30 text-[10px]">restart</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                        <div className="flex items-center gap-3 mt-1">
                          {s.isSecret ? (
                            s.isSet
                              ? <span className="text-xs text-success font-medium">✓ Set</span>
                              : <span className="text-xs text-destructive font-medium">✗ Not set</span>
                          ) : (
                            <span className="text-xs font-mono bg-muted/40 px-2 py-0.5 rounded">
                              {showValues.has(s.key) ? s.value || "(empty)" : s.value ? "••••••" : "(empty)"}
                            </span>
                          )}
                          {!s.isSecret && s.value && (
                            <button
                              onClick={() => setShowValues(prev => {
                                const next = new Set(prev);
                                if (next.has(s.key)) { next.delete(s.key); } else { next.add(s.key); }
                                return next;
                              })}
                              className="text-[10px] text-muted-foreground hover:text-foreground">
                              {showValues.has(s.key) ? "hide" : "show"}
                            </button>
                          )}
                          <span className="text-[10px] text-muted-foreground/60">
                            {s.updatedAt ? `Updated ${new Date(s.updatedAt).toLocaleDateString()}` : ""}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => startEdit(s.key, s.value)}
                        className="shrink-0 rounded-lg border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted/30">
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
