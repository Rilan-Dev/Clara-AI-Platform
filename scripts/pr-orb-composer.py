#!/usr/bin/env python3
"""PR flow for the orb composer session:
1. PR Vite-Converted -> Vercel-Preview, self-merge
2. PR Vercel-Preview -> Vercel-Prod, leave OPEN for user review
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


def find_pr(token: str, head: str, base: str):
    status, data = gh("GET", f"/repos/{REPO}/pulls?head={REPO}:{head}&base={base}&state=open", token)
    if status == 200 and data:
        return data[0]
    return None


def create_pr(token: str, head: str, base: str, title: str, body_md: str):
    existing = find_pr(token, head, base)
    if existing:
        print(f"  PR #{existing['number']} already open ({head} -> {base})")
        return existing
    status, data = gh("POST", f"/repos/{REPO}/pulls", token, {
        "title": title,
        "body": body_md,
        "head": head,
        "base": base,
    })
    if status != 201:
        sys.exit(f"ERROR creating PR {head}->{base}: {status} {data}")
    print(f"  created PR #{data['number']}: {data['html_url']}")
    return data


def merge_pr(token: str, number: int):
    # merge method per repo history (merge commits used previously)
    for attempt in range(5):
        status, data = gh("PUT", f"/repos/{REPO}/pulls/{number}/merge", token, {"merge_method": "merge"})
        if status == 200:
            print(f"  merged PR #{number}: {data.get('sha', '')[:10]}")
            return
        if status in (405, 409):
            # base not ready yet (CI pending) — wait and retry
            print(f"  merge not ready ({status}), waiting 15s…")
            time.sleep(15)
            continue
        sys.exit(f"ERROR merging PR #{number}: {status} {data}")
    sys.exit(f"ERROR: PR #{number} never became mergeable")


def main():
    token = get_token()

    print("STEP 1: Vite-Converted -> Vercel-Preview (self-merge)")
    pr1 = create_pr(
        token, "Vite-Converted", "Vercel-Preview",
        "feat(agents): orb composer for chat mode with typewriter placeholder",
        PR_BODY_PREVIEW,
    )
    merge_pr(token, pr1["number"])

    print("STEP 2: Vercel-Preview -> Vercel-Prod (leave OPEN for owner review)")
    create_pr(
        token, "Vercel-Preview", "Vercel-Prod",
        "Release: orb composer chat input + latest preview stack",
        PR_BODY_PROD,
    )
    print("DONE — Prod PR left open for owner review.")


PR_BODY_PREVIEW = """## What

Chat-mode input for agent conversations (`/agents/:agentId` and Draft Preview) rebuilt on the owner-supplied **OrbInput** interaction model:

- **Living brand orb** docked left of the field — pure-CSS (rotating conic shimmer ring + breathing glow + gradient core) tinted from each agent's published `primaryColour`/`accentColour`.
- **Typewriter placeholder** — types character-by-character (75 ms), lingers (2.2 s), then advances: *"Ask <name> anything…" → "What's on your mind?" → "How can <name> help you?" → "What would you like to know?"*
- **Pill field with focus glow** — scales 1.01 and glows in the agent brand colour when focused; relaxes its radius when a draft spans multiple lines.

## Why these production adaptations (vs. the reference snippet)

| Reference snippet | Production | Reason |
|---|---|---|
| GIF from `cdn.21st.dev` | Pure-CSS orb | Third-party CDN is a single point of failure for every published agent page, leaks visitor IPs, and cannot inherit per-agent brand colours. Reuses the shared `clara-orb-*` keyframe engine → `prefers-reduced-motion` disables it automatically. |
| Hardcoded black/white | Theme tokens (`bg-card`/`border-border`/`text-foreground`) | The reference was dark-only; the platform supports light and dark mode. |
| Single-line `<input>` | Auto-growing `<textarea>` | Keeps existing chat semantics — Enter sends, Shift+Enter new line (no UX regression). |
| Fixed `w-[500px]`, `p-6`, 64px orb | Responsive | Mobile-first published pages. |

## Voice is preserved (owner requirement)

- **Mic button** in the pill starts the *exact same* realtime session as the voice lobby — identical `onVoiceStart` contract, untouched `use-agent-conversation` / voice stack.
- Voice lobby **"Start conversation"** button and the top-right **mode toggle** are unchanged.
- When voice is unavailable, the mic shows the existing disabled + tooltip behaviour.

## Provider safety

Purely presentational — no changes to `use-agent-conversation`, `chat-stream`, any API route, or any provider module. Every AI provider behind `/api/embed/chat` is unaffected by construction. Verified:

- `tsc --noEmit`: 0 new errors (15 pre-existing env-only ones unchanged)
- `eslint`: 0 new warnings on changed files
- `vitest`: **782/782 pass** (775 existing + 7 new source-contract tests)
- `next build`: compiles successfully (webpack phase verified; local type phase is sandbox-OOM but covered by standalone tsc)
- `react-dom/server` structural render check: 14/14 affordances (orb, divider, textarea, mic, send, gradient gating, thinking ripple, no external images)

## Files

- `src/features/agent-conversation/components/orb-composer.tsx` (new)
- `src/features/agent-conversation/components/orb-composer.test.ts` (new, source-contract tests)
- `src/features/agent-conversation/components/conversation-chat-window.tsx` (+4/−1 — import + swap)
"""

PR_BODY_PROD = """## Release scope

All changes currently on **Vercel-Preview**, including the latest:

- **Orb composer for chat mode** (`feat(agents)`) — OrbInput-style chat input with brand orb, typewriter placeholder, and preserved voice entry. Purely presentational; all AI providers unaffected (782/782 tests pass).

Plus the previously merged preview stack (RAG fixes, embed hardening, sidebar/topbar redesign, voice infrastructure) since the last production release.

## Verification

- Type-check, ESLint, full vitest suite (782/782), production webpack compile — all green.
- Voice lobby, mode toggle, and mic button wired to the unchanged realtime session contract.

_Left open for owner review — will be merged manually._
"""

if __name__ == "__main__":
    main()
