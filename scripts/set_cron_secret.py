#!/usr/bin/env python3
"""Set the CRON_SECRET GitHub repo secret + save plaintext for Vercel setup.

- Generates a strong random secret (32 bytes, base64url).
- Encrypts it with the repo's Actions public key (Sealed Box via PyNaCl).
- PUTs it to GitHub as the CRON_SECRET repo secret.
- Writes the plaintext value to /home/z/my-project/download/vercel-cron-secret.txt
  so the user can copy the SAME value into the Vercel project env var.
- NEVER prints the secret value to stdout/chat.
"""
import base64
import json
import secrets
import subprocess
import sys
import urllib.request

sys.path.insert(0, "/home/z/.local/lib/python3.13/site-packages")
from nacl import encoding, public  # noqa: E402

REPO = "Rilan-Dev/Clara-AI-Platform"
SECRET_NAME = "CRON_SECRET"
OUT_FILE = "/home/z/my-project/download/vercel-cron-secret.txt"


def gh_token() -> str:
    url = subprocess.run(
        ["git", "-C", "/home/z/my-project/.worktrees/vc", "remote", "get-url", "origin"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return url.split("https://", 1)[1].split("@", 1)[0]


def api(method: str, path: str, body=None):
    req = urllib.request.Request(
        f"https://api.github.com{path}",
        method=method,
        headers={
            "Authorization": f"token {gh_token()}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
        },
        data=json.dumps(body).encode() if body is not None else None,
    )
    with urllib.request.urlopen(req) as res:
        raw = res.read()
        return res.status, (json.loads(raw) if raw else {})


def main() -> int:
    # 1. Generate secret
    value = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("=")

    # 2. Fetch repo public key
    status, pk = api("GET", f"/repos/{REPO}/actions/secrets/public-key")
    if status != 200 or "key" not in pk:
        print("FAILED to fetch public key:", status, json.dumps(pk)[:200])
        return 1
    print(f"repo public key: id={pk['key_id']}")

    # 3. Encrypt (sealed box)
    pk_obj = public.PublicKey(pk["key"].encode(), encoding.Base64Encoder())
    sealed = public.SealedBox(pk_obj)
    encrypted = base64.b64encode(sealed.encrypt(value.encode())).decode()

    # 4. PUT secret
    status, resp = api(
        "PUT",
        f"/repos/{REPO}/actions/secrets/{SECRET_NAME}",
        {"encrypted_value": encrypted, "key_id": pk["key_id"]},
    )
    if status not in (201, 204):
        print("FAILED to set secret:", status, json.dumps(resp)[:200])
        return 1
    print(f"GitHub repo secret {SECRET_NAME}: {'created (201)' if status == 201 else 'updated (204)'}")

    # 5. Save plaintext for the user's Vercel setup (not printed to chat)
    with open(OUT_FILE, "w") as f:
        f.write(value + "\n")
    print(f"plaintext saved to {OUT_FILE} (for Vercel env var setup)")
    print("secret length:", len(value), "chars")
    return 0


if __name__ == "__main__":
    sys.exit(main())
