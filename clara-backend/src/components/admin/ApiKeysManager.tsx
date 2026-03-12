"use client";
/**
 * src/components/admin/ApiKeysManager.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * API Keys management UI for a Knowledge Base — "Deploy" tab.
 *
 * Phase 1 additions:
 *   - Subscription quota fetched from GET /api/kbs/[kbId]/api-keys
 *   - Quota badge + plan name shown in header
 *   - "New key" button disabled when at limit, shows upgrade CTA banner
 *   - CreateKeyModal surfaces 403 subscription errors with upgrade prompt
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
  lastUsedAt: string | null;
  createdAt: string;
  usage?: {
    thisHour: number;
    totalLast24h: number;
    totalLast7d: number;
  };
};

type QuotaInfo = {
  allowed: boolean;
  current: number;
  limit: number;     // -1 = unlimited
  plan: string;
  planName: string;
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

function QuotaBadge({ quota }: { quota: QuotaInfo }) {
  const isUnlimited = quota.limit === -1;
  const isAtLimit   = !isUnlimited && quota.current >= quota.limit;
  const remaining   = isUnlimited ? "∞" : Math.max(0, quota.limit - quota.current);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge
        variant="outline"
        className={
          isAtLimit
            ? "border-destructive/40 bg-destructive/5 text-destructive text-xs"
            : "border-primary/30 bg-primary/5 text-primary text-xs"
        }
      >
        {quota.planName} plan
      </Badge>
      <span className="text-xs text-muted-foreground">
        {isUnlimited
          ? `${quota.current} key${quota.current !== 1 ? "s" : ""} (unlimited)`
          : `${quota.current} / ${quota.limit} key${quota.limit !== 1 ? "s" : ""} used`}
      </span>
      {!isUnlimited && !isAtLimit && (
        <span className="text-xs text-muted-foreground">· {remaining} remaining</span>
      )}
    </div>
  );
}

function UpgradeBanner({ quota }: { quota: QuotaInfo }) {
  const isNoAccess = quota.limit === 0;
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 flex gap-3 items-start">
      <LockIcon className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-medium text-warning">
          {isNoAccess ? "API access not included in your plan" : "API key limit reached"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isNoAccess
            ? `The ${quota.planName} plan does not include API access. Upgrade to Starter or above to create embed keys.`
            : `You've used all ${quota.limit} keys available on the ${quota.planName} plan. Upgrade to create more.`}
        </p>
      </div>
      <a
        href="/settings/billing"
        className="flex-shrink-0 inline-flex items-center rounded-lg border border-warning/40 bg-warning/10 hover:bg-warning/20 px-3 py-1.5 text-xs font-medium text-warning transition-colors"
      >
        Upgrade plan →
      </a>
    </div>
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
