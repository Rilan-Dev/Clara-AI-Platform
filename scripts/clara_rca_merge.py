#!/usr/bin/env python3
"""Merge cover PDF (Playwright) + body PDF (ReportLab) into the final report."""
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89

COVER = "/home/z/my-project/scripts/clara_rca_cover.pdf"
BODY = "/home/z/my-project/scripts/clara_rca_body.pdf"
OUT = "/home/z/my-project/download/Clara-AI-Platform-UI-Regression-Root-Cause-Analysis.pdf"


def normalize_page_to_a4(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if abs(w - A4_W) > 0.1 or abs(h - A4_H) > 0.1:
        page.scale_to(A4_W, A4_H)
    return page


writer = PdfWriter()
cover_page = PdfReader(COVER).pages[0]
writer.add_page(normalize_page_to_a4(cover_page))
for page in PdfReader(BODY).pages:
    writer.add_page(normalize_page_to_a4(page))
writer.add_metadata({
    "/Title": "Clara AI Platform - UI Regression Root Cause Analysis",
    "/Author": "Z.ai",
    "/Creator": "Z.ai",
    "/Subject": "Root cause analysis of the Tailwind v4 migration UI regression "
                "on the Clara AI Platform self-hosted deployment",
})
with open(OUT, "wb") as f:
    writer.write(f)
print("final pdf:", OUT, "pages:", len(writer.pages))
