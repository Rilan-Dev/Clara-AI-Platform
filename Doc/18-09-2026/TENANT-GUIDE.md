# TENANT GUIDE — Using Your Clara Workspace

A practical walkthrough for customer organisations (tenant admins and
members) using the Clara AI Platform workspace: the portal where you manage
knowledge bases, upload documents, chat with your grounded assistant, and
watch the analytics that plan limits are built around.

> **Audience** — client org users (org admins, project managers, KB
> editors/viewers).  
> Embedding Clara on your public website: `EMBED-GUIDE.md`.

---

## 1. Signing in

1. Open your workspace URL (e.g. `https://app.example.com/workspace`) — or
   the login page your onboarding email links to.
2. Sign in with the email + password your organisation admin invited you
   with. Forgot it? Use **Forgot password** on the login screen; new
   invitees get a set-password link by email.
3. You land on the **workspace dashboard**.

Keep three protection rules in mind (they protect *you*):

- After **5 failed attempts from one network**, login is throttled for 15
  minutes (HTTP 429).
- After **10 consecutive wrong passwords**, the account locks for 30
  minutes (`ACCOUNT_LOCKED`); your platform admin can unlock it instantly.
- Sessions are device-revocable: **Settings → sessions** lets you sign out
  everywhere.

## 2. The dashboard

The dashboard is live database data, never mock numbers:

- **Totals** — knowledge bases, documents, storage used vs. plan.
- **Usage & limits** — today's requests against your plan's daily quota
  (soft warning banner appears at 80%; hard stop with an upgrade prompt at
  100%).
- **7-day trend** — queries per day, split by surface (workspace chat,
  website widget, voice).
- **Active users + token/cost metering** — who is asking what, and what it
  costs in tokens.

## 3. Knowledge bases

A knowledge base (KB) is a curated document collection with its own
assistant persona, retrieval settings and API keys.

- **Create**: Knowledge Bases → **New**. Your plan caps how many (Starter 3,
  Pro 10, Enterprise unlimited) — exceeding it returns a friendly
  `PLAN_LIMIT_EXCEEDED` prompt with upgrade link, never a silent failure.
- **Configure**: each KB has an assistant persona (name, greeting,
  tone), suggested prompts, colors and a system prompt built from your
  content.
- **Archive** instead of delete when you want it out of the widget but
  keep its analytics history.

## 4. Uploading documents

Drag-and-drop or pick files inside a KB. Rules enforced by the platform:

| Rule | Value |
|------|-------|
| Allowed types | PDF, DOCX, XLSX, XLS, TXT, MD, CSV, HTML |
| Max size | 50 MB per file |
| Batch pace | 10 upload requests / minute / org |
| Per-KB cap | plan `max_docs_per_kb` (Starter 50, Pro 200, …) |
| Storage cap | plan total (Starter 1 GB, Pro 10 GB, …) |

Rejected files come back with a precise reason code
(`INVALID_FILE_TYPE`, `FILE_TOO_LARGE`, `MALWARE_DETECTED` when virus
scanning is enabled). Accepted files show a live **ingest status**
(pending → processing → ready) — the background pipeline extracts text,
chunks and embeds each document automatically; a `failed` status always
includes the underlying reason, never just "error".

You can also **scrape a website** into a KB (URL discovery → crawl →
ingest) and **reprocess** any document when its extraction settings change.

## 5. Chatting with your assistant

Workspace chat streams answers over NDJSON with:

- **citations** — answers reference the source documents they came from
  (`[S1]`-style tags resolved to real chunks);
- **conversation memory** within a session;
- **quota transparency** — an in-stream banner warns at 80% of your daily
  plan quota; the 61st chat message in a single minute is rate-limited
  (429) to protect shared capacity.

If the AI provider has an outage you get a plain-language apology with a
retry hint — technical detail stays in the server log, not in your face.

## 6. Analytics

Per-KB analytics show real `query_events`: volumes, latencies, top
questions, unanswered queries worth adding documents for, plus
token/cost metering. Org-level dashboards aggregate across KBs and
surfaces. Data is org-scoped — nobody outside your organisation (not even
platform admins browsing the tenant API) can read it except through the
explicitly audited support path.

## 7. Members & roles

Org admins invite members by email (the platform creates the account and
emails a set-password link) and assign roles:

| Role | Can do |
|------|--------|
| `org_admin` | everything below + billing, members, plan |
| `project_manager` | create agents/KBs, manage all content |
| `kb_editor` | upload/edit documents in assigned KBs |
| `kb_viewer` | read-only + chat |

Every invite, role change and removal is written to the audit log.

## 8. Plans & upgrades

| | Free | Starter $49/mo | Pro $149/mo | Enterprise |
|--|------|----------------|-------------|------------|
| KBs | 1 | 3 | 10 | unlimited |
| Docs / KB | 10 | 50 | 200 | unlimited |
| Requests / day | 100 | 1,000 | 10,000 | unlimited |
| Voice | — | ✓ | ✓ + realtime | ✓ |
| API keys | — | 3 | 10 | custom |
| Branding / SSO | — | — | branding | SSO, SLA |

Upgrades run through Stripe checkout (**Billing → Upgrade**); your
subscription snapshot, invoices and renewal reminders all live in the same
screen. Hitting any cap surfaces a 402 with an upgrade link — the demo
tenant `omen-admin@omeninsurance.com` (Pro) is a good tour guide.
