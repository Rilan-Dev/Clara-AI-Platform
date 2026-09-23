#!/usr/bin/env python3
"""Create PR to Vercel-Prod, then merge it (same pattern as previous session's PRs)."""
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request

REPO = "Rilan-Dev/Clara-AI-Platform"


def get_token() -> str:
    url = subprocess.run(
        ["git", "-C", "/home/z/my-project", "config", "--get", "remote.origin.url"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    m = re.match(r"https://([^@]+)@github\.com", url)
    if not m:
        sys.exit("ERROR: no token in git remote")
    creds = m.group(1)
    return creds.split(":", 1)[1] if ":" in creds else creds


def gh(method: str, path: str, token: str, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"https://api.github.com{path}", method=method, data=data, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "clara-pr-helper",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw or b"{}")
        except json.JSONDecodeError:
            return e.code, {}


def main():
    token = get_token()
    status, pr = gh("POST", f"/repos/{REPO}/pulls", token, {
        "title": "fix(preview): self-contained preview deployments + Vercel toolbar CSP allowance",
        "head": "fix/preview-branch-domain-csp",
        "base": "Vercel-Prod",
        "body": """## What

Fixes the broken preview deployments (the CSP console errors) and prepares the static preview domain for Git branch `Vercel-Preview`.

## Root cause (from the browser console log)

Preview pages served from `*.vercel.app` tried to call `https://clara.rag.amazetechclans.com/api/auth/me|documents|kbs/all` — the build-time `NEXT_PUBLIC_API_BASE_URL` (production URL) is baked into preview builds. The static CSP `connect-src 'self' …` does not include the production origin, so **every API call was blocked** ("Connecting to … violates Content Security Policy"). Additionally `https://vercel.live/_next-live/feedback/feedback.js` (Vercel's first-party toolbar, injected into previews only) was blocked by `script-src`.

## Changes

1. **`src/lib/runtime.ts` — same-origin guard in `getApiBaseUrl()`**: when the page hostname differs from the configured API base hostname (preview branch domain, `*.vercel.app`, localhost), fall back to same-origin relative URLs. Every deployment ships its own `/api` routes, so same-origin is always correct. Production (hostname match) and SSR behavior unchanged.
2. **`src/security/csp.ts`**: allow `https://vercel.live` in `script-src` + `connect-src` (Vercel first-party toolbar; never loads on production deployments).
3. **`docs/deployment/VERCEL-VPS-CLOUD.md`**: documents the preview branch domain `preview.rag.amazetechclans.com` (assigned to Git branch `Vercel-Preview` in the Vercel dashboard), its DNS CNAME, the `NEXT_PUBLIC_API_BASE_URL` scoping rule, and why the free git branch alias is unavailable (`clara-backend.vercel.app` is occupied by a legacy placeholder project).
4. **Tests**: new `runtime-api-base.test.ts` (10 cases); updated `csp.test.ts`.

## Verification

- `vitest run src/security/ src/lib/__tests__/` → **114/114 pass**
- `npm run type-check` → no new errors (16 pre-existing missing-package errors on both base and this branch)
- No behavior change on production `clara.rag.amazetechclans.com` (hostname matches configured base → absolute URL preserved)

## Remaining Vercel-side steps (manual, no token)

1. Dashboard → `clara-backend` → Settings → Domains → add `preview.rag.amazetechclans.com` assigned to Git branch `Vercel-Preview`
2. DNS: CNAME `preview.rag` → value Vercel displays
3. Recommended: re-scope `NEXT_PUBLIC_API_BASE_URL` to Production only (no longer strictly required thanks to the origin guard)""",
    })
    if status != 201:
        sys.exit(f"ERROR creating PR (HTTP {status}): {json.dumps(pr)[:500]}")
    num = pr["number"]
    print(f"PR #{num} created: {pr['html_url']}")

    status, merged = gh("PUT", f"/repos/{REPO}/pulls/{num}/merge", token, {
        "merge_method": "merge",
    })
    if status not in (200,):
        sys.exit(f"ERROR merging PR (HTTP {status}): {json.dumps(merged)[:300]}")
    print(f"PR #{num} merged: {merged.get('sha')}")


if __name__ == "__main__":
    main()
