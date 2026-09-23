#!/usr/bin/env python3
"""PR flow for the sidebar/topbar redesign session:
1. PR Vite-Converted -> Vercel-Preview, self-merge
2. PR Vercel-Preview -> Vercel-Prod, leave OPEN for user review
"""
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


PR_BODY = """## What (per review feedback — redesign of existing UI, nothing new introduced)

The one-navbar experiment from the previous round is reverted in favour of the original information architecture:

### 1. Agent menus back in the sidebar (under "Agents >")
- Sidebar shows, when an agent is open: **Agents >** group header (click = back to the agents list) -> agent identity card (name, Main · vN, hover delete) -> **Overview / Main / FAQ / Knowledge / Tools / Branches / Publish**
- No agent selected -> the plain organisation rail (org nav + agents list), unchanged

### 2. Version cluster moved to the top bar, next to the profile avatar
- `Main v8 · Draft changes · Published v8 · Draft saved 18 min ago · Preview · Publish update` now lives in the global topbar beside the avatar
- **Username removed from the navbar** — the profile trigger is avatar-only; the left slot shows the open agent + section (or a neutral page label off agent routes)
- One-click publish moved from the old workspace navbar into the topbar cluster

### 3. "Draft changes" -> view pending changes
- The Draft changes pill opens a slide-over drawer with the semantic **draft vs current version** diff (existing DiffViewer + `b=draft` API) and a "Publish these changes" shortcut

### 4. Published URL controls
- The "Published vN" pill opens a popover with the hosted public page URL (copy / open) plus live/private status

### 5. Profile popup usage limits
- New lightweight `GET /api/orgs/[orgId]/usage-limits` (org-member auth; same `getOrgUsageSnapshot` as the dashboard, minus heavy aggregates)
- Profile dropdown gains a Usage & plan section: plan badge + meters for requests today, storage, KBs and docs-per-KB (amber at 80%, rose at 100%, Unlimited for -1)

### 6. Workspace shell cleanup + mobile
- The one-navbar is removed; agent content starts directly under the topbar
- Phones (md:hidden): horizontal scrollable agent tab strip + compact topbar cluster (actions only)

## Technical notes
- New `src/features/admin/layouts/agent-topbar.tsx`: `AgentTopbarProvider` resolves the open agent's context once for both topbar slots (shared 60s cache; `agent-workspace:refresh` forced refetches write fresh snapshots back so the sidebar, topbar and shell stay in sync after publish/restore)
- `context-cache.ts` gains `updateAgentWorkspaceContextCache` for that write-back
- Delete-agent action relocated to the sidebar identity card (was in the old navbar)

## Verification
- `npx tsc --noEmit` -> 0 errors
- `npx eslint <changed files>` -> 0 new warnings
- `npx vitest run` -> 32 failed / 694 passed — **identical to HEAD baseline** (verified via stash; env-dependent failures only)
- `next build` -> webpack compile OK (75s); page-data collection fails on the missing platform secret — same at HEAD (sandbox env)
"""


def create_pr(token: str, head: str, base: str, title: str):
    status, pr = gh("POST", f"/repos/{REPO}/pulls", token, {
        "title": title,
        "head": head,
        "base": base,
        "body": PR_BODY,
    })
    if status != 201:
        sys.exit(f"ERROR creating PR {head}->{base} (HTTP {status}): {json.dumps(pr)[:500]}")
    return pr


def merge_pr(token: str, num: int):
    status, merged = gh("PUT", f"/repos/{REPO}/pulls/{num}/merge", token, {
        "merge_method": "merge",
    })
    if status != 200:
        sys.exit(f"ERROR merging PR #{num} (HTTP {status}): {json.dumps(merged)[:500]}")
    return merged


def main():
    token = get_token()

    # 1. Vite-Converted -> Vercel-Preview (self-merge)
    pr1 = create_pr(
        token, "Vite-Converted", "Vercel-Preview",
        "feat(admin): agent menus back in sidebar, version cluster in topbar, usage meters in profile menu",
    )
    print(f"PR #{pr1['number']} created: Vite-Converted -> Vercel-Preview")
    print(f"  {pr1['html_url']}")
    merge_pr(token, pr1["number"])
    print(f"PR #{pr1['number']} MERGED into Vercel-Preview")

    # 2. Vercel-Preview -> Vercel-Prod (leave open for user review)
    pr2 = create_pr(
        token, "Vercel-Preview", "Vercel-Prod",
        "feat(admin): agent menus back in sidebar, version cluster in topbar, usage meters in profile menu",
    )
    print(f"PR #{pr2['number']} created: Vercel-Preview -> Vercel-Prod (LEFT OPEN for review)")
    print(f"  {pr2['html_url']}")


if __name__ == "__main__":
    main()
