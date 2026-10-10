#!/usr/bin/env python3
"""Merge cover + body into final PDF, normalize page sizes, set metadata."""
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89

COVER = '/home/z/my-project/scripts/cover.pdf'
BODY = '/home/z/my-project/scripts/body.pdf'
OUT = '/home/z/my-project/download/Clara_AI_Platform_Feature_Gap_Analysis_and_AI_Enhancement_Roadmap.pdf'


def normalize(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if abs(w - A4_W) > 0.3 or abs(h - A4_H) > 0.3:
        page.scale_to(A4_W, A4_H)
    return page


writer = PdfWriter()
writer.add_page(normalize(PdfReader(COVER).pages[0]))
for page in PdfReader(BODY).pages:
    writer.add_page(normalize(page))

writer.add_metadata({
    '/Title': 'Clara AI Platform — Feature Gap Analysis & AI Enhancement Roadmap',
    '/Author': 'Z.ai',
    '/Creator': 'Z.ai',
    '/Subject': 'Feature gap analysis and AI enhancement roadmap for the Clara AI platform',
})
with open(OUT, 'wb') as f:
    writer.write(f)

r = PdfReader(OUT)
print('final PDF:', OUT)
print('pages:', len(r.pages))
for i, p in enumerate(r.pages):
    w, h = float(p.mediabox.width), float(p.mediabox.height)
    assert abs(w - A4_W) <= 2 and abs(h - A4_H) <= 2, f'page {i+1} size {w}x{h}'
print('all pages A4-normalized OK')
