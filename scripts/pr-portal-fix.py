#!/usr/bin/env python3
"""PR flow for the portal fix: Vite-Converted -> Vercel-Preview, self-merge."""
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request

REPO = "Rilan-Dev/Clara-AI-Platform"


def get_token() -> str:
    url = subprocess.run(
        ["git", "-C", "/home/z/my-project/.worktrees/vc", "config", "--get", "remote.origin.url"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    m = re.match(r"https://([^@]+)@github\.com", url)
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
        "title": "fix(admin): portal the publish dialogs to body (backdrop-blur containing block)",
        "head": "Vite-Converted",
        "base": "Vercel-Preview",
        "body": """## Fix found during live verification of the publish-actions dropdown

The sticky topbar header uses `backdrop-blur-md`, which creates a CSS **containing block** for fixed-position descendants. The new Review Changes / Deploy traffic / Discard changes overlays are rendered inside the header (via `AgentTopbarCluster`), so their `position: fixed; inset: 0` was resolved against the **63px header strip** instead of the viewport: the dialogs existed in the accessibility tree and their actions fired, but were visually invisible.

**Fix:** render all three dialogs through `createPortal(…, document.body)`, escaping the header's containing block. Regression-locked by a source-contract test.

Verification: tsc 0 errors · eslint 0 errors · vitest 884/884 (40 layout tests incl. the portal assertion).""",
    })
    if status != 201:
        sys.exit(f"ERROR creating PR (HTTP {status}): {json.dumps(pr)[:500]}")
    num = pr["number"]
    print(f"PR #{num} created: {pr['html_url']}")
    status, merged = gh("PUT", f"/repos/{REPO}/pulls/{num}/merge", token, {"merge_method": "merge"})
    if status != 200:
        sys.exit(f"ERROR merging PR #{num} (HTTP {status}): {json.dumps(merged)[:300]}")
    print(f"PR #{num} MERGED into Vercel-Preview at {merged.get('sha')}")
    return merged.get("sha")


if __name__ == "__main__":
    main()
