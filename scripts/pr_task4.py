#!/usr/bin/env python3
"""PR flow for task 4:
1. PR Vite-Converted -> Vercel-Preview, MERGE it (assistant merges this one).
2. PR Vercel-Preview -> Vercel-Prod, LEAVE OPEN for the user's review.
"""
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

REPO = "Rilan-Dev/Clara-AI-Platform"

TITLE = "feat(platform): auto-save drafts, single-save credentials, one-navbar workspace, FAQ tab, Sarvam realtime fix"

BODY = """## Summary

Platform-wide save policy, one-navbar agent workspace (per mock), FAQ tab, and the Sarvam voice-session fix.

### Auto-save (no Save button on config surfaces)
- **ConfigEditor** (org agents + platform default assistant): `Save Configuration`/`Unsaved changes` bars replaced by debounced (1.5 s) latest-wins auto-save; echo-guarded so refetched drafts never clobber in-flight typing; shared **AutoSaveChip** status row
- **AI runtime selection**: per-input `Save AI selection to draft` button removed — picks persist 800 ms after change
- New `useAutoSave` hook: debounce, latest-wins, `beforeunload` guard, unmount flush, baseline echo-guard API
- Draft writes serialized through a queue + freshest-draft ref so concurrent editors never revert each other's fields

### Credential surfaces keep ONE explicit form-level Save
- **Payments** + **Email delivery**: per-input save icons/buttons removed; single sticky Save bar with dirty tracking (blank secret = unchanged), save-time validation with inline field errors, sequential two-step HMAC env writes. Activate / test-email remain explicit actions.

### One-navbar agent workspace (ElevenLabs mock)
- Navbar carries identity + section tabs (**Overview / Main / FAQ / Knowledge / Tools / Branches / Publish**) + version cluster (**Main / vN / Draft changes / Published vN / live "Draft saved just now"**) + **Preview / Publish** actions in one row
- Sidebar agent tab groups removed — the rail is agent switching only

### FAQ tab (managed canonical Q/A)
- `faq_items` jsonb on `assistant_configs` (migration **056**), rides the draft -> version -> publish pipeline, injected into the composed system prompt, mirrored in the prompt preview; auto-saved editor at `/orgs/[id]/agents/[agentId]/faq`

### Sarvam / ElevenLabs voice fix
- Pipeline endpoints (session/tts/transcribe) now resolve the **realtime** purpose axis — orgs with realtime=sarvam while voice-chat runs another provider no longer get `409 non-Sarvam provider` (the reported `"provider":"sarvam"` 409)

### Voices card
- Fixed max-height + scroll for large catalogs (Sarvam exposes 20+ voices) with a voice-count badge

## Verification
- `tsc --noEmit`: 0 errors
- ESLint changed files: 0 errors / 0 new warnings
- Vitest: 682 passed, 32 failed — identical to clean-HEAD baseline (stash-verified; all pre-existing env-dependent)
- `next build`: success (FAQ route in output)
"""


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
        except Exception:
            return e.code, {}


def main() -> None:
    token = get_token()

    def find_open_pr(base: str, head: str):
        status, data = gh("GET", f"/repos/{REPO}/pulls?state=open&base={base}&head=Rilan-Dev:{head}&per_page=5", token)
        if status == 200:
            for pr in data:
                if pr["base"]["ref"] == base and pr["head"]["ref"] == head:
                    return pr
        return None

    # ── 1. Vite-Converted -> Vercel-Preview, then MERGE ─────────────────────
    pr = find_open_pr("Vercel-Preview", "Vite-Converted")
    if pr:
        print(f"existing PR #{pr['number']} found (state={pr['state']})")
    else:
        status, created = gh("POST", f"/repos/{REPO}/pulls", token, {
            "title": TITLE,
            "body": BODY,
            "head": "Vite-Converted",
            "base": "Vercel-Preview",
        })
        if status not in (200, 201):
            sys.exit(f"ERROR creating Preview PR: {status} {json.dumps(created)[:500]}")
        print(f"created PR #{created['number']} -> Vercel-Preview: {created['html_url']}")
        pr = created

    number = pr["number"]
    # Wait for mergeability (null = GitHub still computing)
    for _ in range(30):
        status, full = gh("GET", f"/repos/{REPO}/pulls/{number}", token)
        if status == 200 and full.get("mergeable") is not None:
            break
        time.sleep(2)
    mergeable = full.get("mergeable")
    print(f"PR #{number} mergeable={mergeable}")
    if not mergeable:
        sys.exit("ERROR: Preview PR is NOT mergeable — resolve conflicts first")

    status, merged = gh("PUT", f"/repos/{REPO}/pulls/{number}/merge", token, {
        "merge_method": "merge",
        "commit_title": f"Merge pull request #{number} from Rilan-Dev/Vite-Converted",
    })
    if status not in (200,):
        sys.exit(f"ERROR merging Preview PR: {status} {json.dumps(merged)[:500]}")
    print(f"MERGED PR #{number} into Vercel-Preview (sha={merged.get('sha', '?')[:8]})")

    # ── 2. Vercel-Preview -> Vercel-Prod, LEAVE OPEN for user review ────────
    prod_body = BODY + "\n\n---\n\n**Review note:** merged into Vercel-Preview via PR #" + str(number) + ". Left open for maintainer review — merge when ready."
    prod_pr = find_open_pr("Vercel-Prod", "Vercel-Preview")
    if prod_pr:
        print(f"existing Prod PR #{prod_pr['number']} (state={prod_pr['state']}) — leaving open for review")
        print(prod_pr["html_url"])
        return
    status, created = gh("POST", f"/repos/{REPO}/pulls", token, {
        "title": "release: auto-save + one-navbar workspace + FAQ tab + Sarvam realtime fix (Preview -> Prod)",
        "body": prod_body,
        "head": "Vercel-Preview",
        "base": "Vercel-Prod",
    })
    if status not in (200, 201):
        sys.exit(f"ERROR creating Prod PR: {status} {json.dumps(created)[:500]}")
    print(f"created PR #{created['number']} -> Vercel-Prod (LEFT OPEN for user review): {created['html_url']}")


if __name__ == "__main__":
    main()
