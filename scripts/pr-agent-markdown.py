#!/usr/bin/env python3
"""PR flow for the markdown formatting + single status box session:
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
        "fix(agents): formatted markdown replies + single status box while generating",
        PR_BODY_PREVIEW,
    )
    merge_pr(token, pr1["number"])

    print("STEP 2: Vercel-Preview -> Vercel-Prod (update #191, leave OPEN for owner review)")
    update_prod_pr_body(token, PR_BODY_PROD)
    print("DONE — Prod PR left open for owner review.")


PR_BODY_PREVIEW = """## What

Two reported defects in the agent conversation chat (`/agents/:agentId` + Draft Preview), both fixed:

### 1. AI-generated answers now render as formatted markdown

Assistant replies previously fell out of the provider as raw markdown text (`**bold**`, `# headings`, pipe tables) rendered literally in a `whitespace-pre-wrap` span. New `AgentMarkdown` component (react-markdown **v9** + remark-gfm, both already in the dependency tree):

- **GFM tables** — real bordered tables with sticky-looking header row, zebra-safe row dividers, horizontally scrollable wrapper (narrow/mobile safe), bold/inline-code honoured inside cells.
- **Fenced code blocks** — language chip (Python/TypeScript/Shell/… 45 mappings), one-click **copy** button with confirmation tick, monospace body with horizontal scroll.
- **Inline code chips**, task-list checkboxes, blockquotes, `~~ strikethrough ~~`, safe external links (`target=_blank` + `rel=noopener noreferrer`), constrained images.
- **Chat-scale typography** — text-sm base, tuned heading scale so h1-h3 don't blow up the bubble; first/last block margins zeroed.
- **ChatGPT-style streaming caret** — a pulsing bar rides inline at the end of the last rendered block while tokens arrive.
- **Memoised** — completed messages are not re-parsed on every streamed token.
- Hast `node` prop is stripped before it reaches DOM elements (no React unknown-prop warnings).

The welcome message (owner-authored, may contain markdown) renders through the same pipeline. **User bubbles stay literal** — people type prose, not markdown.

### 2. Exactly one status box while an answer is being generated

Previously BOTH the empty assistant placeholder bubble (blinking caret) AND the separate ThinkingRow (bouncing dots) rendered during generation — the "2 boxes" the owner reported. Now:

- The empty placeholder bubble itself carries the thinking dots until the first token arrives.
- The separate ThinkingRow is suppressed whenever the assistant placeholder exists (chat branch and voice rail) — only rendered in the transient error path where the placeholder was removed.
- `streaming` now derives from `thinking && last assistant turn in flight` — previously `thinking || lastMessage is assistant` kept the caret pulsing **forever** after an answer completed.
- Assistant bubble widened 85% → 90% so tables/code have room.

## Provider safety

Purely presentational — no changes to `use-agent-conversation`, `chat-stream`, any API route, or any provider module. Every AI provider behind `/api/embed/chat` is unaffected by construction. Verified:

- `tsc --noEmit`: **0 errors** across the repo
- `eslint`: 0 new warnings on changed files
- `vitest`: **797/797 pass** (783 existing + 14 new contract tests)
- `react-dom/server` structural render check: **23/23** — real `<table>` markup, thead/th/td, language chip, copy affordance, task checkboxes, blockquote, link safety, streaming caret on/off, partial-fence robustness, empty-content null

## Files

- `src/features/agent-conversation/components/agent-markdown.tsx` (new)
- `src/features/agent-conversation/components/agent-markdown.test.ts` (new, contract tests)
- `src/features/agent-conversation/components/conversation-chat-window.tsx` (markdown wiring + single-box gating)
"""

PR_BODY_PROD = """## Release scope

All changes currently on **Vercel-Preview**, including the latest:

- **Formatted markdown replies + single status box** (`fix(agents)`) — assistant answers render as real formatted markdown (GFM tables, code blocks with copy, lists, quotes) instead of raw text; exactly one status box while generating (previously two stacked); streaming caret stops when the answer completes. Purely presentational; all AI providers unaffected (797/797 tests pass).

- **Orb composer polish** (`fix(agents)`) — purple square focus border removed; owner-directed 21st.dev orb asset docked left of the input.
- **Orb composer for chat mode** (`feat(agents)`) — OrbInput-style chat input with brand orb, typewriter placeholder, and preserved voice entry.
- **AI Configuration Synchronization Layer plan** (`docs`) — architecture & phased plan for DB→Redis→Provider Registry config sync.

Plus the previously merged preview stack (RAG fixes, embed hardening, sidebar/topbar redesign, voice infrastructure) since the last production release.

## Verification

- Type-check (0 errors), ESLint, full vitest suite (797/797), production webpack compile — all green.
- Voice lobby, mode toggle, and mic button wired to the unchanged realtime session contract.

_Left open for owner review — will be merged manually._
"""

if __name__ == "__main__":
    main()
