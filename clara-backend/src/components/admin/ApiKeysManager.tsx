"use client";
/**
 * src/components/admin/ApiKeysManager.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 1: Subscription quota enforcement, upgrade banners, key limits.
 * Phase 2: Snippet panel updated — real key prefix, tabs for HTML/React/WP/cURL.
 */

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";

// ── Types ─────────────────────────────────────────────────────────────────────

type ApiKey = {
  id: string;
  kbId: string;
  name: string;
  keyPrefix: string;
  allowedOrigins: string[];
  isActive: boolean;
  rateLimitPerHour: number;
  designEditEnabled: boolean;    // ← may call PATCH /api/embed/design
  lastUsedAt: string | null;
  createdAt: string;
  usage?: { thisHour: number; totalLast24h: number; totalLast7d: number };
};

type QuotaInfo = {
  allowed: boolean;
  current: number;
  limit: number;
  plan: string;
  planName: string;
};

type NewKeyResult = { key: ApiKey; rawKey: string };

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium border border-border bg-muted hover:bg-accent transition-colors"
    >
      {copied ? <><CheckIcon className="h-3 w-3 text-success" /> Copied!</> : <><CopyIcon className="h-3 w-3" /> {label}</>}
    </button>
  );
}

// ── QuotaBadge ────────────────────────────────────────────────────────────────

function QuotaBadge({ quota }: { quota: QuotaInfo }) {
  const unlimited = quota.limit === -1;
  const atLimit   = !unlimited && quota.current >= quota.limit;
  const remaining = unlimited ? "∞" : Math.max(0, quota.limit - quota.current);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge variant="outline" className={atLimit ? "border-destructive/40 bg-destructive/5 text-destructive text-xs" : "border-primary/30 bg-primary/5 text-primary text-xs"}>
        {quota.planName} plan
      </Badge>
      <span className="text-xs text-muted-foreground">
        {unlimited ? `${quota.current} key${quota.current !== 1 ? "s" : ""} (unlimited)` : `${quota.current} / ${quota.limit} key${quota.limit !== 1 ? "s" : ""} used`}
      </span>
      {!unlimited && !atLimit && <span className="text-xs text-muted-foreground">· {remaining} remaining</span>}
    </div>
  );
}

// ── UpgradeBanner ─────────────────────────────────────────────────────────────

function UpgradeBanner({ quota }: { quota: QuotaInfo }) {
  const noAccess = quota.limit === 0;
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 flex gap-3 items-start">
      <LockIcon className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-medium text-warning">{noAccess ? "API access not included in your plan" : "API key limit reached"}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {noAccess
            ? `The ${quota.planName} plan does not include API access. Upgrade to Starter or above to create embed keys.`
            : `You've used all ${quota.limit} keys on the ${quota.planName} plan. Upgrade to create more.`}
        </p>
      </div>
      <a href="/settings/billing" className="flex-shrink-0 inline-flex items-center rounded-lg border border-warning/40 bg-warning/10 hover:bg-warning/20 px-3 py-1.5 text-xs font-medium text-warning transition-colors">
        Upgrade →
      </a>
    </div>
  );
}

// ── RawKeyModal ───────────────────────────────────────────────────────────────

function RawKeyModal({ rawKey, onClose }: { rawKey: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-lg max-w-lg w-full p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center">
            <KeyIcon className="h-5 w-5 text-warning" />
          </div>
          <div>
            <h3 className="font-semibold text-base">Your new API key</h3>
            <p className="text-sm text-muted-foreground mt-0.5">Copy it now — it will <strong>never be shown again</strong>.</p>
          </div>
        </div>
        <div className="rounded-xl bg-muted/60 border border-border p-3 font-mono text-xs break-all select-all">{rawKey}</div>
        <div className="flex items-center gap-3">
          <CopyButton text={rawKey} label="Copy key" />
          <Button variant="default" size="sm" onClick={onClose} className="ml-auto">I&apos;ve saved it</Button>
        </div>
        <p className="text-xs text-muted-foreground bg-warning/5 border border-warning/20 rounded-lg px-3 py-2">
          ⚠️ Do not commit this key to source control. Store it as an environment variable on your site.
        </p>
      </div>
    </div>
  );
}

// ── CreateKeyModal ────────────────────────────────────────────────────────────

function CreateKeyModal({ onClose, onCreated, quota }: { onClose: () => void; onCreated: (r: NewKeyResult) => void; quota: QuotaInfo }) {
  const [name, setName]           = useState("Production");
  const [origins, setOrigins]     = useState("");
  const [rateLimit, setRateLimit] = useState(500);
  const [creating, setCreating]   = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [isUpgradeError, setIsUpgradeError] = useState(false);

  const handleCreate = async () => {
    setCreating(true); setError(null); setIsUpgradeError(false);
    try {
      const kbId = window.location.pathname.split("/kbs/")[1]?.split("/")[0];
      const res  = await fetch(apiUrl(`/api/kbs/${kbId}/api-keys`), {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ name: name.trim() || "Default", allowedOrigins: origins.split("\n").map(o => o.trim()).filter(Boolean), rateLimitPerHour: rateLimit }),
      });
      const data = (await res.json()) as { key?: ApiKey; rawKey?: string; error?: string; code?: string };
      if (res.status === 403 && data.code === "SUBSCRIPTION_LIMIT") { setIsUpgradeError(true); throw new Error(data.error ?? "Subscription limit reached"); }
      if (!res.ok || !data.rawKey) throw new Error(data.error ?? "Failed to create key");
      onCreated({ key: data.key!, rawKey: data.rawKey });
    } catch (e) { setError((e as Error).message); } finally { setCreating(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-lg max-w-md w-full p-6 space-y-5">
        <h3 className="font-semibold text-base">Create API key</h3>
        {quota.limit !== -1 && (
          <p className="text-xs text-muted-foreground bg-muted/40 border border-border rounded-lg px-3 py-2">
            {quota.planName} plan · {quota.current} / {quota.limit} keys used
          </p>
        )}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Key name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Production / Staging / Partner"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Allowed origins <span className="text-muted-foreground font-normal">(one per line, empty = any)</span></label>
            <textarea value={origins} onChange={e => setOrigins(e.target.value)} placeholder={"https://yoursite.com\nhttps://app.yoursite.com\n*.yoursite.com"} rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
            <p className="text-xs text-muted-foreground mt-1">Wildcard: <code>*.example.com</code></p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Rate limit (req/hour, 0 = unlimited)</label>
            <input type="number" min={0} value={rateLimit} onChange={e => setRateLimit(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        {error && (
          <div className={`text-sm rounded-lg px-3 py-2 border ${isUpgradeError ? "text-warning bg-warning/5 border-warning/20" : "text-destructive bg-destructive/5 border-destructive/20"}`}>
            <p>{error}</p>
            {isUpgradeError && <a href="/settings/billing" className="mt-2 inline-block text-xs font-medium underline">View upgrade options →</a>}
          </div>
        )}
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleCreate} disabled={creating}>{creating ? "Creating…" : "Create key"}</Button>
        </div>
      </div>
    </div>
  );
}

// ── EditKeyModal ─────────────────────────────────────────────────────────────

function EditKeyModal({ kbId, apiKey, onClose, onUpdated }: {
  kbId: string; apiKey: ApiKey; onClose: () => void; onUpdated: (k: ApiKey) => void;
}) {
  const [name, setName]             = useState(apiKey.name);
  const [origins, setOrigins]       = useState(apiKey.allowedOrigins.join("\n"));
  const [rateLimit, setRate]        = useState(apiKey.rateLimitPerHour);
  const [designEdit, setDesignEdit] = useState(apiKey.designEditEnabled);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [saved, setSaved]           = useState(false);

  const handleSave = async () => {
    setSaving(true); setError(null); setSaved(false);
    try {
      const res = await fetch(apiUrl(`/api/kbs/${kbId}/api-keys/${apiKey.id}`), {
        method: "PATCH",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          name: name.trim() || apiKey.name,
          allowedOrigins: origins.split("\n").map(o => o.trim()).filter(Boolean),
          rateLimitPerHour: rateLimit,
          designEditEnabled: designEdit,
        }),
      });
      const data = (await res.json()) as { key?: ApiKey; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update key");
      onUpdated(data.key!);
      setSaved(true);
      setTimeout(onClose, 700);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-lg max-w-md w-full p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base">Edit API key</h3>
          <code className="text-xs font-mono bg-muted/60 px-2 py-1 rounded text-muted-foreground">{apiKey.keyPrefix}…</code>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Key name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Allowed origins <span className="font-normal text-muted-foreground">(one per line, empty = any)</span></label>
            <textarea value={origins} onChange={e => setOrigins(e.target.value)} rows={4}
              placeholder={"https://yoursite.com\nhttp://localhost:8080\n*.yoursite.com"}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
            <p className="text-xs text-muted-foreground mt-1">Include <code className="bg-muted px-1 rounded">http://localhost:PORT</code> for local development.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Rate limit (req/hour, 0 = unlimited)</label>
            <input type="number" min={0} value={rateLimit} onChange={e => setRate(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          {/* ── Design API permission ── */}
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Allow widget design editing</p>
                <p className="text-xs text-muted-foreground mt-0.5">Lets this key call <code className="bg-muted px-1 rounded">PATCH /api/embed/design</code> to update widget appearance remotely from any framework.</p>
              </div>
              <button onClick={() => setDesignEdit(v => !v)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
                  designEdit ? "bg-indigo-600" : "bg-muted-foreground/30"
                }`}>
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  designEdit ? "translate-x-4" : "translate-x-1"
                }`} />
              </button>
            </div>
            {designEdit && (
              <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                ⚠️ Only enable on trusted production keys. This allows your site to change the widget's visual appearance via API.
              </p>
            )}
          </div>
        </div>
        {error && <p className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">{error}</p>}
        {saved  && <p className="text-sm text-success bg-success/5 border border-success/20 rounded-lg px-3 py-2">✔ Saved!</p>}
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </div>
      </div>
    </div>
  );
}

// ── SnippetPanel (Phase 3) ────────────────────────────────────────────────────
// Tabs: Script tag | iFrame | React / Next.js | Vue | WordPress | REST API | Design API

type SnippetTab = "script" | "iframe" | "react" | "vue" | "wordpress" | "curl" | "design";

function SnippetPanel({ baseUrl, keyPrefix, designEditEnabled }: {
  baseUrl: string; keyPrefix: string; designEditEnabled: boolean;
}) {
  const [tab, setTab] = useState<SnippetTab>("script");

  const tabs: { id: SnippetTab; label: string; locked?: boolean }[] = [
    { id: "script",    label: "Script tag" },
    { id: "iframe",    label: "iFrame" },
    { id: "react",     label: "React / Next.js" },
    { id: "vue",       label: "Vue / Nuxt" },
    { id: "wordpress", label: "WordPress" },
    { id: "curl",      label: "REST API" },
    { id: "design",    label: "Design API", locked: !designEditEnabled },
  ];

  const snippets: Record<SnippetTab, { description: string; code: string; lang: string }> = {
    script: {
      description: "Floating chat button — paste before </body>. Works with any tech stack.",
      lang: "html",
      code:
`<!-- Clara AI Widget -->
<script
  src="${baseUrl}/embed/clara.js"
  data-key="YOUR_FULL_API_KEY"
  data-position="bottom-right"
  data-theme="light"
  async
></script>`,
    },
    iframe: {
      description: "Inline chat window — embed anywhere in your page layout.",
      lang: "html",
      code:
`<iframe
  src="${baseUrl}/embed/widget?key=YOUR_FULL_API_KEY"
  width="400"
  height="600"
  style="border:none;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.12);"
  allow="microphone"
  title="Clara AI Assistant"
></iframe>`,
    },
    react: {
      description: "React / Next.js — loads the widget script once on mount.",
      lang: "tsx",
      code:
`// components/ClaraWidget.tsx
"use client";
import { useEffect } from "react";

export function ClaraWidget() {
  useEffect(() => {
    if (document.querySelector('script[data-clara]')) return;
    const s  = document.createElement("script");
    s.src    = "${baseUrl}/embed/clara.js";
    s.async  = true;
    s.setAttribute("data-key",      "YOUR_FULL_API_KEY");
    s.setAttribute("data-position", "bottom-right");
    s.setAttribute("data-theme",    "light");
    s.setAttribute("data-clara",    "1");
    document.body.appendChild(s);
    return () => { document.body.removeChild(s); };
  }, []);
  return null;
}

// Usage: add <ClaraWidget /> anywhere in your layout.tsx`,
    },
    wordpress: {
      description: "WordPress — add to your theme's functions.php or a custom plugin.",
      lang: "php",
      code:
`<?php
// Add to functions.php or a custom plugin
function clara_widget_script() {
    echo '<script
      src="${baseUrl}/embed/clara.js"
      data-key="YOUR_FULL_API_KEY"
      data-position="bottom-right"
      data-theme="light"
      async
    ></script>';
}
add_action( 'wp_footer', 'clara_widget_script' );`,
    },
    vue: {
      description: "Vue 3 / Nuxt — composable that loads the widget once and cleans up on unmount.",
      lang: "ts",
      code:
`// composables/useClaraWidget.ts
import { onMounted, onUnmounted } from 'vue';

export function useClaraWidget() {
  let scriptEl: HTMLScriptElement | null = null;

  onMounted(() => {
    if (document.querySelector('script[data-clara]')) return;
    scriptEl = document.createElement('script');
    scriptEl.src   = '${baseUrl}/embed/clara.js';
    scriptEl.async = true;
    scriptEl.dataset.key      = 'YOUR_FULL_API_KEY';
    scriptEl.dataset.position = 'bottom-right';
    scriptEl.dataset.theme    = 'light';
    scriptEl.dataset.clara    = '1';
    document.body.appendChild(scriptEl);
  });

  onUnmounted(() => {
    scriptEl?.remove();
  });
}

// Usage: call useClaraWidget() in any component or layout
// <script setup>
// import { useClaraWidget } from '~/composables/useClaraWidget';
// useClaraWidget();
// </script>`,
    },
    curl: {
      description: "REST API — integrate directly from your own backend or custom UI.",
      lang: "bash",
      code:
`# Chat (streaming NDJSON)
curl -X POST ${baseUrl}/api/embed/chat \\
  -H "Authorization: Bearer YOUR_FULL_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"user","content":"Hello!"}]}'

# Config / branding
curl ${baseUrl}/api/embed/config \\
  -H "Authorization: Bearer YOUR_FULL_API_KEY"

# Voice session token
curl -X POST ${baseUrl}/api/embed/session \\
  -H "Authorization: Bearer YOUR_FULL_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{}'`,
    },
    design: {
      description: "Design API — update widget appearance from your own codebase. Requires design-edit permission on this key.",
      lang: "ts",
      code: designEditEnabled
        ? `// ===== Design API — update widget appearance remotely =====
// Works from ANY framework: React, Vue, Next.js, Nuxt, Svelte, vanilla JS.
// Only visual fields are accepted — AI behaviour is never changeable via this API.

const CLARA_API   = '${baseUrl}/api/embed/design';
const CLARA_KEY   = 'YOUR_FULL_API_KEY';   // store in env, never commit

// ── Read current design ──
const getDesign = async () => {
  const res = await fetch(CLARA_API, {
    headers: { Authorization: 'Bearer ' + CLARA_KEY },
  });
  return res.json();
};

// ── Update design (partial patch) ──
const updateDesign = async (patch: Record<string, unknown>) => {
  const res = await fetch(CLARA_API, {
    method:  'PATCH',
    headers: { Authorization: 'Bearer ' + CLARA_KEY, 'Content-Type': 'application/json' },
    body:    JSON.stringify(patch),
  });
  return res.json();
};

// ── Example: switch to dark mode + change brand colour ──
await updateDesign({
  widgetTheme:      'dark',
  primaryColour:    '#7c3aed',
  accentColour:     '#a78bfa',
  widgetBorderRadius: 24,
  widgetChatHeight: 620,
  widgetShowBranding: false,
  widgetLauncherLabel: 'Ask us anything',
});

// ── Allowed fields ──
// primaryColour | accentColour
// widgetTheme (light|dark) | widgetPosition (bottom-right|bottom-left)
// widgetButtonSize (40–80) | widgetBorderRadius (0–40)
// widgetChatHeight (300–900) | widgetFontFamily
// widgetShowBranding | widgetLauncherLabel
// assistantName | welcomeMessage | avatarUrl (https only)`
        : `// Design API is not enabled for this key.\n//\n// Go to the Deploy tab → Edit this key → enable\n// "Allow widget design editing" to unlock this tab.`,
    },
  };

  const active = snippets[tab]!;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Replace <code className="bg-muted px-1 rounded">YOUR_FULL_API_KEY</code> with your complete key.
        Your prefix is <code className="bg-muted px-1 rounded font-mono">{keyPrefix}…</code> — the full key was shown once at creation.
      </p>

      {/* Tab bar */}
      <div className="flex gap-1 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            title={t.locked ? "Enable \'Allow widget design editing\' on this key to unlock" : undefined}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : t.locked
                ? "bg-muted/50 text-muted-foreground/40 cursor-not-allowed"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {t.label}{t.locked ? " 🔒" : ""}
          </button>
        ))}
      </div>

      {/* Snippet block */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-2.5 bg-muted/40 border-b border-border flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{active.description}</p>
          <CopyButton text={active.code} label="Copy" />
        </div>
        <pre className="p-4 text-xs font-mono text-foreground/80 overflow-x-auto whitespace-pre bg-muted/20">
          <code>{active.code}</code>
        </pre>
      </div>

      {/* Quick-start note */}
      {tab === "script" && (
        <p className="text-xs text-muted-foreground bg-muted/30 border border-border rounded-lg px-3 py-2">
          💡 The widget auto-detects your branding from the KB config — no extra setup needed.
          Use <code>data-position=&quot;bottom-left&quot;</code> or <code>data-theme=&quot;dark&quot;</code> to customise.
        </p>
      )}
      {tab === "design" && designEditEnabled && (
        <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-3 py-2.5 space-y-1">
          <p className="text-xs font-medium text-indigo-400">✨ Design API is enabled for this key</p>
          <p className="text-xs text-muted-foreground">Changes via <code className="bg-muted px-1 rounded">PATCH /api/embed/design</code> take effect immediately — live for all visitors within seconds. Only widget appearance fields are accepted. AI behaviour (prompts, model, rules) can only be changed from the admin panel.</p>
        </div>
      )}
      {tab === "design" && !designEditEnabled && (
        <p className="text-xs text-muted-foreground bg-muted/30 border border-border rounded-lg px-3 py-2">
          🔒 Design API is locked. Edit this key and enable &quot;Allow widget design editing&quot; to unlock these snippets.
        </p>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ApiKeysManager({ kbId }: { kbId: string }) {
  const [keys, setKeys]                     = useState<ApiKey[]>([]);
  const [quota, setQuota]                   = useState<QuotaInfo | null>(null);
  const [loading, setLoading]               = useState(true);
  const [showCreate, setShowCreate]         = useState(false);
  const [newKeyResult, setNewKeyResult]     = useState<NewKeyResult | null>(null);
  const [showSnippetFor, setShowSnippetFor] = useState<string | null>(null);
  const [revoking, setRevoking]             = useState<string | null>(null);
  const [editingKey, setEditingKey]         = useState<ApiKey | null>(null);

  const baseUrl = typeof window !== "undefined" ? `${window.location.protocol}//${window.location.host}` : "";

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(apiUrl(`/api/kbs/${kbId}/api-keys`), { headers: withAuthHeaders() });
      const data = (await res.json()) as { keys?: ApiKey[]; quota?: QuotaInfo };
      setKeys(data.keys ?? []);
      if (data.quota) setQuota(data.quota);
    } catch { setKeys([]); } finally { setLoading(false); }
  }, [kbId]);

  useEffect(() => { void loadKeys(); }, [loadKeys]);

  const handleCreated = useCallback((result: NewKeyResult) => {
    setShowCreate(false);
    setNewKeyResult(result);
    setKeys(prev => [...prev, result.key]);
    setQuota(prev => prev ? { ...prev, current: prev.current + 1 } : prev);
  }, []);

  const handleUpdated = useCallback((updated: ApiKey) => {
    setKeys(prev => prev.map(k => k.id === updated.id ? updated : k));
    setEditingKey(null);
  }, []);

  const handleRevoke = useCallback(async (keyId: string) => {
    if (!confirm("Revoke this key? Any websites using it will immediately lose access.")) return;
    setRevoking(keyId);
    try {
      await fetch(apiUrl(`/api/kbs/${kbId}/api-keys/${keyId}`), { method: "DELETE", headers: withAuthHeaders() });
      setKeys(prev => prev.filter(k => k.id !== keyId));
      setQuota(prev => prev ? { ...prev, current: Math.max(0, prev.current - 1) } : prev);
    } finally { setRevoking(null); }
  }, [kbId]);

  const atLimit  = quota ? (!quota.allowed && quota.current >= quota.limit && quota.limit !== -1) : false;
  const noAccess = quota ? quota.limit === 0 : false;
  const canCreate = quota ? quota.allowed : false;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold">Deploy &amp; Embed</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Generate API keys to embed this assistant on any website. Zero backend setup.</p>
          {quota && !loading && <div className="mt-2"><QuotaBadge quota={quota} /></div>}
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} disabled={!canCreate}
          title={!canCreate && quota ? `${quota.planName} plan limit reached` : undefined}>
          <PlusIcon className="h-3.5 w-3.5 mr-1.5" /> New key
        </Button>
      </div>

      {/* Banners */}
      {quota && (atLimit || noAccess) && !loading && <UpgradeBanner quota={quota} />}
      {quota && canCreate && !loading && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 flex gap-3">
          <InfoIcon className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-sm text-primary/80">
            Each key is tied to this knowledge base only.{" "}
            {quota.limit === -1 ? "Your Enterprise plan supports unlimited keys." : `Your ${quota.planName} plan supports up to ${quota.limit} active key${quota.limit !== 1 ? "s" : ""}.`}
          </p>
        </div>
      )}

      {/* Keys list */}
      {loading ? (
        <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-20 rounded-xl bg-muted/30 animate-pulse" />)}</div>
      ) : keys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <KeyIcon className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Create your first key to start embedding.</p>
          {canCreate && <Button size="sm" variant="outline" className="mt-4" onClick={() => setShowCreate(true)}>Create first key</Button>}
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map(key => (
            <div key={key.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{key.name}</span>
                    {key.isActive
                      ? <Badge variant="outline" className="text-success border-success/30 bg-success/5 text-xs">Active</Badge>
                      : <Badge variant="outline" className="text-muted-foreground text-xs">Revoked</Badge>}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <code className="text-xs font-mono bg-muted/60 px-2 py-0.5 rounded text-muted-foreground">
                      {key.keyPrefix}••••••••••••••••••••••••••••••••••••
                    </code>
                    {key.designEditEnabled && (
                      <Badge variant="outline" className="text-xs border-indigo-500/30 bg-indigo-500/5 text-indigo-400">
                        Design API ✨
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                    {key.allowedOrigins.length > 0
                      ? <span>🔒 {key.allowedOrigins.slice(0,2).join(", ")}{key.allowedOrigins.length > 2 ? ` +${key.allowedOrigins.length - 2}` : ""}</span>
                      : <span>🌐 Any origin</span>}
                    <span>⚡ {key.rateLimitPerHour === 0 ? "Unlimited" : `${key.rateLimitPerHour}/hr`}</span>
                    {key.usage && (<><span>📊 {key.usage.thisHour} this hour</span><span>{key.usage.totalLast24h} today</span><span>{key.usage.totalLast7d} this week</span></>)}
                    {key.lastUsedAt && <span>Last used {new Date(key.lastUsedAt).toLocaleDateString()}</span>}
                  </div>
                </div>
                {key.isActive && (
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => setEditingKey(key)} className="text-xs">
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowSnippetFor(showSnippetFor === key.id ? null : key.id)} className="text-xs">
                      {showSnippetFor === key.id ? "Hide snippet" : "Get snippet"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleRevoke(key.id)} disabled={revoking === key.id}
                      className="text-destructive hover:text-destructive hover:bg-destructive/5 text-xs">
                      {revoking === key.id ? "Revoking…" : "Revoke"}
                    </Button>
                  </div>
                )}
              </div>

              {/* Snippet panel — Phase 2: tabbed, with real key prefix */}
              {showSnippetFor === key.id && (
                <div className="mt-4 pt-4 border-t border-border">
                  <SnippetPanel baseUrl={baseUrl} keyPrefix={key.keyPrefix} designEditEnabled={key.designEditEnabled} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreate && quota && <CreateKeyModal onClose={() => setShowCreate(false)} onCreated={handleCreated} quota={quota} />}
      {editingKey && <EditKeyModal kbId={kbId} apiKey={editingKey} onClose={() => setEditingKey(null)} onUpdated={handleUpdated} />}
      {newKeyResult && <RawKeyModal rawKey={newKeyResult.rawKey} onClose={() => setNewKeyResult(null)} />}
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function KeyIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>;
}
function PlusIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;
}
function CopyIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>;
}
function CheckIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>;
}
function InfoIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}
function LockIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>;
}
