#!/usr/bin/env python3
"""PR flow for the welcome-message duplication session:
1. PR Vite-Converted -> Vercel-Preview, self-merge
2. Update PR #191 (Vercel-Preview -> Vercel-Prod) body with new scope, leave OPEN
"""
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

REPO = "Rilan-Dev/Clara-AI-Platform"
PROD_PR_NUMBER = 191


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
    for attempt in range(5):
        status, data = gh("PUT", f"/repos/{REPO}/pulls/{number}/merge", token, {"merge_method": "merge"})
        if status == 200:
            print(f"  merged PR #{number}: {data.get('sha', '')[:10]}")
            return
        if status in (405, 409):
            print(f"  merge not ready ({status}), waiting 15s…")
            time.sleep(15)
            continue
        sys.exit(f"ERROR merging PR #{number}: {status} {data}")
    sys.exit(f"ERROR: PR #{number} never became mergeable")


def update_prod_pr_body(token: str, body_md: str):
    status, data = gh("GET", f"/repos/{REPO}/pulls/{PROD_PR_NUMBER}", token)
    if status != 200:
        sys.exit(f"ERROR fetching PR #{PROD_PR_NUMBER}: {status} {data}")
    print(f"  PR #{PROD_PR_NUMBER} state={data['state']} head={data['head']['sha'][:10]}")
    status, data = gh("PATCH", f"/repos/{REPO}/pulls/{PROD_PR_NUMBER}", token, {"body": body_md})
    if status != 200:
        sys.exit(f"ERROR updating PR #{PROD_PR_NUMBER}: {status} {data}")
    print(f"  updated PR #{PROD_PR_NUMBER} body (left OPEN for owner review)")


def main():
    token = get_token()

    print("STEP 1: Vite-Converted -> Vercel-Preview (self-merge)")
    pr1 = create_pr(
        token, "Vite-Converted", "Vercel-Preview",
        "fix(agents): welcome message no longer pinned on top or duplicated after voice greeting",
        PR_BODY_PREVIEW,
    )
    merge_pr(token, pr1["number"])

    print("STEP 2: Vercel-Preview -> Vercel-Prod (update #191, leave OPEN for owner review)")
    update_prod_pr_body(token, PR_BODY_PROD)
    print("DONE — Prod PR left open for owner review.")


PR_BODY_PREVIEW = """## What

Three reported defects around the agent welcome message ("Hey there, I'm Clara AI…"), all fixed:

### 1. Welcome message statically pinned at the top of the chat — forever

`WelcomeMessage` rendered unconditionally in both the chat branch and the voice rail, so the welcome stayed on top of the transcript even mid-conversation. It is now an **empty-state affordance**: rendered only while the message list is empty, never once any message exists (text or folded voice turns).

### 2. Chat shows the welcome again after the voice session greets

Realtime provider hooks seed their history with a **greeting turn** so the session can speak the configured welcome on connect. Two conventions exist:

| Provider | Greeting turn shape | Leak |
|---|---|---|
| OpenAI Realtime / Gemini Live | `question: "Welcome message"` (literal placeholder), answer filled as the model speaks | Fake **"You: Welcome message"** user bubble + welcome-text assistant bubble folded into the chat rail |
| ElevenLabs (all modes) / Sarvam | `question: ""`, answer = greeting text | Welcome-text assistant bubble folded into the chat rail |

Both fold sites (the live rail effect **and** the end-of-call fold in `endVoice`) now skip greeting turns via a shared `isGreetingTurn` classifier (`lib/voice-turns.ts`). The chat transcript only contains turns the user actually spoke.

### 3. Voice stage transcript could display the greeting/placeholder turn

The stage's `activeTurn` (last history turn) could be the greeting turn — printing the literal "Welcome message" placeholder at session start. It now selects the last **non-greeting** turn; at session start the stage shows its clean empty-state hint instead.

### Not changed (by design)

- **The spoken greeting** — the AI saying the welcome when a voice session starts is the `voiceGreeting` feature working as configured; audio playback is owned by the provider hooks and is untouched.
- Provider hooks, transports, API routes, and AI providers — zero changes; the fix is purely in transcript folding/display within `features/agent-conversation`.

## Verification

- `tsc --noEmit`: **0 errors** across the repo
- `eslint`: 0 new warnings on changed files
- `vitest`: **804/804 pass** (797 existing + 7 new: unit tests for the classifier + source-contract tests locking the three invariants)
- Pure display-layer change — markdown rendering, orb composer, voice session lifecycle and provider stack all unaffected

## Files

- `src/features/agent-conversation/lib/voice-turns.ts` (new — greeting-turn classifier)
- `src/features/agent-conversation/lib/voice-greeting.test.ts` (new — unit + contract tests)
- `src/features/agent-conversation/hooks/use-agent-conversation.ts` (skip greeting turns in both fold sites)
- `src/features/agent-conversation/components/conversation-voice-stage.tsx` (activeTurn filter)
- `src/features/agent-conversation/components/conversation-chat-window.tsx` (welcome gating in both branches)
"""

PR_BODY_PROD = """## Release scope

All changes currently on **Vercel-Preview**, including the latest:

- **Welcome message fixes** (`fix(agents)`) — the welcome is now an empty-state only (no longer pinned at the top forever); the voice session greeting no longer re-injects "Welcome message"/welcome text into the chat transcript; the voice stage never displays the greeting placeholder turn. Spoken greeting + all providers unaffected (804/804 tests pass).

- **Formatted markdown replies + single status box** (`fix(agents)`) — assistant answers render as real formatted markdown (GFM tables, code blocks with copy, lists, quotes) instead of raw text; exactly one status box while generating.
- **Orb composer polish** (`fix(agents)`) — purple square focus border removed; owner-directed 21st.dev orb asset docked left of the input.
- **Orb composer for chat mode** (`feat(agents)`) — OrbInput-style chat input with brand orb, typewriter placeholder, and preserved voice entry.
- **AI Configuration Synchronization Layer plan** (`docs`) — architecture & phased plan for DB→Redis→Provider Registry config sync.

Plus the previously merged preview stack (RAG fixes, embed hardening, sidebar/topbar redesign, voice infrastructure) since the last production release.

## Verification

- Type-check (0 errors), ESLint, full vitest suite (804/804), production webpack compile — all green.
- Voice lobby, mode toggle, and mic button wired to the unchanged realtime session contract.

_Left open for owner review — will be merged manually._
"""

if __name__ == "__main__":
    main()
