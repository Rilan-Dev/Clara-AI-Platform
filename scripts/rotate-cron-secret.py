#!/usr/bin/env python3
"""
Rotate the CRON_SECRET GitHub repo secret for Rilan-Dev/Clara-AI-Platform.

Why rotation: the previous plaintext backup (download/vercel-cron-secret.txt)
was lost when the sandbox reset, and GitHub repo secrets are write-only
(they can never be read back). The only guaranteed path to a consistent
state is: generate a fresh value -> update the GitHub secret -> hand the
plaintext to the user so they can set the identical value in the Vercel
project env (Production + Preview).

Never prints the token or the secret value to stdout.
"""
import base64
import json
import os
import re
import secrets as pysecrets
import subprocess
import sys
import urllib.error
import urllib.request

from nacl import encoding, public

REPO = "Rilan-Dev/Clara-AI-Platform"
SECRET_NAME = "CRON_SECRET"
OUT_FILE = "/home/z/my-project/download/vercel-cron-secret.txt"


def get_token() -> str:
    """Extract the GitHub token embedded in the git remote URL (never print it)."""
    url = subprocess.run(
        ["git", "-C", "/home/z/my-project", "config", "--get", "remote.origin.url"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    m = re.match(r"https://([^@]+)@github\.com", url)
    if not m:
        sys.exit("ERROR: no token found in git remote URL")
    creds = m.group(1)
    if ":" in creds:  # e.g. "x-access-token:ghp_xxx" -> password part
        creds = creds.split(":", 1)[1]
    return creds


def gh(method: str, path: str, token: str, body=None):
    url = f"https://api.github.com{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, method=method, data=data, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "clara-cron-secret-rotate",
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


def main() -> None:
    token = get_token()

    # 0) sanity check repo access + token scopes
    status, repo = gh("GET", f"/repos/{REPO}", token)
    if status != 200:
        sys.exit(f"ERROR: cannot access repo (HTTP {status}): {repo.get('message')}")
    print(f"[1/5] repo access OK: {repo['full_name']} (private={repo['private']})")

    # 1) generate a fresh high-entropy secret (43-char url-safe, ~256 bits)
    new_secret = pysecrets.token_urlsafe(32)

    # 2) fetch the repo actions public key
    status, pk = gh("GET", f"/repos/{REPO}/actions/secrets/public-key", token)
    if status != 200:
        sys.exit(
            f"ERROR: cannot fetch public key (HTTP {status}): {pk.get('message')} "
            "-- token lacks secrets:write (repo) permission"
        )
    print(f"[2/5] actions public key fetched (key_id={pk['key_id']})")

    # 3) encrypt with PyNaCl SealedBox and PUT the secret
    pk_obj = public.PublicKey(pk["key"], encoding.Base64Encoder())
    sealed = public.SealedBox(pk_obj)
    encrypted = sealed.encrypt(new_secret.encode("utf-8"))
    status, resp = gh(
        "PUT",
        f"/repos/{REPO}/actions/secrets/{SECRET_NAME}",
        token,
        {
            "encrypted_value": base64.b64encode(encrypted).decode("ascii"),
            "key_id": pk["key_id"],
        },
    )
    if status not in (201, 204):
        sys.exit(f"ERROR: failed to set secret (HTTP {status}): {resp.get('message')}")
    action = "created" if status == 201 else "updated (rotated)"
    print(f"[3/5] GitHub repo secret '{SECRET_NAME}' {action}")

    # 4) verify via the secrets listing (names + timestamps only)
    status, listing = gh("GET", f"/repos/{REPO}/actions/secrets", token)
    entries = listing.get("secrets", [])
    names = [s["name"] for s in entries]
    stamp = next((s["updated_at"] for s in entries if s["name"] == SECRET_NAME), None)
    print(f"[4/5] repo secrets now: {', '.join(names) if names else '(none)'}")
    print(f"      {SECRET_NAME} updated_at = {stamp}")

    # 5) write the plaintext for the user's Vercel setup (mode 0600)
    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, "w") as f:
        f.write(new_secret + "\n")
    os.chmod(OUT_FILE, 0o600)
    print(f"[5/5] plaintext written to {OUT_FILE} ({len(new_secret)} chars, mode 0600)")
    print("\nDONE. Next: set this value as CRON_SECRET in Vercel (Production + Preview), redeploy, then delete the file.")


if __name__ == "__main__":
    main()
