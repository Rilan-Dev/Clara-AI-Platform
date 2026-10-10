#!/usr/bin/env python3
"""Screenshot the two engineering diagrams from diagrams.html as PNGs at 2x
device scale (300dpi-equivalent) for ReportLab embedding.
Element screenshots: #diag1 -> assets/diagram_usage.png, #diag2 -> assets/diagram_retrieval.png
"""
from playwright.sync_api import sync_playwright

HTML = 'file:///home/z/my-project/scripts/diagrams.html'
OUT = '/home/z/my-project/scripts/assets'

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1180, 'height': 1360},
                            device_scale_factor=2)
    page.goto(HTML)
    page.wait_for_timeout(400)
    page.locator('#diag1').screenshot(path=f'{OUT}/diagram_usage.png')
    page.locator('#diag2').screenshot(path=f'{OUT}/diagram_retrieval.png')
    browser.close()

print('diagrams done')
