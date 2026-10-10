#!/usr/bin/env python3
"""Merge cover + body into the final implementation plan PDF with A4 normalization
and branded metadata."""
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89

COVER = '/home/z/my-project/scripts/cover_plan.pdf'
BODY = '/home/z/my-project/scripts/body.pdf'
OUT = '/home/z/my-project/download/Clara_AI_Platform_Implementation_Plan_Phase_by_Phase.pdf'


def normalize_page_to_a4(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if abs(w - A4_W) > 2 or abs(h - A4_H) > 2:
        page.scale_to(A4_W, A4_H)
    return page


writer = PdfWriter()
cover_page = PdfReader(COVER).pages[0]
# Always scale cover exactly to A4 to avoid 72/96dpi sub-point drift
cover_page.scale_to(A4_W, A4_H)
writer.add_page(cover_page)
for page in PdfReader(BODY).pages:
    writer.add_page(normalize_page_to_a4(page))

writer.add_metadata({
    '/Title': 'Clara AI Platform - Phase-by-Phase Implementation Plan and Engineering Blueprint',
    '/Author': 'Z.ai',
    '/Creator': 'Z.ai',
    '/Subject': 'Execution companion to the feature gap analysis: four sequenced phases '
                'covering stabilisation, metering and enforcement, answer quality, and '
                'enterprise readiness for the Clara AI platform.',
})
with open(OUT, 'wb') as f:
    writer.write(f)
print('merged:', OUT)
