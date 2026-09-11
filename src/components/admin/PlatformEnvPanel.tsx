"use client";
import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { apiUrl } from "@/lib/runtime";
import { withAuthHeaders } from "@/lib/client-auth";

type EnvSetting = {
  key: string;
  value: string;
  isSet: boolean;
  description: string;
  category: string;
  isSecret: boolean;
  requiresRestart: boolean;
  updatedAt: string;
};
const CATEGORIES = ["ai", "platform", "payments", "phone"];
const CATEGORY_LABELS: Record<string, string> = {
  ai: "🤖 AI Configuration (Centralized)",
  platform: "🔑 Platform Configuration",
  payments: "💳 Payment Gateway Configuration",
  phone: "📞 Phone Configuration",
};
const MASK = "●●●●●●●●";

export function PlatformEnvPanel() {
  const [settings, setSettings] = useState<EnvSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [newValue, setNewValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/platform/env"), {
        headers: withAuthHeaders(),
      });
      const data = (await res.json()) as {
        settings: EnvSetting[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load settings");
      setSettings(data.settings ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const startEdit = (key: string, value: string) => {
    setEditing(key);
    setNewValue(value === MASK ? "" : value);
    setConfirm("");
    setError(null);
    setSuccess(null);
  };
  const cancelEdit = () => {
    setEditing(null);
    setNewValue("");
    setConfirm("");
    setError(null);
  };
  const saveEdit = async (key: string) => {
    if (confirm !== "CONFIRM") {
      setError("Type CONFIRM exactly to proceed.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const tokenRes = await fetch(
        apiUrl(
          `/api/platform/env?token=1&key=${encodeURIComponent(key)}&value=${encodeURIComponent(newValue)}`,
        ),
        { headers: withAuthHeaders() },
      );
      const tokenData = (await tokenRes.json()) as {
        confirmation_token?: string;
        timestamp?: number;
        error?: string;
      };
      if (!tokenRes.ok || !tokenData.confirmation_token)
        throw new Error(
          tokenData.error ?? "Could not create confirmation token",
        );
      const res = await fetch(apiUrl("/api/platform/env"), {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          key,
          value: newValue,
          confirmation_token: tokenData.confirmation_token,
          timestamp: tokenData.timestamp,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSuccess(`${key} updated successfully.`);
      setEditing(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  if (loading)
    return <div className="animate-pulse h-32 rounded-xl bg-muted/30" />;
  const grouped = CATEGORIES.reduce<Record<string, EnvSetting[]>>((a, c) => {
    a[c] = settings.filter((s) => s.category === c);
    return a;
  }, {});
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">⚙️ Platform Runtime Settings</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          <strong>AI Configuration</strong> applies globally to all organizations, projects, KB&apos;s and assistants.
          Organizations can only override Identity, Behaviour, Language & Voice settings.
          Payment & Phone changes take effect without restarting the application. Secret
          values are masked.
        </p>
      </div>
      {success && (
        <div className="rounded-lg bg-success/10 border border-success/30 px-4 py-2 text-sm text-success">
          ✅ {success}
        </div>
      )}
      {error && !editing && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {CATEGORIES.map((cat) => {
        const items = grouped[cat] ?? [];
        if (!items.length) return null;
        return (
          <div key={cat} className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {CATEGORY_LABELS[cat]}
            </h3>
            <div className="rounded-xl border border-border overflow-hidden divide-y divide-border/50">
              {items.map((s) => (
                <div key={s.key} className="bg-card px-4 py-3">
                  {editing === s.key ? (
                    <div className="space-y-3">
                      <code className="text-xs font-mono font-semibold">
                        {s.key}
                      </code>
                      <input
                        type={s.isSecret ? "password" : "text"}
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder={
                          s.isSecret
                            ? "Enter new secret value…"
                            : "Enter value…"
                        }
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
                        autoFocus
                      />
                      <div className="rounded-lg bg-warning/5 border border-warning/20 px-3 py-2 text-xs text-warning">
                        <p className="font-semibold">
                          This updates the live runtime configuration
                          immediately.
                        </p>
                        <p className="mt-1">
                          Type <strong>CONFIRM</strong> to continue.
                        </p>
                        <input
                          value={confirm}
                          onChange={(e) => setConfirm(e.target.value)}
                          placeholder="Type CONFIRM"
                          className="mt-2 w-40 rounded border border-warning/40 bg-background px-2 py-1 text-xs font-mono"
                        />
                      </div>
                      {error && (
                        <p className="text-xs text-destructive">{error}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={cancelEdit}
                          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => saveEdit(s.key)}
                          disabled={saving || confirm !== "CONFIRM"}
                          className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs disabled:opacity-40"
                        >
                          {saving ? "Saving…" : "Apply change"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-xs font-mono font-semibold">
                            {s.key}
                          </code>
                          {s.isSecret && (
                            <Badge variant="outline" className="text-[10px]">
                              secret
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {s.description}
                        </p>
                        <div className="mt-1">
                          {s.isSecret ? (
                            <span
                              className={`text-xs font-medium ${s.isSet ? "text-success" : "text-destructive"}`}
                            >
                              {s.isSet ? "✓ Configured" : "✗ Not configured"}
                            </span>
                          ) : (
                            <span className="text-xs font-mono bg-muted/40 px-2 py-0.5 rounded">
                              {s.value || "(empty)"}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => startEdit(s.key, s.value)}
                        className="shrink-0 rounded-lg border border-border bg-background px-3 py-1.5 text-xs"
                      >
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
