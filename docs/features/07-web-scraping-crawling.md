# 07 — Web Scraping & Crawling

> Clara AI Platform feature documentation · Domain: `ingest/crawlers` + `/api/kbs/[kbId]/scrape` + crawl queue · Base: `feature/ai-core-from-doable-source @ 031279b4`

## 1. Definition & Purpose

Web scraping lets a tenant grow a KB from live web content instead of uploads: point it at a site, discover URLs under robots.txt rules, crawl pages, and ingest their text into the same pipeline as documents (Feature 06). The feature covers URL discovery, resumable crawl sessions with live progress streaming, per-URL retry queues, failed-URL review, and the crawl job queue. Its purpose is governed, observable site ingestion — respecting site rules and giving operators visibility into what was crawled, skipped, and why.

## 2. Business Logic

- **Robots governance** — `ingest/crawlers/robots-parser.ts`: `fetchRobotsTxt:21`, `parseRobotsTxt:43`, `isUrlAllowed:97` decide crawlability before any fetch; disallowed URLs are never requested.
- **Discovery** — `/api/kbs/[kbId]/scrape/discover` probes a seed URL and proposes in-scope URLs; `DiscoveredUrl` / `CrawlOptions` types at `web-crawler.ts:50` / `:24`; the batch URL picker is `/api/kbs/[kbId]/scrape/urls/batch`.
- **Crawl engine** — `crawlWebsite` (`web-crawler.ts:515`) executes breadth-limited crawls returning `CrawlResult:63` (pages, errors `:60`, progress `:61`); crawl jobs run on the BullMQ crawl queue (`queue/index.ts:44` `getCrawlQueue`) via `/api/queue/crawl`, worker side `/api/worker/scrape`; cloud transport variant in `cloud-jobs/process-crawl.ts:20`.
- **Sessions** — `/api/kbs/[kbId]/scrape/sessions` (create/list) → `.../[sessionId]/start`, `/progress`, `/discover-progress` (poll), `/stream` (live NDJSON progress to the UI), `/cancel`, `/failed-urls`, and `.../urls/[urlId]` (inspect/remove). `active-session` returns the running session for resume semantics.
- **Retries** — failed URLs enqueue on the retry queue (`queue/index.ts:82` `getRetryQueue`, `/api/queue/retry`; cloud variant `cloud-jobs/process-retry.ts:29`).

## 3. Business Rules

- robots.txt is authoritative: `isUrlAllowed` gates every URL; no bypass path exists in the crawler.
- Crawl depth and page budget are bounded by `CrawlOptions` — a session can never run away over a site.
- Sessions are resumable: an active session is reused rather than duplicated; cancel is honored promptly.
- Failed URLs are individually retried and reviewable (`/failed-urls`), never silently dropped.
- Crawled pages enter the same parse→chunk→embed→upsert pipeline with the same `ready/failed` honesty rules as uploads (Feature 06).

## 4. Data Model

- Scraping tables — `007_scraping.sql` (sessions, discovered URLs, failed URLs); BullMQ crawl/retry queues in Redis; Qdrant collections shared with the KB.

## 5. API Surface

| Route group | Files |
|---|---|
| Discovery | `src/app/api/kbs/[kbId]/scrape/discover/route.ts`, `scrape/urls/batch/route.ts`, `scrape/urls/[urlId]/route.ts` |
| Sessions | `src/app/api/kbs/[kbId]/scrape/sessions/**` (route, start, progress, discover-progress, stream, cancel, failed-urls) + `scrape/active-session/route.ts` |
| Queues | `src/app/api/queue/crawl/route.ts`, `queue/retry/route.ts`, `queue/scrape/route.ts`, `worker/scrape/route.ts` |

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/modules/ingest/crawlers/robots-parser.ts` | `RobotsRules:8`, `fetchRobotsTxt:21`, `parseRobotsTxt:43`, `isUrlAllowed:97` |
| `src/modules/ingest/crawlers/web-crawler.ts` | `CrawlOptions:24`, `DiscoveredUrl:50`, `CrawlResult:63`, `crawlWebsite:515` |
| `src/modules/queue/index.ts` | `getCrawlQueue:44`, `getRetryQueue:82` |
| `src/modules/cloud-jobs/process-crawl.ts` / `process-retry.ts` | `processCrawlJobData:20` / `processRetryJobData:29` (Vercel transport) |
| `src/modules/admin/core/ingest/web-loader.ts` | fetched-page → pipeline adapter |

## 7. UI Reference

- `src/app/(admin)/kbs/[kbId]/page.tsx` — scrape tab: discovery, session progress (NDJSON stream), failed-URL review.
- `src/features/admin/screens/kb-detail-screen.tsx` and `src/modules/admin/ui/ingest/WorkspacePage.tsx:73` (`AdminIngestWorkspace`) — ingest workspace including web sources.

## 8. Environment Variables

- Crawler politeness/limits (see `.env.example` scraping section); Redis/BullMQ vars (Feature 25); `CLOUD_QUEUE_TRANSPORT` for Vercel (Feature 25).

## 9. Tests

- Crawler/robots regression suites under `src/modules/ingest/__tests__/` (locate current test files in the module directories; the old generated inventory is not committed).

## 10. Cross-links

- Ingested pages flow into **06 Document Ingestion**; ready content serves **08 RAG Chat**.
- Queue transport options — **25 Background Jobs & Messaging**.
