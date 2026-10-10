#!/usr/bin/env python3
"""Poll GitHub deployments for the Vercel-Preview branch until the merge
commit reports a successful (or failed) deployment."""
import json
import re
import subprocess
import sys
import time
import urllib.request

REPO = "Rilan-Dev/Clara-AI-Platform"
SHA = sys.argv[1] if len(sys.argv) > 1 else None


def get_token() -> str:
    url = subprocess.run(
        ["git", "-C", "/home/z/my-project/.worktrees/vc", "config", "--get", "remote.origin.url"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    m = re.match(r"https://([^@]+)@github\.com", url)
    creds = m.group(1)
    return creds.split(":", 1)[1] if ":" in creds else creds


def gh(path: str, token: str):
    req = urllib.request.Request(f"https://api.github.com{path}", headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "clara-deploy-poll",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
        return json.loads(raw) if raw else {}


def main():
    token = get_token()
    deadline = time.time() + 20 * 60  # 20 min cap
    seen = set()
    while time.time() < deadline:
        deployments = gh(f"/repos/{REPO}/deployments?ref={SHA or 'Vercel-Preview'}&per_page=10", token) \
            if SHA else gh(f"/repos/{REPO}/deployments?environment=preview&per_page=10", token)
        for d in deployments:
            if SHA and d.get("sha") != SHA:
                continue
            did = d["id"]
            if did in seen:
                continue
            seen.add(did)
            statuses = gh(f"/repos/{REPO}/deployments/{did}/statuses", token)
            state = statuses[0]["state"] if statuses else "pending"
            print(f"deployment {did} @ {d.get('sha', '')[:8]} env={d.get('environment')} -> {state}", flush=True)
            if state == "success":
                print("DEPLOY SUCCESS")
                return
            if state == "failure":
                print("DEPLOY FAILURE")
                sys.exit(1)
        time.sleep(20)
    print("timeout waiting for deployment")
    sys.exit(1)


if __name__ == "__main__":
    main()
