"use client";
/**
 * src/components/admin/ApiKeysManager.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * API Keys management UI for a Knowledge Base.
 * Shows in the KB dashboard as the "Deploy" tab.
 *
 * Features:
 *   - List all API keys with usage stats
 *   - Create new key (show raw key exactly once in a modal)
 *   - Revoke key
 *   - Copy embed snippet (iFrame + script tag)
 *   - Set allowed origins and rate limits
 */

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ── Types ─────────────────────────────────────────────────────────────────────

type ApiKey = {
  id: string;
  kbId: string;
  name: string;
  keyPrefix: string;
  allowedOrigins: string[];
  isActive: boolean;
  rateLimitPerHour: number;
  lastUsedAt: string | null;
  createdAt: string;
  usage?: {
    thisHour: number;
    totalLast24h: number;
    totalLast7d: number;
  };
};

type NewKeyResult = {
  key: ApiKey;
  rawKey: string;
};

// ── Sub-components ────────────────────────────────────────────────────────────

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium border border-border bg-muted hover:bg-accent transition-colors"
    >
      {copied ? (
        <><CheckIcon className="h-3 w-3 text-success" /> Copied!</>
      ) : (
        <><CopyIcon className="h-3 w-3" /> {label}</>
      )}
    </button>
  );
}

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
            <p className="text-sm text-muted-foreground mt-0.5">
              Copy it now — it will <strong>never be shown again</strong>.
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-muted/60 border border-border p-3 font-mono text-xs break-all select-all">
          {rawKey}
        </div>

        <div className="flex items-center gap-3">
          <CopyButton text={rawKey} label="Copy key" />
          <Button variant="default" size="sm" onClick={onClose} className="ml-auto">
            I&apos;ve saved it
          </Button>
        </div>

        <p className="text-xs text-muted-foreground bg-warning/5 border border-warning/20 rounded-lg px-3 py-2">
          ⚠️ This key grants access to your knowledge base. Do not commit it to source control. Add it to your site as an environment variable.
        </p>
      </div>
    </div>
  );
}

function CreateKeyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (result: NewKeyResult) => void;
}) {
  const [name, setName]         = useState("Production");
  const [origins, setOrigins]   = useState("");
  const [rateLimit, setRateLimit] = useState(500);
  const [creating, setCreating] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      // kbId is injected via the parent — we get it via the URL
      const kbId = window.location.pathname.split("/kbs/")[1]?.split("/")[0];
      const res = await fetch(`/api/kbs/${kbId}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim() || "Default",
          allowedOrigins: origins
            .split("\n")
            .map((o) => o.trim())
            .filter(Boolean),
          rateLimitPerHour: rateLimit,
        }),
      });
      const data = (await res.json()) as { key?: ApiKey; rawKey?: string; error?: string };
      if (!res.ok || !data.rawKey) throw new Error(data.error ?? "Failed to create key");
      onCreated({ key: data.key!, rawKey: data.rawKey });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-lg max-w-md w-full p-6 space-y-5">
        <h3 className="font-semibold text-base">Create API key</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Key name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Production / Staging / Partner"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Allowed origins <span className="text-muted-foreground font-normal">(one per line, empty = any)</span>
            </label>
            <textarea
              value={origins}
              onChange={(e) => setOrigins(e.target.value)}
              placeholder={"https://yoursite.com\nhttps://app.yoursite.com\n*.yoursite.com"}
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1">Restrict which domains can use this key. Wildcard: <code>*.example.com</code></p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Rate limit (requests/hour, 0 = unlimited)
            </label>
            <input
              type="number"
              min={0}
              value={rateLimit}
              onChange={(e) => setRateLimit(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-3 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleCreate} disabled={creating}>
            {creating ? "Creating…" : "Create key"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SnippetPanel({ rawKey, baseUrl }: { rawKey?: string; baseUrl: string }) {
  const key = rawKey ?? "YOUR_API_KEY";

  const iframeSnippet = `<iframe
  src="${baseUrl}/embed/widget?key=${key}"
  width="400"
  height="600"
  style="border:none;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.12);"
  allow="microphone"
></iframe>`;

  const scriptSnippet = `<script
  src="${baseUrl}/embed/clara.js"
  data-key="${key}"
  data-position="bottom-right"
  async
></script>`;

  const curlSnippet = `curl -X POST ${baseUrl}/api/embed/chat \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"user","content":"Hello!"}]}'`;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Choose how to embed Clara on your website. No backend configuration needed — just paste the snippet.
      </p>

      <SnippetBlock title="iFrame embed" description="Paste inside any HTML page. Works with any tech stack." code={iframeSnippet} />
      <SnippetBlock title="Script tag (floating button)" description="Adds a floating chat button to your site automatically." code={scriptSnippet} />
      <SnippetBlock title="REST API (direct integration)" description="Call from your own UI or backend. Full streaming support." code={curlSnippet} lang="bash" />
    </div>
  );
}

function SnippetBlock({ title, description, code, lang = "html" }: {
  title: string; description: string; code: string; lang?: string;
}) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-2.5 bg-muted/40 border-b border-border flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
        <CopyButton text={code} label="Copy" />
      </div>
      <pre className="p-4 text-xs font-mono text-foreground/80 overflow-x-auto whitespace-pre-wrap bg-muted/20">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ApiKeysManager({ kbId }: { kbId: string }) {
  const [keys, setKeys]                     = useState<ApiKey[]>([]);
  const [loading, setLoading]               = useState(true);
  const [showCreate, setShowCreate]         = useState(false);
  const [newKeyResult, setNewKeyResult]     = useState<NewKeyResult | null>(null);
  const [showSnippetFor, setShowSnippetFor] = useState<string | null>(null);
  const [revoking, setRevoking]             = useState<string | null>(null);

  const baseUrl =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.host}`
      : "";

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/kbs/${kbId}/api-keys`, { credentials: "include" });
      const data = (await res.json()) as { keys?: ApiKey[] };
      setKeys(data.keys ?? []);
    } catch {
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, [kbId]);

  useEffect(() => { void loadKeys(); }, [loadKeys]);

  const handleCreated = useCallback((result: NewKeyResult) => {
    setShowCreate(false);
    setNewKeyResult(result);
    setKeys((prev) => [...prev, result.key]);
  }, []);

  const handleRevoke = useCallback(async (keyId: string) => {
    if (!confirm("Revoke this key? Any websites using it will immediately lose access.")) return;
    setRevoking(keyId);
    try {
      await fetch(`/api/kbs/${kbId}/api-keys/${keyId}`, { method: "DELETE", credentials: "include" });
      setKeys((prev) => prev.filter((k) => k.id !== keyId));
    } finally {
      setRevoking(null);
    }
  }, [kbId]);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Deploy &amp; Embed</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Generate API keys to embed this assistant on any website. Zero backend setup — just paste a snippet.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <PlusIcon className="h-3.5 w-3.5 mr-1.5" />
          New key
        </Button>
      </div>

      {/* Info banner */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 flex gap-3">
        <InfoIcon className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
        <p className="text-sm text-primary/80">
          Each key is tied to this knowledge base only. Organisation members can create multiple keys for different environments (production, staging, partner sites).
        </p>
      </div>

      {/* Keys list */}
      {loading ? (
        <div className="space-y-3">
          {[1,2].map((i) => <div key={i} className="h-20 rounded-xl bg-muted/30 animate-pulse" />)}
        </div>
      ) : keys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <KeyIcon className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Create your first key to start embedding.</p>
          <Button size="sm" variant="outline" className="mt-4" onClick={() => setShowCreate(true)}>
            Create first key
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map((key) => (
            <div key={key.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{key.name}</span>
                    {key.isActive ? (
                      <Badge variant="outline" className="text-success border-success/30 bg-success/5 text-xs">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground text-xs">Revoked</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <code className="text-xs font-mono bg-muted/60 px-2 py-0.5 rounded text-muted-foreground">
                      {key.keyPrefix}••••••••••••••••••••••••••••••••••••
                    </code>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                    {key.allowedOrigins.length > 0 ? (
                      <span>🔒 {key.allowedOrigins.slice(0,2).join(", ")}{key.allowedOrigins.length > 2 ? ` +${key.allowedOrigins.length - 2}` : ""}</span>
                    ) : (
                      <span>🌐 Any origin</span>
                    )}
                    <span>⚡ {key.rateLimitPerHour === 0 ? "Unlimited" : `${key.rateLimitPerHour}/hr`}</span>
                    {key.usage && (
                      <>
                        <span>📊 {key.usage.thisHour} this hour</span>
                        <span>{key.usage.totalLast24h} today</span>
                        <span>{key.usage.totalLast7d} this week</span>
                      </>
                    )}
                    {key.lastUsedAt && (
                      <span>Last used {new Date(key.lastUsedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                {key.isActive && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowSnippetFor(showSnippetFor === key.id ? null : key.id)}
                      className="text-xs"
                    >
                      {showSnippetFor === key.id ? "Hide snippet" : "Get snippet"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevoke(key.id)}
                      disabled={revoking === key.id}
                      className="text-destructive hover:text-destructive hover:bg-destructive/5 text-xs"
                    >
                      {revoking === key.id ? "Revoking…" : "Revoke"}
                    </Button>
                  </div>
                )}
              </div>

              {/* Snippet panel */}
              {showSnippetFor === key.id && (
                <div className="mt-4 pt-4 border-t border-border">
                  <SnippetPanel baseUrl={baseUrl} />
                  <p className="text-xs text-muted-foreground mt-3">
                    Replace <code className="bg-muted px-1 rounded">YOUR_API_KEY</code> with:{" "}
                    <code className="bg-muted px-1 rounded font-mono">{key.keyPrefix}…</code>{" "}
                    (regenerate if you need the full key)
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateKeyModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}

      {newKeyResult && (
        <RawKeyModal
          rawKey={newKeyResult.rawKey}
          onClose={() => setNewKeyResult(null)}
        />
      )}

    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
