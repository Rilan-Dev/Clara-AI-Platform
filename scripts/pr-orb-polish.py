#!/usr/bin/env python3
"""PR flow for the orb-composer iteration 2 session (focus border fix +
owner-directed orb asset + AI config sync plan):
1. PR Vite-Converted -> Vercel-Preview, self-merge
2. Vercel-Preview -> Vercel-Prod stays as the open PR #191 (tracks the branch)
"""
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

REPO = "Rilan-Dev/Clara-AI-Platform"


def get_token() -> str:
    url = subprocess.run(
        ["git", "-C", "/home/z/my-project/.worktrees/vc", "config", "--get", "remote.origin.url"],
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
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"message": raw.decode(errors="replace")}


def main():
    token = get_token()

    # STEP 1: Vite-Converted -> Vercel-Preview, self-merge
    print("STEP 1: Vite-Converted -> Vercel-Preview")
    status, data = gh("POST", f"/repos/{REPO}/pulls", token, {
        "title": "fix(agents): orb composer polish + docs: AI config synchronization plan",
        "body": PR_BODY,
        "head": "Vite-Converted",
        "base": "Vercel-Preview",
    })
    if status == 422 and "already exists" in json.dumps(data):
        # find existing
        status, prs = gh("GET", f"/repos/{REPO}/pulls?head={REPO}:Vite-Converted&base=Vercel-Preview&state=open", token)
        if not prs:
            sys.exit(f"ERROR: 422 but no open PR found: {data}")
        pr = prs[0]
        print(f"  existing PR #{pr['number']} found — merging")
    elif status != 201:
        sys.exit(f"ERROR creating PR: {status} {data}")
    else:
        pr = data
        print(f"  created PR #{pr['number']}: {pr['html_url']}")

    number = pr["number"]
    for attempt in range(6):
        status, data = gh("PUT", f"/repos/{REPO}/pulls/{number}/merge", token, {"merge_method": "merge"})
        if status == 200:
            print(f"  merged PR #{number}: {data.get('sha', '')[:10]}")
            break
        if status in (405, 409):
            print(f"  merge not ready ({status}), waiting 15s…")
            time.sleep(15)
            continue
        sys.exit(f"ERROR merging PR #{number}: {status} {data}")

    # STEP 2: Prod PR #191 tracks the moving Vercel-Preview branch — append the
    # new scope to its body.
    print("STEP 2: update Vercel-Prod PR #191 (stays open for owner review)")
    status, pr191 = gh("GET", f"/repos/{REPO}/pulls/191", token)
    if status == 200:
        addendum = """

---

## Update — 2026-09-25 (orb composer polish + AI config sync plan)

- **`fix(agents)`: orb composer polish** — the purple square focus border on the chat input is removed (root cause: the global `*:focus-visible` box-shadow ring on the radius-less textarea + the pill's `border-primary/45`), and the left-side orb is now the exact animated orb GIF from the owner-supplied OrbInput example. Voice mic, send gating and typewriter placeholder unchanged.
- **`docs`: AI Configuration Synchronization Layer plan** — PostgreSQL → Redis → Provider Registry architecture with revision-based invalidation, phased rollout (Phases 0–5), file-level current-state evidence, and 4 decisions requested from the owner. Doc: `Doc/25-09-2026/AI-CONFIG-SYNCHRONIZATION-PLAN.md`. No runtime changes yet — implementation starts after owner approval.
"""
        body = (pr191.get("body") or "") + addendum
        status, result = gh("PATCH", f"/repos/{REPO}/pulls/191", token, {"body": body})
        print(f"  PR #191 body updated: {status}")
    print("DONE — Prod PR #191 remains open for owner review.")


PR_BODY = """## What

### 1. Orb composer polish (owner feedback)

- **Purple square focus border removed.** Root cause was twofold: the global `*:focus-visible` base rule paints a box-shadow ring in `hsl(var(--ring))` (indigo) around the radius-less textarea, and the pill switched to `border-primary/45` on focus. The textarea now suppresses the ring (`focus:shadow-none focus-visible:shadow-none` — utilities layer wins over `@layer base`), and the pill keeps its neutral `border-border/70` in every state. Focus feedback is the subtle scale + neutral elevation, matching the reference example.
- **Left-side orb = the exact animated orb GIF from the owner-supplied OrbInput example** (`cdn.21st.dev` mirror, 48px mobile / 64px desktop, `rounded-full overflow-hidden`). A `clara-orb-ripple` ring still overlays it while the assistant is thinking.

Unchanged: voice mic button, send gating (`canSend` gradient), typewriter placeholder, auto-grow, Enter/Shift+Enter semantics.

### 2. AI Configuration Synchronization Layer — architecture & phased plan (docs only)

`Doc/25-09-2026/AI-CONFIG-SYNCHRONIZATION-PLAN.md` — the owner-specified target architecture (PostgreSQL → Redis → Provider Registry single gateway, revision-based invalidation, env vars demoted to bootstrap/emergency roles) with:

- File-level current-state evidence (the `DB → process.env → Provider` hydration model, per-instance TTL caches, ~20 direct `process.env.<PROVIDER>_API_KEY` sites, existing ioredis/BullMQ Redis in production)
- `ai_config_revisions` migration design with same-transaction revision bumps
- L1/L2/L3 resolution with drift rehydration + `AI_CONFIG_RESOLUTION_FAILED` diagnostics
- Six production-safe phases with exit criteria; blast-radius guarantees for provider SDKs, RAG/Qdrant, governance gates
- 4 key decisions requested from the owner

**No runtime changes in this PR** — Phase 0/1 implementation starts after owner approval.

## Verification

- `vitest`: **783/783 pass** (8 orb-composer contract tests updated for the new decisions)
- `eslint`: clean on changed files · `tsc`: no new errors
- Structural render check: 15/15 (owner-directed orb GIF present, focus ring suppressed, neutral border in all states)

## Files

- `src/features/agent-conversation/components/orb-composer.tsx` (fix)
- `src/features/agent-conversation/components/orb-composer.test.ts` (contract updates)
- `Doc/25-09-2026/AI-CONFIG-SYNCHRONIZATION-PLAN.md` (new)
"""

if __name__ == "__main__":
    main()
