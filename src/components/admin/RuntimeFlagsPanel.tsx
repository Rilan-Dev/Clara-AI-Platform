"use client";

/**
 * System Status → "Runtime configuration": read-only view of switches that
 * are set only through environment variables, so operators can see the
 * behaviour they are actually getting (e.g. quota fail-open, virus scanning).
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, SlidersHorizontal } from "lucide-react";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";
import { LoadError } from "@/components/ui/load-error";
import type { RuntimeFlagGroup } from "@/lib/runtime-flags";

export function RuntimeFlagsPanel() {
  const [groups, setGroups] = useState<RuntimeFlagGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>("payments");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/platform/runtime-flags"), { headers: withAuthHeaders() });
      const body = (await res.json().catch(() => ({}))) as { groups?: RuntimeFlagGroup[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setGroups(body.groups ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const attention = groups?.flatMap((g) => g.flags).filter((f) => f.attention) ?? [];

  return (
    <section aria-labelledby="runtime-flags-title" className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <SlidersHorizontal className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <h2 id="runtime-flags-title" className="text-sm font-semibold text-foreground">Runtime configuration</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Behaviour set by deployment environment variables. Read-only here — change them in your hosting
            environment, or in{" "}
            <a href="/settings/environment" className="text-primary hover:underline">Settings → Environment</a>{" "}
            where supported.
          </p>
        </div>
      </div>

      {error && <LoadError className="mt-4" message="Runtime configuration couldn't be loaded." detail={error} onRetry={() => void load()} />}

      {attention.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {attention.map((f) => (
            <li key={f.key} className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
              <span><span className="font-medium">{f.label}: {f.value}.</span> {f.note}</span>
            </li>
          ))}
        </ul>
      )}

      {groups && (
        <div className="mt-4 divide-y divide-border rounded-xl border border-border">
          {groups.map((g) => {
            const expanded = open === g.id;
            return (
              <div key={g.id}>
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : g.id)}
                  aria-expanded={expanded}
                  aria-controls={`flags-${g.id}`}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
                >
                  {g.title}
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden />
                </button>
                {expanded && (
                  <dl id={`flags-${g.id}`} className="grid gap-x-6 gap-y-3 px-4 pb-4 sm:grid-cols-2">
                    {g.flags.map((f) => (
                      <div key={f.key} className="min-w-0">
                        <dt className="text-xs text-muted-foreground">{f.label}</dt>
                        <dd className="text-sm text-foreground break-words">
                          {f.value}
                          {f.isDefault && <span className="ml-1.5 text-xs text-muted-foreground">(default)</span>}
                        </dd>
                        <dd className="font-mono text-[11px] text-muted-foreground">{f.key}</dd>
                        {f.note && !f.attention && <dd className="text-xs text-muted-foreground">{f.note}</dd>}
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
