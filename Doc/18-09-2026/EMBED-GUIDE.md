# EMBED GUIDE — Putting Clara on Your Website

Everything a customer needs to add the Clara AI assistant (chat and voice)
to their own website with one script tag. No build step, no framework
requirements, works on plain HTML, WordPress, Shopify, Webflow — anywhere
you can add a `<script>`.

> **Audience** — customer web teams.  
> Managing the KB behind the widget: `TENANT-GUIDE.md`. API internals:
> `API.md` §8.

---

## 1. Get an embed API key

1. Sign in to your Clara workspace.
2. Open the knowledge base you want to publish → **API keys** → **Create
   embed key**.
3. Configure:
   - **Allowed origins** — the exact host(s) that may load the widget
     (e.g. `https://www.yourcompany.com`). CORS requests from any other
     origin are rejected; leave empty only for throwaway demo keys.
   - **Hourly request limit** — requests per hour per key (also bounded by
     your plan's daily quota).
4. Copy the key — it looks like `clr_…` and is shown once.

Rotate keys by creating a new one and deleting the old; deletion is
instant and revokes all widget traffic.

## 2. The snippet

Add this anywhere in your page (footer is fine):

```html
<script
  src="https://app.example.com/embed/clara.js"
  data-key="clr_your_key_here"
  data-position="bottom-right"
  data-theme="light"
  defer
></script>
```

| Attribute | Values | Default |
|-----------|--------|---------|
| `data-key` | your `clr_…` embed key | required |
| `data-position` | `bottom-right` \| `bottom-left` | `bottom-right` |
| `data-theme` | `light` \| `dark` | `light` |

That's it. The script injects a floating Clara button; clicking it opens
the chat panel wired to your knowledge base — persona, colors, greeting
and suggested prompts come from the KB's assistant configuration, not from
the snippet.

**Reference implementations you can copy:**
- `/embed/landing-demo` on your deployment renders a full demo company
  website (TechVision-branded) with the real `clara.js` floating widget —
  the canonical copy-paste example.
- The platform marketing site's hero widget uses the same script with a
  public demo key.

## 3. Voice

If your plan includes voice, the widget exposes a microphone mode that
opens a voice session (OpenAI Realtime or Gemini Live, resolved from your
KB's AI settings). It negotiates the media session through
`/api/embed/voice-*` endpoints and the platform's WebSocket relay — no
extra integration work, no provider credentials ever reach the browser
(the session is minted server-side per conversation). Voice sessions are
rate-limited to 10/hour per organisation to protect provider costs.

## 4. How answers stay grounded

The widget never freestyles:

1. Visitor's question → `POST /api/embed/search` (hybrid retrieval: vector
   + keyword) restricted to the KB the key belongs to.
2. Top chunks + your persona prompt go to the configured LLM.
3. The streamed answer arrives as NDJSON events with **source citations**.
4. Every question is metered against your plan quota and per-key hourly
   limit, and lands in your analytics (surface = `embed`).

If the AI provider has an outage, visitors see a short, friendly retry
message — never raw provider errors or stack traces.

## 5. Security model

- **Origin allow-list per key** — the browser enforces it via CORS, the
  server re-checks it on every request.
- **Scoped reads** — an embed key can search/chat **one KB only**; it
  cannot list documents, read analytics, or touch your workspace.
- **Rate limits** — per-key hourly cap + org daily quota (429 with
  `Retry-After`), 60 chat requests/min/org burst cap.
- **No PII in URLs** — questions travel in the POST body over TLS.

## 6. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Widget button doesn't appear | Check `data-key`; open browser console — a missing/invalid key logs a clear message and renders a banner (dev mode). |
| Chat says origin not allowed | Add your site's exact origin (scheme + host + port) to the key's allowed-origins list. |
| 429 in the network tab | Hourly key limit or plan daily quota reached — raise the key limit or upgrade; `Retry-After` says when it resets. |
| Answers cite nothing | The KB has no `ready` documents yet — upload and let ingest finish (`TENANT-GUIDE.md` §4). |
| Voice button hidden | Voice requires Starter plan or above and voice enabled on the KB. |
| CSP-blocked script | Allow `script-src` from your Clara host and `connect-src` for its `/api/embed/*` + WebSocket. |
