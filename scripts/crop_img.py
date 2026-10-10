#!/usr/bin/env python3
"""Crop top/bottom regions of mobile screenshots for closer VLM inspection."""
import sys
from PIL import Image

def crop(path, out, top_ratio=0.0, bottom_ratio=1.0, scale=2):
    img = Image.open(path)
    w, h = img.size
    top = int(h * top_ratio)
    bot = int(h * bottom_ratio)
    c = img.crop((0, top, w, bot))
    if scale != 1:
        c = c.resize((int(c.width * scale), int(c.height * scale)), Image.LANCZOS)
    c.save(out)
    print(f"saved {out} {c.size}")

if __name__ == "__main__":
    path, out = sys.argv[1], sys.argv[2]
    top = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
    bot = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
    crop(path, out, top, bot)
