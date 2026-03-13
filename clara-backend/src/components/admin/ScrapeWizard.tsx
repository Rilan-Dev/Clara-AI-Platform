"use client";
/**
 * src/components/admin/ScrapeWizard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Web Scrape Wizard — 4-phase UI
 *
 *  Phase 1 — Discover        URL input (idle) or live discovery progress
 *  Phase 2 — Review          URL checklist with include/exclude toggles
 *  Phase 3 — Scraping        Live scrape progress (polls every 2 s)
 *  Phase 4 — Done / Error    Summary or retry
 *
 * Key UX improvements:
 *  - Auto-resumes in-flight sessions on page load (user can close & return)
 *  - Discovery shows a live crawl progress bar + URL counter + elapsed timer
 *  - "You can leave — your job keeps running" messaging throughout
 *  - Scrape tab shows a live banner so status is visible from any tab
 */

import { useState, useMemo } from "react";
import { useScrapeWizard } from "@/modules/admin-ui/hooks";
import type { ScrapeUrl, DiscoverProgress } from "@/modules/admin-ui/api";
import { Button } from "@/components/ui/button";

// ─── Shared Icons ──────────────────────────────────────────────────────────────

function GlobeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  );
}

function SpinnerIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function DepthBadge({ depth }: { depth: number }) {
  const styles = [
    "bg-blue-500/15 text-blue-400 border-blue-500/20",
    "bg-violet-500/15 text-violet-400 border-violet-500/20",
    "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    "bg-amber-500/15 text-amber-400 border-amber-500/20",
  ];
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${styles[Math.min(depth, styles.length - 1)]}`}>
      D{depth}
    </span>
  );
}

function shortUrl(url: string) {
  try {
    const u = new URL(url);
    const tail = u.pathname.replace(/\/$/, "").split("/").filter(Boolean).slice(-2).join("/");
    return tail ? `${u.hostname}/…/${tail}` : u.hostname;
  } catch { return url; }
}

function formatMs(ms: number | null): string {
  if (ms === null) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ─── Step 1a — Discover Form ───────────────────────────────────────────────────

function DiscoverForm({ onDiscover, discovering }: {
  onDiscover: (url: string, opts: { maxDepth: number; maxUrls: number; scopeToInputPath: boolean }) => void;
  discovering: boolean;
}) {
  const [url, setUrl]           = useState("");
  const [maxDepth, setMaxDepth] = useState(3);
  const [maxUrls, setMaxUrls]   = useState(200);
  const [scoped, setScoped]     = useState(true);
  const [showAdv, setShowAdv]   = useState(false);
  const [urlError, setUrlError] = useState("");

  function submit() {
    setUrlError("");
    const t = url.trim();
    if (!t) { setUrlError("Please enter a URL"); return; }
    try { new URL(t); } catch { setUrlError("Enter a valid URL including https://"); return; }
    onDiscover(t, { maxDepth, maxUrls, scopeToInputPath: scoped });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4 rounded-xl border border-border bg-muted/20 px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <GlobeIcon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-medium text-foreground">Import from a website</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Clara will crawl all pages under that path in the background and extract clean content — you can close this tab and come back later.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Website URL</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <GlobeIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input type="url" placeholder="https://docs.example.com/guide/"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setUrlError(""); }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              disabled={discovering}
              className={`w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 transition-colors ${urlError ? "border-destructive" : "border-border"}`}
            />
          </div>
          <Button onClick={submit} disabled={discovering || !url.trim()} className="shrink-0 gap-2">
            {discovering ? <><SpinnerIcon className="h-3.5 w-3.5" />Discovering…</> : "Discover URLs"}
          </Button>
        </div>
        {urlError && <p className="text-xs text-destructive">{urlError}</p>}
        <p className="text-xs text-muted-foreground">
          Tip — use a sub-path like <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">/guide/</code> to only crawl that section.
        </p>
      </div>

      <div>
        <button type="button" onClick={() => setShowAdv((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
          <svg className={`h-3.5 w-3.5 transition-transform ${showAdv ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Advanced options
        </button>
        {showAdv && (
          <div className="mt-3 grid grid-cols-1 gap-4 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Max Depth</label>
              <select value={maxDepth} onChange={(e) => setMaxDepth(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
                {[1,2,3,4,5].map((n) => <option key={n} value={n}>Depth {n}{n===3?" (default)":""}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Max Pages</label>
              <select value={maxUrls} onChange={(e) => setMaxUrls(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
                {[50,100,200,500,1000].map((n) => <option key={n} value={n}>{n} pages{n===200?" (default)":""}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Crawl Scope</label>
              <div className="flex items-center gap-2.5 pt-1.5">
                <button type="button" role="switch" aria-checked={scoped} onClick={() => setScoped((v) => !v)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${scoped ? "bg-primary" : "bg-muted"}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${scoped ? "translate-x-4" : "translate-x-0"}`} />
                </button>
                <span className="text-sm text-foreground">{scoped ? "Path only" : "Whole site"}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">{scoped ? "Only pages under the input path" : "All pages on the domain"}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 1b — Discovering Progress ──────────────────────────────────────────
// Shows while BullMQ worker is running crawlWebsite() in the background.
// Real progress % from BullMQ, live URL counter, elapsed clock.

function DiscoveringProgress({ dp, rootUrl }: { dp: DiscoverProgress | null; rootUrl: string }) {
  const pct      = dp?.jobProgress ?? 0;
  const urls     = dp?.urlsFound  ?? 0;
  const elapsed  = dp?.elapsedMs  ?? null;

  // Animated dot wave for the "crawling" visual
  const dots = ["●", "●", "●", "●", "●"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <SpinnerIcon className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-lg">Crawling website…</p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground truncate">{rootUrl}</p>
        </div>
        {elapsed !== null && (
          <div className="shrink-0 text-right">
            <p className="text-2xl font-bold tabular-nums text-foreground">{formatMs(elapsed)}</p>
            <p className="text-xs text-muted-foreground">elapsed</p>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {pct < 5 ? "Starting up…" : pct < 92 ? "Following links…" : "Finishing up…"}
          </span>
          <span className="font-semibold tabular-nums text-foreground">{pct}%</span>
        </div>
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
            style={{ width: `${Math.max(3, pct)}%` }} />
          {/* Shimmer effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse" />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-center">
          <p className="text-xs text-muted-foreground">URLs found</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-primary transition-all duration-300">
            {urls.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-center">
          <p className="text-xs text-muted-foreground">Worker progress</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">{pct}%</p>
        </div>
      </div>

      {/* Animated crawl dots */}
      <div className="flex items-center justify-center gap-2">
        {dots.map((d, i) => (
          <span key={i} className="text-primary text-xs"
            style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`, opacity: 0.3 + (i * 0.15) }}>
            {d}
          </span>
        ))}
      </div>

      {/* Reassurance banner */}
      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
        <svg className="h-4 w-4 shrink-0 mt-0.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-foreground">
          <span className="font-medium">You can safely close this tab.</span>{" "}
          The crawl runs in a background worker — come back any time and your progress will be here waiting for you.
        </p>
      </div>
    </div>
  );
}

// ─── Step 2 — URL Checklist ───────────────────────────────────────────────────

function UrlReview({ urls, localToggles, selectedCount, totalCount, onToggle, onSelectAll, onStart, onBack, rootUrl }: {
  urls: ScrapeUrl[]; localToggles: Record<string, boolean>;
  selectedCount: number; totalCount: number;
  onToggle: (id: string, v: boolean) => void; onSelectAll: (v: boolean) => void;
  onStart: () => void; onBack: () => void; rootUrl: string;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "included" | "excluded">("all");

  const filtered = useMemo(() => urls.filter((u) => {
    const inc = u.id in localToggles ? localToggles[u.id] : u.included;
    if (filter === "included" && !inc) return false;
    if (filter === "excluded" && inc) return false;
    if (search) {
      const q = search.toLowerCase();
      return u.url.toLowerCase().includes(q) || (u.title ?? "").toLowerCase().includes(q);
    }
    return true;
  }), [urls, localToggles, filter, search]);

  const allSel  = urls.every((u) => (u.id in localToggles ? localToggles[u.id] : u.included));
  const noneSel = urls.every((u) => !(u.id in localToggles ? localToggles[u.id] : u.included));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">{totalCount} pages discovered</h3>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{selectedCount}</span> selected for import
            <span className="mx-2 opacity-30">·</span>
            <span className="font-mono text-xs opacity-60 truncate">{rootUrl}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={onBack}>← Back</Button>
          <Button size="sm" disabled={selectedCount === 0} onClick={onStart} className="gap-1.5">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-14 9V3z" />
            </svg>
            Scrape {selectedCount > 0 && `${selectedCount} pages`}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" placeholder="Filter pages…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="flex gap-1 rounded-lg bg-muted/50 p-1 border border-border">
          {(["all","included","excluded"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-all ${filter===f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {f}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 ml-auto shrink-0">
          <button onClick={() => onSelectAll(true)} disabled={allSel}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40">
            Select all
          </button>
          <button onClick={() => onSelectAll(false)} disabled={noneSel}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40">
            Deselect all
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <p className="text-sm">No pages match your filter</p>
          </div>
        ) : (
          <div className="divide-y divide-border max-h-[460px] overflow-y-auto">
            {filtered.map((u) => {
              const included = u.id in localToggles ? localToggles[u.id]! : u.included;
              return (
                <label key={u.id} className={`flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/30 ${!included ? "opacity-45" : ""}`}>
                  <div className="relative mt-0.5 h-4 w-4 shrink-0">
                    <input type="checkbox" checked={included} onChange={(e) => onToggle(u.id, e.target.checked)}
                      className="peer absolute inset-0 h-4 w-4 cursor-pointer appearance-none rounded border border-border bg-background checked:border-primary checked:bg-primary focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors" />
                    <svg className="pointer-events-none absolute inset-0 hidden h-4 w-4 peer-checked:block" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8l3.5 3.5 6.5-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate max-w-sm">{u.title || shortUrl(u.url)}</span>
                      <DepthBadge depth={u.depth} />
                      {u.contentLength != null && u.contentLength > 0 && (
                        <span className="text-[11px] text-muted-foreground tabular-nums">{(u.contentLength / 1000).toFixed(1)}k chars</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground truncate">{u.url}</p>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>
      {filtered.length < urls.length && (
        <p className="text-center text-xs text-muted-foreground">Showing {filtered.length} of {urls.length} pages</p>
      )}
    </div>
  );
}

// ─── Step 3 — Scrape Progress ─────────────────────────────────────────────────

function ScrapingProgress({ scrapedUrls, failedUrls, pendingUrls, scrapingUrls, selectedUrls, rootUrl }: {
  scrapedUrls: number; failedUrls: number; pendingUrls: number;
  scrapingUrls: number; selectedUrls: number; rootUrl: string;
}) {
  const total = selectedUrls || 1;
  const done  = scrapedUrls + failedUrls;
  const pct   = Math.min(100, Math.round((done / total) * 100));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <SpinnerIcon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-semibold text-foreground">Scraping pages…</p>
          <p className="font-mono text-xs text-muted-foreground truncate max-w-xs">{rootUrl}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-3xl font-bold tabular-nums text-foreground">{pct}%</p>
          <p className="text-xs text-muted-foreground">{done} / {total}</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all duration-500 ease-out" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Scraped",   value: scrapedUrls,  color: "text-success" },
          { label: "In flight", value: scrapingUrls, color: "text-primary animate-pulse" },
          { label: "Queued",    value: pendingUrls,  color: "text-muted-foreground" },
          { label: "Failed",    value: failedUrls,   color: failedUrls > 0 ? "text-destructive" : "text-muted-foreground" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-center">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
        <svg className="h-4 w-4 shrink-0 mt-0.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-foreground">
          <span className="font-medium">Scraping runs in the background.</span>{" "}
          You can close this tab — when you return, this screen will show live progress automatically.
        </p>
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
        Updating every 2 seconds…
      </p>
    </div>
  );
}

// ─── Step 4a — Done ───────────────────────────────────────────────────────────

function ScrapeDone({ scrapedUrls, failedUrls, rootUrl, onReset }: {
  scrapedUrls: number; failedUrls: number; rootUrl: string; onReset: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
        <svg className="h-8 w-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div>
        <h3 className="text-xl font-bold text-foreground">Scrape complete!</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="font-medium text-success">{scrapedUrls} pages</span> scraped and added to the knowledge base.
          {failedUrls > 0 && <span className="ml-1 text-destructive">({failedUrls} failed)</span>}
        </p>
        <p className="mt-1 font-mono text-xs text-muted-foreground/60 truncate max-w-xs">{rootUrl}</p>
      </div>
      <Button variant="outline" onClick={onReset}>Scrape another site</Button>
    </div>
  );
}

// ─── Step 4b — Error ──────────────────────────────────────────────────────────

function ScrapeError({ message, onReset }: { message: string; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
        <svg className="h-8 w-8 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <div>
        <h3 className="text-xl font-bold text-foreground">Scrape failed</h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-md">{message}</p>
      </div>
      <Button variant="outline" onClick={onReset}>Try again</Button>
    </div>
  );
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

const STEPS = ["Discover", "Review", "Scraping", "Done"] as const;

function StepIndicator({ active }: { active: 0 | 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((label, i) => {
        const done = i < active, current = i === active;
        return (
          <div key={label} className="flex items-center">
            <div className="flex items-center gap-2">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors ${done ? "bg-primary text-primary-foreground" : current ? "bg-primary/15 text-primary border border-primary/30" : "bg-muted text-muted-foreground"}`}>
                {done ? (
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : i + 1}
              </div>
              <span className={`text-xs font-medium ${current ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`mx-3 h-px w-6 ${i < active ? "bg-primary" : "bg-border"}`} />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Live Banner — shown on other tabs when job is running ────────────────────

export function ScrapeActiveBanner({ kbId }: { kbId: string }) {
  const { state, reset } = useScrapeWizard(kbId);
  const { phase, session, progress, discoverProgress } = state;

  if (phase !== "discovering" && phase !== "scraping") return null;

  const isDiscovering = phase === "discovering";
  const label = isDiscovering
    ? `Discovering… ${discoverProgress?.urlsFound ?? 0} URLs found`
    : `Scraping… ${progress?.scrapedUrls ?? 0} / ${progress?.selectedUrls ?? session?.selectedUrls ?? "?"} pages`;

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
      <div className="flex items-center gap-2.5">
        <SpinnerIcon className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-sm text-muted-foreground truncate max-w-xs font-mono text-xs">
          {session?.rootUrl ?? ""}
        </span>
      </div>
      <button onClick={reset}
        className="shrink-0 rounded-lg border border-border px-3 py-1 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors">
        Cancel
      </button>
    </div>
  );
}

// ─── Root Export — ScrapeWizard ───────────────────────────────────────────────

export function ScrapeWizard({ kbId }: { kbId: string }) {
  const { state, discover, toggleUrl, selectAll, startScrape, reset } = useScrapeWizard(kbId);
  const { phase, session, progress, discoverProgress, error, localToggles } = state;

  const stepIndex: 0 | 1 | 2 | 3 =
    phase === "idle" || phase === "discovering" ? 0 :
    phase === "awaiting_confirmation"           ? 1 :
    phase === "scraping"                        ? 2 : 3;

  const urls          = session?.urls ?? [];
  const selectedCount = urls.filter((u) => (u.id in localToggles ? localToggles[u.id] : u.included)).length;

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-soft space-y-6">
      {phase !== "completed" && phase !== "failed" && (
        <StepIndicator active={stepIndex} />
      )}

      {/* Phase 1a — idle: show form */}
      {phase === "idle" && (
        <DiscoverForm discovering={false} onDiscover={discover} />
      )}

      {/* Phase 1b — discovering: show live progress */}
      {phase === "discovering" && (
        <DiscoveringProgress dp={discoverProgress} rootUrl={session?.rootUrl ?? ""} />
      )}

      {/* Phase 2 — review */}
      {phase === "awaiting_confirmation" && session && (
        <UrlReview
          urls={urls} localToggles={localToggles}
          selectedCount={selectedCount} totalCount={session.totalUrls}
          onToggle={toggleUrl} onSelectAll={selectAll}
          onStart={startScrape} onBack={reset} rootUrl={session.rootUrl}
        />
      )}

      {/* Phase 3 — scraping */}
      {phase === "scraping" && (
        <ScrapingProgress
          scrapedUrls={progress?.scrapedUrls ?? 0}
          failedUrls={progress?.failedUrls ?? 0}
          pendingUrls={progress?.pendingUrls ?? 0}
          scrapingUrls={progress?.scrapingUrls ?? 0}
          selectedUrls={progress?.selectedUrls ?? session?.selectedUrls ?? 0}
          rootUrl={session?.rootUrl ?? ""}
        />
      )}

      {/* Phase 4a — done */}
      {phase === "completed" && (
        <ScrapeDone
          scrapedUrls={progress?.scrapedUrls ?? session?.scrapedUrls ?? 0}
          failedUrls={progress?.failedUrls ?? session?.failedUrls ?? 0}
          rootUrl={session?.rootUrl ?? ""} onReset={reset}
        />
      )}

      {/* Phase 4b — failed */}
      {phase === "failed" && (
        <ScrapeError message={error ?? "An unexpected error occurred."} onReset={reset} />
      )}

      {/* Inline error toast during review */}
      {error && phase === "awaiting_confirmation" && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
          <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}
    </div>
  );
}
