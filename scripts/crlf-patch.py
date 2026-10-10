#!/usr/bin/env python3
"""CRLF-safe patcher: apply string replacements in files regardless of
LF/CRLF line endings. Each edit is (old, new) with \n in the strings;
the script normalizes the file's line endings to match around the patch.
Usage: python3 crlf-patch.py <file> <old_json_file> <new_json_file>
Simpler: embed edits below (kept as a one-off patch script).
"""
import sys

def read(path):
    with open(path, "rb") as f:
        return f.read()

def write(path, data):
    with open(path, "wb") as f:
        f.write(data)

def apply(path, old, new):
    raw = read(path)
    # Detect the dominant line ending
    crlf = b"\r\n" in raw and raw.count(b"\r\n") > raw.count(b"\n") - raw.count(b"\r\n")
    # Normalize old/new to the file's ending
    if crlf:
        old_b = old.replace("\n", "\r\n").encode()
        new_b = new.replace("\n", "\r\n").encode()
    else:
        old_b = old.encode()
        new_b = new.encode()
    if old_b not in raw:
        print(f"FAIL: pattern not found in {path}:\n---\n{old[:200]}\n---")
        return False
    if raw.count(old_b) > 1:
        print(f"FAIL: pattern not unique in {path}")
        return False
    write(path, raw.replace(old_b, new_b, 1))
    print(f"OK: patched {path}")
    return True

if __name__ == "__main__":
    path = sys.argv[1]
    old = sys.argv[2]
    new = sys.argv[3]
    ok = apply(path, old, new)
    sys.exit(0 if ok else 1)
