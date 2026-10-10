#!/usr/bin/env python3
"""PR flow for the publish-actions-dropdown session:
1. PR Vite-Converted -> Vercel-Preview, self-merge (deploys preview)
2. Update the standing Vercel-Preview -> Vercel-Prod PR body (leave OPEN for owner review)
"""
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request

REPO = "Rilan-Dev/Clara-AI-Platform"
STANDING_PR = 191  # Vercel-Preview -> Vercel-Prod, kept open for the owner


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
            return e.code, json.loads(raw or b"{}")
        except json.JSONDecodeError:
            return e.code, {}


PR_BODY = """## What (per owner request — dropdown on the navbar "Publish update" button)

The topbar **Publish update** button becomes a split button: the primary segment keeps one-click publish; a new chevron opens the deployment actions menu.

### Menu contents
**With pending draft changes:**
- View pending changes
- Publish to a new branch
- Deploy traffic
- View all branches
- Copy shareable link
- Copy version permalink
- Discard changes

**Without drafts:** the same menu minus the two draft-only items (View pending changes, Discard changes).

### View pending changes → "Review Changes" modal
- Header shows the publishing target (`Support agent / Main`) and an editable **commit message** (auto-suggested from the changed fields, e.g. "Update first message")
- **Overview tab** — semantic diff with strikethrough old values → new values; long values (system prompts) render in a **side-by-side split view** (Published version | Current changes)
- **Raw JSON tab** — side-by-side line diff of both configurations with line numbers, red/green highlighting and GitHub-style **"Expand N lines …"** collapsing
- Footer: Cancel / **Publish changes** (saves the draft as a version with the commit message, then routes production to it)
- The old "Draft changes" drawer is replaced by this modal; the Draft changes pill opens it too

### Other menu actions
- **Publish to a new branch** → Branches page with the create-branch drawer pre-opened (`/versions?create=1`, URL cleaned after opening)
- **Deploy traffic** → modal that routes production traffic to any saved version (publish/rollback semantics; public/private access preserved; current live version shown at 100%)
- **Copy shareable link** → copies the stable hosted published page (`/agents/:id`) **directly** — no detour through the Publish tab's "Generate explore link" flow; toast shows the URL with an Open action
- **Copy version permalink** → copies the published page pinned to the exact live version (`/agents/:id?v=N`)
- **Discard changes** → confirm modal; resets the draft to the current version's configuration and reloads so open editors drop stale state

### Publish tab
- The duplicate **"Open the published preview ↗"** button is removed — previewing lives in the navbar only

## Technical notes
- New `src/features/admin/layouts/publish-menu.tsx` (dropdown + Deploy traffic + Discard modals), `publish-review-dialog.tsx` (Review Changes modal), `json-diff.ts` (pure LCS line-diff + collapse helpers — no new dependency)
- `agent-topbar.tsx`: split-button wiring; `DraftChangesDrawer` removed (replaced by `ReviewChangesDialog`)
- `versions-screen.tsx`: `?create=1` deep link; `publish-screen.tsx`: preview button removed
- Provider-neutral: no AI provider / transport code touched

## Verification
- `npx tsc --noEmit` → 0 errors
- `npx eslint <changed files>` → 0 errors
- `npx vitest run` → **883/883 pass** (99 files, incl. 39 new layout tests: 15 json-diff unit + 24 source-contract)
- `npm run validate:model-config` → passed
- Live verification on the preview deployment follows the merge"""


STANDING_ADDENDUM = """

---

### 2026-09-26 addition — publish actions dropdown (topbar)

- Split-button **Publish update ▾** on the agent topbar: menu with View pending changes / Publish to a new branch / Deploy traffic / View all branches / Copy shareable link / Copy version permalink / Discard changes (draft-only items hidden without drafts)
- New **Review Changes** modal (Overview semantic diff with strikeouts + split view for long values; Raw JSON side-by-side line diff with "Expand N lines …"; commit message; publish)
- Deploy traffic modal routes production to any saved version; copy actions copy the stable published page URL / version-pinned permalink directly
- Publish tab: duplicate "Open the published preview" button removed (navbar owns previewing)
- Verified: tsc 0 errors · eslint 0 errors · vitest 883/883"""


def main():
    token = get_token()

    # 1. Vite-Converted -> Vercel-Preview (create + self-merge to deploy preview)
    status, pr = gh("POST", f"/repos/{REPO}/pulls", token, {
        "title": "feat(admin): publish actions dropdown on the topbar Publish button",
        "head": "Vite-Converted",
        "base": "Vercel-Preview",
        "body": PR_BODY,
    })
    if status != 201:
        sys.exit(f"ERROR creating PR Vite-Converted->Vercel-Preview (HTTP {status}): {json.dumps(pr)[:500]}")
    num = pr["number"]
    print(f"PR #{num} created: Vite-Converted -> Vercel-Preview")
    print(f"  {pr['html_url']}")

    status, merged = gh("PUT", f"/repos/{REPO}/pulls/{num}/merge", token, {
        "merge_method": "merge",
    })
    if status != 200:
        sys.exit(f"ERROR merging PR #{num} (HTTP {status}): {json.dumps(merged)[:300]}")
    print(f"PR #{num} MERGED into Vercel-Preview at {merged.get('sha')}")

    # 2. Standing Vercel-Preview -> Vercel-Prod PR — append the session summary, keep OPEN
    status, standing = gh("GET", f"/repos/{REPO}/pulls/{STANDING_PR}", token)
    if status != 200:
        print(f"WARNING: could not read standing PR #{STANDING_PR} (HTTP {status}) — skipping body update")
        return
    body = (standing.get("body") or "") + STANDING_ADDENDUM
    status, updated = gh("PATCH", f"/repos/{REPO}/pulls/{STANDING_PR}", token, {"body": body})
    if status != 200:
        print(f"WARNING: could not update standing PR #{STANDING_PR} body (HTTP {status})")
    else:
        print(f"Standing PR #{STANDING_PR} body updated (left OPEN for owner review)")
        print(f"  {updated.get('html_url')}")


if __name__ == "__main__":
    main()
