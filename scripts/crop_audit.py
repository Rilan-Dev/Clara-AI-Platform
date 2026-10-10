#!/usr/bin/env python3
"""Crop mobile-audit screenshots into vertical strips and measure ink coverage to find blank regions."""
import sys
from PIL import Image

def analyze(path, strip_h=400):
    img = Image.open(path)
    w, h = img.size
    print(f"{path}: {w}x{h}")
    gray = img.convert("L")
    blanks = []
    for top in range(0, h, strip_h):
        strip = gray.crop((0, top, w, min(top + strip_h, h)))
        pixels = list(strip.getdata())
        non_bg = sum(1 for p in pixels if p > 35)
        ratio = non_bg / len(pixels)
        if ratio < 0.02:
            blanks.append((top, min(top + strip_h, h), round(ratio, 4)))
    if blanks:
        print("Mostly-blank strips (top-range, ink ratio):")
        for b in blanks:
            print(f"  {b[0]}-{b[1]}px: {b[2]}")
    else:
        print("No blank strips found")
    return blanks

if __name__ == "__main__":
    analyze(sys.argv[1])
