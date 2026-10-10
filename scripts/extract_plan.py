#!/usr/bin/env python3
"""Extract Phase 0 and Phase 1 sections from the implementation plan PDF."""
import sys
from pypdf import PdfReader

reader = PdfReader("/home/z/my-project/download/Clara_AI_Platform_Implementation_Plan_Phase_by_Phase.pdf")
print(f"TOTAL PAGES: {len(reader.pages)}", file=sys.stderr)

full = []
for i, page in enumerate(reader.pages):
    text = page.extract_text() or ""
    full.append(f"\n===== PAGE {i+1} =====\n{text}")

all_text = "\n".join(full)

# Write full text to a file for reference
with open("/home/z/my-project/scripts/plan_full_text.txt", "w", encoding="utf-8") as f:
    f.write(all_text)

# Find Phase 0 and Phase 1 sections
lines = all_text.split("\n")
capture = False
section_lines = []
for line in lines:
    # Start capturing at Phase 0 chapter heading
    if "Phase 0" in line and ("Stabilisation" in line or "Stabilization" in line):
        capture = True
    # Stop at Phase 2 chapter
    elif capture and ("Phase 2" in line and ("Answer Quality" in line or "Trust" in line)):
        capture = False
    if capture:
        section_lines.append(line)

out = "\n".join(section_lines)
with open("/home/z/my-project/scripts/plan_phase01.txt", "w", encoding="utf-8") as f:
    f.write(out)
print(f"Phase 0+1 section: {len(out)} chars", file=sys.stderr)
print(out[:6000])
