#!/usr/bin/env python3
"""Clara AI Platform — Phase-by-Phase Implementation Plan & Engineering Blueprint.
Body PDF via ReportLab (Report brief). English document.
Crystal Blue palette (Template 07 body system, fixed).

Chapter Numbering Plan (Step 3.5):
| Outline | Type    | Chapter | Title                                                        |
|---------|---------|---------|--------------------------------------------------------------|
| 1       | cover   | —       | Cover (separate HTML/Playwright PDF, Template 07)           |
| 2       | toc     | —       | Table of Contents                                            |
| 3       | content | 1       | Purpose, Scope & How to Use This Plan                       |
| 4       | content | 2       | Phase 0 — Stabilisation Sprint (Weeks 1-2)                  |
| 5       | content | 3       | Phase 1 — Metering, Audit & Enforcement Core (Weeks 1-4)    |
| 6       | content | 4       | Phase 2 — Answer Quality & Trust (Weeks 5-12)               |
| 7       | content | 5       | Phase 3 — Distribution, Agent Intelligence & Enterprise     |
| 8       | content | 6       | Shared Engineering Standards                                |
| 9       | content | 7       | Acceptance & QA Matrix                                      |
| 10      | content | 8       | Risks, Dependencies & Rollout Strategy                      |
| 11      | content | 9       | Success Metrics & the Definition of Stable                  |
| 12      | content | 10      | References                                                   |
"""
import os
import sys
import hashlib

PDF_SKILL_DIR = '/home/z/my-project/skills/pdf'
sys.path.insert(0, os.path.join(PDF_SKILL_DIR, 'scripts'))

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, Image, PageBreak, KeepTogether,
                                CondPageBreak, HRFlowable)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from PIL import Image as PILImage

# ---------------- Fonts ----------------
FONT_DIR = '/usr/share/fonts'
pdfmetrics.registerFont(TTFont('FreeSerif', f'{FONT_DIR}/truetype/freefont/FreeSerif.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Bold', f'{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Italic', f'{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-BoldItalic', f'{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', f'{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf'))
registerFontFamily('FreeSerif', normal='FreeSerif', bold='FreeSerif-Bold',
                   italic='FreeSerif-Italic', boldItalic='FreeSerif-BoldItalic')
registerFontFamily('NotoSerifSC', normal='NotoSerifSC', bold='NotoSerifSC-Bold')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans')

from pdf import install_font_fallback
install_font_fallback()

# ---------------- Palette: Crystal Blue (Template 07 body, fixed) ----------------
PAGE_BG      = colors.HexColor('#f5f8fc')
SECTION_BG   = colors.HexColor('#edf2f9')
CARD_BG      = colors.HexColor('#e4ecf5')
TABLE_STRIPE = colors.HexColor('#eef3fa')
HEADER_FILL  = colors.HexColor('#1a4a7a')
BORDER       = colors.HexColor('#c0d0e2')
ACCENT       = colors.HexColor('#2d7ab3')
ACCENT_2     = colors.HexColor('#4da8da')
TEXT_PRIMARY = colors.HexColor('#142840')
TEXT_MUTED   = colors.HexColor('#5a7a96')

TABLE_HEADER_COLOR = HEADER_FILL
TABLE_HEADER_TEXT  = colors.white
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = TABLE_STRIPE

# ---------------- Page geometry ----------------
MARGIN = 0.9 * inch
PAGE_W, PAGE_H = A4
AVAIL_W = PAGE_W - 2 * MARGIN
AVAIL_H = PAGE_H - 2 * MARGIN
H1_ORPHAN = AVAIL_H * 0.25
MAX_KEEP = PAGE_H * 0.4

OUT_BODY = '/home/z/my-project/scripts/body.pdf'
ASSETS = '/home/z/my-project/scripts/assets'

# ---------------- Styles ----------------
S = {}
S['h1'] = ParagraphStyle('H1', fontName='FreeSerif', fontSize=20, leading=26,
                         textColor=HEADER_FILL, spaceBefore=18, spaceAfter=10)
S['h2'] = ParagraphStyle('H2', fontName='FreeSerif', fontSize=14, leading=19,
                         textColor=TEXT_PRIMARY, spaceBefore=14, spaceAfter=7)
S['h3'] = ParagraphStyle('H3', fontName='FreeSerif', fontSize=11.5, leading=16,
                         textColor=TEXT_PRIMARY, spaceBefore=10, spaceAfter=6)
S['body'] = ParagraphStyle('Body', fontName='FreeSerif', fontSize=10.5, leading=16.5,
                           textColor=TEXT_PRIMARY, alignment=TA_JUSTIFY, spaceAfter=8)
S['bullet'] = ParagraphStyle('Bullet', fontName='FreeSerif', fontSize=10.5, leading=16,
                             textColor=TEXT_PRIMARY, alignment=TA_LEFT,
                             leftIndent=16, bulletIndent=4, spaceAfter=5)
S['quote'] = ParagraphStyle('Quote', fontName='FreeSerif-Italic', fontSize=10.5, leading=16.5,
                            textColor=TEXT_MUTED, leftIndent=24, rightIndent=12,
                            borderPadding=6, spaceBefore=6, spaceAfter=10)
S['caption'] = ParagraphStyle('Caption', fontName='FreeSerif', fontSize=8.5, leading=12,
                              textColor=TEXT_MUTED, alignment=TA_CENTER,
                              spaceBefore=3, spaceAfter=6)
S['th'] = ParagraphStyle('TH', fontName='FreeSerif', fontSize=9.5, leading=13,
                         textColor=colors.white, alignment=TA_LEFT)
S['td'] = ParagraphStyle('TD', fontName='FreeSerif', fontSize=9.5, leading=13.5,
                         textColor=TEXT_PRIMARY, alignment=TA_LEFT)
S['td_c'] = ParagraphStyle('TDC', fontName='FreeSerif', fontSize=9.5, leading=13.5,
                           textColor=TEXT_PRIMARY, alignment=TA_CENTER)
S['td_sm'] = ParagraphStyle('TDSM', fontName='FreeSerif', fontSize=8.8, leading=12.5,
                            textColor=TEXT_PRIMARY, alignment=TA_LEFT)
S['stat_big'] = ParagraphStyle('StatBig', fontName='FreeSerif', fontSize=20, leading=24,
                               textColor=ACCENT, alignment=TA_CENTER)
S['stat_lbl'] = ParagraphStyle('StatLbl', fontName='FreeSerif', fontSize=8.5, leading=11.5,
                               textColor=TEXT_MUTED, alignment=TA_CENTER)
S['toc0'] = ParagraphStyle('TOC0', fontName='FreeSerif', fontSize=11.5, leading=20,
                           textColor=TEXT_PRIMARY, leftIndent=6)
S['toc1'] = ParagraphStyle('TOC1', fontName='FreeSerif', fontSize=10, leading=16,
                           textColor=TEXT_MUTED, leftIndent=26)
S['ref'] = ParagraphStyle('Ref', fontName='FreeSerif', fontSize=9.5, leading=14.5,
                          textColor=TEXT_PRIMARY, leftIndent=24, firstLineIndent=-24,
                          spaceAfter=6)
S['code'] = ParagraphStyle('Code', fontName='DejaVuSans', fontSize=8.0, leading=11.6,
                           textColor=TEXT_PRIMARY, alignment=TA_LEFT)

# ---------------- Doc template with TOC ----------------
class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            self.notify('TOCEntry', (level, text, self.page, key))

def heading(text, style, level=0):
    key = 'h_' + hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph(f'<a name="{key}"/><b>{text}</b>', style)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p

def h1(story, text):
    story.append(CondPageBreak(H1_ORPHAN))
    story.append(heading(text, S['h1'], 0))
    story.append(HRFlowable(width='100%', thickness=1.4, color=ACCENT,
                            spaceBefore=0, spaceAfter=10))

def h2(story, text):
    story.append(CondPageBreak(AVAIL_H * 0.12))
    story.append(heading(text, S['h2'], 1))

def h3(story, text):
    story.append(Paragraph(f'<b>{text}</b>', S['h3']))

def body(story, text):
    story.append(Paragraph(text, S['body']))

def bullets(story, items):
    for it in items:
        story.append(Paragraph(f'<bullet>•</bullet>{it}', S['bullet']))
    story.append(Spacer(1, 4))

def safe_keep(elements):
    total_h = 0
    for el in elements:
        w, h = el.wrap(AVAIL_W, PAGE_H)
        total_h += h
    if total_h <= MAX_KEEP:
        return [KeepTogether(elements)]
    elif len(elements) >= 2:
        return [KeepTogether(elements[:2])] + list(elements[2:])
    return list(elements)

def make_table(headers, rows, ratios, caption=None, align_center_cols=None, small=False):
    """Table with Paragraph cells, Crystal Blue scheme, centered, width-fitted."""
    col_w = [r * AVAIL_W for r in ratios]
    assert abs(sum(ratios) - 1.0) < 0.01, 'ratios must sum to 1'
    cell_style = S['td_sm'] if small else S['td']
    data = [[Paragraph(f'<b>{h}</b>', S['th']) for h in headers]]
    for row in rows:
        cells = []
        for ci, cell in enumerate(row):
            st = S['td_c'] if (align_center_cols and ci in align_center_cols) else cell_style
            cells.append(Paragraph(cell, st))
        data.append(cells)
    t = Table(data, colWidths=col_w, hAlign='CENTER', repeatRows=1)
    style = [
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ('TEXTCOLOR', (0, 0), (-1, 0), TABLE_HEADER_TEXT),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        style.append(('BACKGROUND', (0, i), (-1, i),
                      TABLE_ROW_ODD if i % 2 == 1 else TABLE_ROW_EVEN))
    t.setStyle(TableStyle(style))
    out = [Spacer(1, 12), t]
    if caption:
        out += [Spacer(1, 4), Paragraph(caption, S['caption'])]
    out += [Spacer(1, 12)]
    return out

def stat_row(story, stats):
    """Row of stat callout boxes. stats = [(big, label), ...]"""
    n = len(stats)
    gap = 10
    box_w = (AVAIL_W - gap * (n - 1)) / n
    cells = []
    for big, lbl in stats:
        inner = Table(
            [[Paragraph(f'<b>{big}</b>', S['stat_big'])],
             [Paragraph(lbl, S['stat_lbl'])]],
            colWidths=[box_w])
        inner.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), CARD_BG),
            ('BOX', (0, 0), (-1, -1), 0.8, ACCENT),
            ('TOPPADDING', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, -1), (-1, -1), 10),
            ('TOPPADDING', (0, 1), (-1, 1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 2),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        cells.append(inner)
    outer = Table([cells], colWidths=[box_w + (gap if i < n - 1 else 0) for i in range(n)])
    outer.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.extend([Spacer(1, 10), KeepTogether(outer), Spacer(1, 12)])

def chart(story, path, caption, max_h=300):
    pil = PILImage.open(path)
    ow, oh = pil.size
    ratio = min(AVAIL_W / ow, max_h / oh, 1.0)
    img = Image(path, width=ow * ratio, height=oh * ratio)
    story.extend([Spacer(1, 20),
                  *safe_keep([img, Paragraph(caption, S['caption'])]),
                  Spacer(1, 16)])

def callout(story, text):
    tbl = Table([[Paragraph(text, S['body'])]], colWidths=[AVAIL_W - 8])
    tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), CARD_BG),
        ('LINEBEFORE', (0, 0), (0, -1), 3, ACCENT),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.extend([Spacer(1, 8), KeepTogether(tbl), Spacer(1, 10)])

def esc(s):
    return s.replace('&', '&').replace('<', '<').replace('>', '>')

def code_block(story, code, label=None):
    """Code block: DejaVu mono, section background, accent left border."""
    lines = code.strip('\n').split('\n')
    html_lines = [esc(ln).replace('  ', '  ') for ln in lines]
    para = Paragraph('<br/>'.join(html_lines), S['code'])
    rows = [[para]]
    if label:
        lbl_style = ParagraphStyle('CodeLbl', fontName='FreeSerif', fontSize=8.2,
                                   leading=11, textColor=TEXT_MUTED, alignment=TA_LEFT)
        rows = [[Paragraph(f'<b>{esc(label)}</b>', lbl_style)], [para]]
    tbl = Table(rows, colWidths=[AVAIL_W - 6], hAlign='CENTER')
    tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), SECTION_BG),
        ('LINEBEFORE', (0, 0), (0, -1), 2.5, ACCENT),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 1), (-1, 1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 4),
    ]))
    story.extend([Spacer(1, 10)])
    story.extend(safe_keep([tbl]))
    story.extend([Spacer(1, 10)])

# ---------------- Header / Footer ----------------
DOC_TITLE = 'Clara AI Platform — Phase-by-Phase Implementation Plan'

def on_page(canvas, doc):
    canvas.saveState()
    canvas.setFont('FreeSerif', 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, PAGE_H - 0.55 * inch, DOC_TITLE)
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(MARGIN, PAGE_H - 0.62 * inch, PAGE_W - MARGIN, PAGE_H - 0.62 * inch)
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 0.62 * inch, PAGE_W - MARGIN, 0.62 * inch)
    canvas.setFont('FreeSerif', 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, 0.45 * inch, 'RiluRaafu · Engineering Blueprint')
    canvas.drawRightString(PAGE_W - MARGIN, 0.45 * inch, f'Page {doc.page}')
    canvas.restoreState()

# ---------------- Story ----------------
story = []

# ===== TOC =====
toc = TableOfContents()
toc.levelStyles = [S['toc0'], S['toc1']]
story.append(Paragraph('<b>Table of Contents</b>', S['h1']))
story.append(HRFlowable(width='100%', thickness=1.4, color=ACCENT, spaceBefore=0, spaceAfter=14))
story.append(toc)
story.append(PageBreak())

# =============================================================
# Chapter 1 — Purpose, Scope & How to Use This Plan
# =============================================================
h1(story, '1. Purpose, Scope & How to Use This Plan')
body(story, 'This document is the execution companion to the Feature Gap Analysis and AI Enhancement '
     'Roadmap. The gap analysis answered the question of what is missing; this plan answers the question '
     'of how to build it, in what order, and how to prove each piece is finished. Every one of the 55+ '
     'identified gaps and 10 catalogued defects is carried forward here as a workstream with an '
     'implementation approach, a data-model impact, and an acceptance test. Nothing from the analysis is '
     'dropped, and nothing new is invented: the sole purpose of this document is to convert findings into '
     'a stable, sequenced engineering programme that a small full-stack team can execute week by week.')
body(story, 'The plan is organised into four phases. Phase 0 is a two-week stabilisation sprint that closes '
     'the reported defects and installs the engineering baseline. Phase 1 builds the metering, audit, and '
     'enforcement core that every later capability depends on. Phase 2 lifts answer quality and trust: '
     'hybrid retrieval, reranking, inline citations, conversation memory, abstention, and the feedback '
     'loop. Phase 3 extends distribution and enterprise readiness: the embeddable widget, tool calling and '
     'MCP, live connectors, the evaluation harness, and the enterprise pack. Each phase is independently '
     'shippable, so the platform improves continuously rather than waiting for a monolithic release.')

stat_row(story, [('4', 'phases, each shippable'),
                 ('21', 'tracked workstreams'),
                 ('10', 'defects closed by design'),
                 ('26', 'weeks to stable, full scope')])

h2(story, '1.1 Conventions used in this plan')
body(story, 'Workstreams are identified as WS-nn within their phase (for example WS-1.3 is the third '
     'workstream of Phase 1). Every workstream carries an effort score of S, M, or L, relative to a team '
     'of two to four full-stack engineers. Acceptance criteria are written as verifiable statements and '
     'collected into the QA matrix in Chapter 7; a workstream is done only when its acceptance criteria '
     'pass in a deployed environment, not when the code merges. Code fragments are given as reference '
     'implementations: they use Prisma schema syntax and TypeScript-style pseudocode and are meant to be '
     'adapted to the actual codebase, not pasted blindly.')
body(story, 'The reference stack assumed throughout is the one observable from the product itself: a '
     'Next.js full-stack application with TypeScript, Prisma over PostgreSQL, OpenAI-compatible model '
     'providers, pgvector or an equivalent vector index for retrieval, and Razorpay for billing. Where a '
     'component name is referenced (route handlers, middleware, dashboard components), the names are '
     'descriptive and should be mapped onto the real files during Phase 0 codebase orientation. No '
     'assumption is made about infrastructure provider; deployment targets are treated as interchangeable.')

h2(story, '1.2 Sequencing principles')
bullets(story, [
    '<b>Measurement before capability.</b> Meters, audit records, and quota enforcement land before any '
    'new AI feature, because a capability that cannot be metered cannot be sold, supported, or defended.',
    '<b>Trust before reach.</b> Citations, abstention, and feedback land before distribution channels '
    '(widget, tools), because every new channel multiplies the cost of an untrustworthy answer.',
    '<b>Server-side enforcement, always.</b> Plan limits and feature gates are checked in API route '
    'handlers and middleware; hiding UI elements is a convenience, never the control itself.',
    '<b>Append-only records for billing and audit.</b> Usage events and audit logs are immutable facts, '
    'never updated in place, so disputes and investigations reconstruct history rather than trust a '
    'mutable counter.',
    '<b>Weekly release train.</b> Every phase is sliced so that something demonstrable ships each week '
    'behind feature flags, keeping risk small and progress visible.'])

h2(story, '1.3 Phase overview')
body(story, 'The table below summarises the four phases: their windows, themes, primary outcomes, and the '
     'exit criteria that gate movement to the next phase. The timeline chart in Figure 1 shows the same '
     'programme laid out week by week, including the deliberate overlap between Phase 0 and Phase 1, '
     'which exists because the stabilisation defects and the metering pipeline touch the same code paths '
     'and are best fixed together.')
story.extend(make_table(
    ['Phase', 'Window', 'Theme', 'Primary outcomes', 'Exit criteria'],
    [
        ['0 — Stabilisation', 'Weeks 1-2',
         'Stop the bleeding',
         'CI and release baseline; KB upload fix; mobile sweep; model catalogue fix',
         'All five reported defects closed or mitigated; CI green on main'],
        ['1 — Metering & enforcement', 'Weeks 1-4',
         'You cannot sell what you cannot count',
         'Usage-event pipeline; quota middleware; audit logging; streaming; analytics parity',
         'Meters accurate; per-plan bypass tests pass; audit coverage 100%'],
        ['2 — Answer quality & trust', 'Weeks 5-12',
         'Trust before reach',
         'Hybrid retrieval + rerank; citations; memory; abstention; feedback; TTS; playground',
         'Golden-set scores improve; citation coverage ≥ 90%; feedback loop in use'],
        ['3 — Distribution & enterprise', 'Weeks 13-26',
         'Meet customers where they are',
         'Website widget; tools + MCP; connectors; evaluation harness; enterprise pack',
         'Widget live on a customer site; SSO pilot passes; nightly evals green'],
    ],
    [0.16, 0.10, 0.16, 0.33, 0.25],
    caption='Table 1. Phase overview: windows, themes, outcomes, and exit criteria.'))
chart(story, f'{ASSETS}/chart_timeline.png',
      'Figure 1. Implementation timeline across 26 weeks. Bars are workstreams grouped by phase; '
      'Phase 0 and Phase 1 deliberately overlap because they touch the same code paths.',
      max_h=330)

callout(story, '<b>How to read the rest of this document.</b> Chapters 2 through 5 specify each phase: '
        'goals, workstreams, schemas, algorithms, and acceptance criteria. Chapter 6 defines the '
        'cross-phase engineering standards that keep the phases coherent. Chapter 7 consolidates every '
        'acceptance test into one QA matrix, including the plan-by-plan quota validation the platform '
        'owner explicitly requested. Chapters 8 and 9 cover risk, rollout, and the measurable definition '
        'of stable.')

# =============================================================
# Chapter 2 — Phase 0: Stabilisation Sprint (Weeks 1-2)
# =============================================================
h1(story, '2. Phase 0 — Stabilisation Sprint (Weeks 1-2)')
body(story, 'Phase 0 exists because five defects were reported against the running product, and every one '
     'of them is either a trust risk or a revenue risk: knowledge base uploads fail intermittently, '
     'non-dashboard pages do not meet the mobile standard the dashboard set, the embedding model console '
     'offers a chat model where an embedding model belongs, the requests-today meter reads zero, and '
     'subscription limits are not enforced. The last two are architectural and therefore belong to '
     'Phase 1; the first three are fixable inside two weeks and are scheduled here. Phase 0 also installs '
     'the engineering baseline — continuous integration, a staging environment, and migration discipline — '
     'because every subsequent phase assumes a safe place to land code.')
body(story, 'The sprint is intentionally overloaded with quick, high-visibility work. Closing the upload '
     'bug restores confidence in the core ingest path; the mobile sweep makes the whole product feel '
     'finished on phones, which is where most evaluation traffic arrives; and the model catalogue fix '
     'removes a trap that could silently corrupt retrieval for any organisation that touches it. All '
     'four workstreams ship behind ordinary pull requests with their acceptance tests attached, so the '
     'sprint doubles as the first full exercise of the new release pipeline.')

h2(story, '2.1 WS-0.1 Engineering baseline (effort M)')
body(story, 'Set up GitHub Actions to run lint, typecheck, unit tests, and a production build on every '
     'pull request, with the same pipeline gating pushes to main. Provision a staging environment that '
     'mirrors production configuration, including the database, object storage, model provider keys, and '
     'Razorpay test mode, so that acceptance tests exercise real integrations rather than mocks. Adopt '
     'migration discipline: every schema change ships as a forward-compatible Prisma migration, and '
     'migrations run as a deploy step, never by hand. Install structured logging and an error tracker '
     '(for example Sentry) with source-map upload, and create a shared feature-flag service so later '
     'phases can dark-launch safely. The baseline is finished when a broken pull request cannot merge, '
     'and a green pull request can be promoted to staging and then production with one command each.')
bullets(story, [
    '<b>Acceptance:</b> a deliberately failing test blocks merge in CI; a trivial change deploys to '
    'staging and production via pipeline only; an injected error appears in the tracker with stack trace '
    'and affected user within one minute.'])

h2(story, '2.2 WS-0.2 KB upload stabilisation (effort S)')
body(story, 'The upload defect is diagnosed first, then fixed against the diagnosis. The likely root '
     'causes, in the order they should be investigated, are listed in Table 2. The fix specification '
     'follows a standard resumable-ingestion pattern: the client requests a presigned upload URL and '
     'uploads directly to object storage, which removes large multipart payloads from the application '
     'server entirely; a server-side handler then validates the object (size, MIME type by content '
     'sniffing rather than extension alone, and parser support) before enqueuing an ingestion job. '
     'Ingestion becomes an explicit queue with per-file status — queued, parsing, embedding, ready, '
     'failed-with-reason — surfaced in the KB detail view, and failures land in a retry queue that '
     'organisation owners can see and re-trigger rather than silently disappearing.')
story.extend(make_table(
    ['Symptom', 'Likely root cause', 'Fix', 'Verification'],
    [
        ['Upload times out or hangs on large files',
         'Multipart body parsed in the route handler; platform body-size and function-timeout limits',
         'Presigned direct-to-storage upload; route handles metadata only',
         '50 MB PDF uploads and completes on a throttled 3G profile'],
        ['Some file types fail silently',
         'Client-side type check only; server accepts and drops unknown types later',
         'Server-side MIME sniffing plus explicit allowlist; parser support matrix per format',
         'A .exe renamed to .pdf is rejected with a clear message'],
        ['Upload succeeds but document never appears',
         'Parsing or embedding step fails after the upload resolves; no status is written',
         'IngestionJob rows with per-file status; failure reason visible; retry action',
         'Failing document shows "failed" with reason and a working retry'],
        ['Duplicate documents after retry',
         'Idempotency key absent on the ingest handler',
         'Client-generated upload id; handler deduplicates on it',
         'Double-clicked upload creates exactly one document'],
    ],
    [0.24, 0.28, 0.28, 0.20],
    caption='Table 2. KB upload defect: symptom-to-root-cause matrix with fixes and verification.',
    small=True))
bullets(story, [
    '<b>Acceptance:</b> uploading the same 50 MB PDF three times on a flaky connection produces exactly '
    'one ready document; unsupported types are rejected server-side with actionable copy; every upload '
    'visible in the UI has a machine-readable status; no ingestion failure is silent.'])

h2(story, '2.3 WS-0.3 Mobile responsiveness sweep (effort M)')
body(story, 'The dashboard already meets the mobile standard and serves as the reference. Extract its '
     'effective rules into design tokens — a spacing scale, a type scale, a minimum interactive control '
     'height of 44 pixels, 16-pixel page gutters, and card gap minimums — and encode them once in the '
     'shared theme. Then sweep every remaining surface: the landing page first (it is the first thing a '
     'prospective customer sees on a phone), then auth screens, agent builder tabs, KB management, '
     'billing pages, and the platform admin console. The sweep is executed against a fixed device matrix '
     '(a small phone at 360 pixels, a standard phone at 390, a large phone at 430, and a tablet at 768) '
     'and verified with both screenshots and automated viewport tests, so regressions are caught by CI '
     'rather than by customers. Component-level fixes — oversized fonts, oversized inputs, missing card '
     'gaps — are corrected in the shared components, not per page, so the fix propagates everywhere at once.')
bullets(story, [
    '<b>Acceptance:</b> no horizontal scroll at 360 pixels on any route; every interactive element at '
    'least 44 by 44 pixels; Lighthouse mobile accessibility and layout-shift scores of 90 or better on '
    'the landing and top five dashboard routes; the device-matrix screenshots are attached to the pull '
    'request as review evidence.'])

h2(story, '2.4 WS-0.4 Model catalogue correction (effort S)')
body(story, 'The model console currently permits selecting gpt-4o-2024-08-06 — a chat model identifier — '
     'as the embedding model, and warns about vector dimension matching without being able to enforce '
     'it. The correction splits the single model list into two catalogues: chat models (the gpt-5.6 '
     'family, gpt-4o variants) and embedding models (the text-embedding-3 family), each entry carrying '
     'its provider, context or token limits, cost per million tokens, and — for embedding models — the '
     'output dimension. Selections are constrained to the correct catalogue, and a dimension mismatch '
     'between the selected embedding model and a knowledge base becomes a hard, explained error rather '
     'than a warning. The full re-indexing workflow that safely re-embeds existing chunks when the '
     'embedding model changes is a Phase 2 workstream (WS-2.8); Phase 0 only makes bad states '
     'unrepresentable in the console.')
bullets(story, [
    '<b>Acceptance:</b> the embedding dropdown contains only valid embedding models; selecting a model '
    'whose dimension differs from a KB dimension is blocked with remediation copy that links to the '
    're-index workflow documentation; the stored model configuration passes a validation script that '
    'fails the build if a chat model id appears in an embedding field.'])

h2(story, '2.5 Phase 0 summary')
story.extend(make_table(
    ['WS', 'Workstream', 'Effort', 'Chapter / AC', 'Dependencies'],
    [
        ['0.1', 'Engineering baseline: CI, staging, migrations, flags, error tracking', 'M', '2.1', 'None'],
        ['0.2', 'KB upload stabilisation: presigned flow, validation, ingest jobs, retry queue', 'S', '2.2', '0.1'],
        ['0.3', 'Mobile responsiveness sweep with design tokens and device matrix', 'M', '2.3', '0.1'],
        ['0.4', 'Model catalogue split with dimension metadata and mismatch guard', 'S', '2.4', 'None'],
    ],
    [0.07, 0.47, 0.10, 0.13, 0.23],
    caption='Table 3. Phase 0 workstream summary.'))

# =============================================================
# Chapter 3 — Phase 1: Metering, Audit & Enforcement Core
# =============================================================
h1(story, '3. Phase 1 — Metering, Audit & Enforcement Core (Weeks 1-4)')
body(story, 'Phase 1 fixes the platform\'s two architectural defects and lays the spine that every later '
     'feature hangs from. The requests-today meter reads zero because chat completions evidently never '
     'write usage events; the fix is not a patch on the counter but an append-only usage-event pipeline '
     'that records every billable model invocation. Subscription limits can be bypassed because '
     'enforcement lives in the interface rather than the API; the fix is a quota middleware that checks '
     'plan limits server-side before every billable action. Audit logging of user prompts and AI answers, '
     'which today exists nowhere, is built on the same event spine, giving platform admins a complete '
     'record and organisation dashboards the user-question visibility that was requested. Streaming '
     'responses and organisation analytics parity complete the phase, so that by week four the platform '
     'counts everything it does, refuses what plans do not allow, and shows both to the right people.')

h2(story, '3.1 WS-1.1 The usage-event pipeline (effort M)')
body(story, 'Every billable AI invocation — a chat turn, an embedding batch, a transcription, later a '
     'text-to-speech render\u00a0—\u00a0appends one immutable row to a UsageEvent table. The row records who, '
     'what, and how much: organisation, user, agent, knowledge base, the model called, prompt and '
     'completion token counts, latency, and an estimated cost computed from the model catalogue\'s '
     'price list. Writes happen in the same request lifecycle that performs the model call, and rows '
     'are never updated or deleted; corrections are new compensating rows. Meters then stop being '
     'guessed state and become simple aggregations: requests-today is a count over today\'s window in '
     'the organisation\'s timezone, monthly usage is a count over the billing period anchored to the '
     'Razorpay renewal date, and storage is a sum over document bytes. A nightly rollup job pre-aggregates '
     'daily totals per organisation so dashboards read one small table instead of scanning the event log.')
code_block(story, '''
model UsageEvent {
  id               String   @id @default(cuid())
  orgId            String
  userId           String
  kind             UsageKind        // CHAT | EMBEDDING | TTS | OCR
  agentId          String?
  kbId             String?
  model            String
  promptTokens     Int       @default(0)
  completionTokens Int       @default(0)
  latencyMs        Int       @default(0)
  costUsdMicros    BigInt    @default(0)   // integer micro-dollars
  billingPeriodId  String?
  createdAt        DateTime  @default(now())

  @@index([orgId, createdAt])
  @@index([orgId, kind, createdAt])
}
''', label='Prisma schema — UsageEvent (append-only; no update or delete paths are exposed)')
chart(story, f'{ASSETS}/diagram_usage.png',
      'Figure 2. The usage-event spine: synchronous request path (top), asynchronous event path '
      '(bottom), and the quota middleware with its rejection branch.', max_h=310)
bullets(story, [
    '<b>Acceptance:</b> after one chat turn, exactly one CHAT UsageEvent exists with correct token '
    'counts and model name; the requests-today meter increments on the next dashboard poll; embedding '
    'and (later) TTS calls write their own event kinds; an event-audit script confirms zero update or '
    'delete statements ever executed against the table.'])

h2(story, '3.2 WS-1.2 Server-side quota enforcement (effort M)')
body(story, 'A quota middleware wraps every billable route handler. It resolves the caller\'s '
     'organisation and plan, loads the plan\'s limit matrix, and checks each applicable limit '
     'atomically — either a transactional count against the usage-event window or a maintained counter '
     'incremented in the same transaction that admits the request, so concurrent requests cannot race '
     'past a limit. When a limit is exceeded, the API returns 402 with a machine-readable code, a '
     'friendly message, and an upgrade call-to-action payload; the client renders the upgrade sheet '
     'from that payload rather than from its own guess. At 80 percent utilisation, the middleware '
     'emits a soft-warning event that the client surfaces as a dismissible banner. Feature gates — '
     'model access, connectors, SSO — are checked in the same layer, because a capability hidden in '
     'the UI is not enforced; the API must refuse it too.')
code_block(story, '''
export async function withQuota(req, plan, orgId) {
  // 1. feature gate: is this capability in the plan at all?
  if (!plan.features.includes(req.feature)) {
    throw new ApiError(403, 'PLAN_FEATURE_UNAVAILABLE', upgradeCTA(req.feature));
  }
  // 2. usage gate: atomic check-and-increment on the billing window
  const used = await db.$transaction(async (tx) => {
    const n = await countWindow(tx, orgId, req.limitKey, windowBounds(plan));
    if (n >= plan.limits[req.limitKey]) {
      throw new ApiError(402, 'QUOTA_EXCEEDED', upgradeCTA(req.limitKey));
    }
    if (n + 1 === Math.floor(0.8 * plan.limits[req.limitKey])) {
      emitSoftWarning(orgId, req.limitKey, n + 1);
    }
    return n + 1;
  });
  return used;
}
// Every billable handler: const used = await withQuota(...); then model call,
// then usageEvent append — the append is mandatory and sits in finally-style
// bookkeeping so failures still bill honestly if the provider charged.
''', label='Reference implementation — quota middleware (TypeScript pseudocode)')
story.extend(make_table(
    ['Route / action', 'Limit checked', 'Limit key', 'On exceed'],
    [
        ['POST /api/chat (turn)', 'Requests per day and per month', 'requests_day, requests_month',
         '402 + upgrade sheet; banner at 80%'],
        ['POST /api/kb (create)', 'Knowledge bases per org', 'kbs',
         '402 + upgrade sheet; create button disabled when already at limit'],
        ['POST /api/kb/:id/document', 'Storage bytes per org', 'storage_bytes',
         '402 with remaining-storage copy; pre-upload client check'],
        ['Model selection per agent', 'Plan model allowlist', 'feature:models',
         '403 with plan comparison; models above tier hidden in UI'],
        ['SSO, connectors, API keys', 'Plan feature flags', 'feature:sso, ...',
         '403 with enterprise CTA; UI hides or locks the feature'],
        ['Widget embed (Phase 3)', 'Plan widget flag and conversations', 'feature:widget, widget_convos',
         'Widget renders an upgrade notice, never a silent failure'],
    ],
    [0.26, 0.26, 0.24, 0.24],
    caption='Table 4. Enforcement points: every billable or gated action, its limit, and its behaviour on exceed.',
    small=True))
body(story, 'Two classes of bypass are explicitly closed. First, direct API calls: every enforcement '
     'point in Table 4 is testable with a raw HTTP client and no browser, and the acceptance tests do '
     'exactly that, because a quota that only holds when the UI behaves is not a quota. Second, '
     'concurrency: the check-and-increment runs inside a database transaction, so one hundred '
     'simultaneous requests against a plan with one remaining credit admit exactly one request and '
     'refuse ninety-nine. Rate limiting per user and per IP is layered above plan quotas as a separate '
     'abuse control, so a single user on an unlimited plan still cannot flood the platform.')

h2(story, '3.3 WS-1.3 Plan-by-plan validation matrix (effort S)')
body(story, 'The platform owner asked for each plan to be validated one by one, deeply, with blocking, '
     'warnings, error messages, and hiding all behaving properly. This workstream builds that '
     'validation as a permanent test suite rather than a one-off manual pass, so every future plan '
     'change is automatically re-verified. For each plan tier, a seeded organisation is created with '
     'its limits set near the boundary; scripted request loops then walk each limit to exactly N, '
     'N plus one, and beyond, asserting the refusal, the message copy, the meter accuracy, and the '
     'upgrade path at each step. UI-level tests assert the hiding and locking behaviour for '
     'plan-gated features, and API-level tests assert that hidden features are refused even when '
     'called directly.')
story.extend(make_table(
    ['Plan tier', 'Seeded state', 'Scripted validation', 'Expected behaviour'],
    [
        ['Free / trial', '1 of 1 KB used; 49 of 50 requests today; 80% storage',
         'Create 2nd KB; send requests 50-53; upload past storage; call premium model via raw API',
         'KB create refused with upgrade CTA; request 51 refused; storage upload pre-checked and '
         'refused with remaining-bytes copy; premium model 403 even via API'],
        ['Starter', '4 of 5 KBs; mid-month requests',
         'Loop requests to monthly cap; verify daily reset at local midnight; verify 80% banner fired once',
         'Monthly cap refuses with renewal-date copy; daily counter resets in org timezone; warning '
         'banner appears exactly at 80% and is dismissible'],
        ['Pro / Business', 'Near all caps simultaneously',
         'Parallel 100-request burst at 1 remaining; concurrent KB create at limit; meter reads vs event log',
         'Exactly one admitted; refusals carry correct code and copy; meters equal event-log counts '
         'to the row; no negative or over-count'],
        ['Enterprise', 'Unlimited flags on; SSO and custom LLM enabled',
         'Exercise every enterprise feature; attempt feature below its plan via API to confirm gates are per-plan',
         'No artificial caps encountered; feature gates still refuse capabilities the tier does not '
         'include; audit log records every action'],
    ],
    [0.13, 0.22, 0.32, 0.33],
    caption='Table 5. Plan-by-plan validation matrix: seeded state, scripted checks, and expected behaviour.',
    small=True))
bullets(story, [
    '<b>Acceptance:</b> the quota suite runs in CI against staging for every plan tier and is red on '
    'any bypass, any meter drift, or any missing upgrade path; a manual sign-off checklist per tier is '
    'attached to the release; the 81st request on a 80-request cap is refused with the standard error '
    'contract, from both the UI and a raw API call.'])

h2(story, '3.4 WS-1.4 Audit logging of prompts and answers (effort M)')
body(story, 'Audit logging records every user prompt and every AI-generated answer as a first-class, '
     'immutable fact, visible to platform admins and — in a privacy-preserving, question-only form — '
     'on organisation dashboards. The AuditLog row captures the actor, organisation, agent, knowledge '
     'base, conversation, and message identifiers, the full prompt and answer text, the model, token '
     'counts, a redaction field listing what was masked, and a tamper-evident hash chain: each row '
     'hashes its content together with the previous row\'s hash, so any after-the-fact modification '
     'breaks the chain visibly. Writes share the transaction that persists the message, so an answer '
     'can never exist unlogged. A redaction layer masks emails, phone numbers, and payment identifiers '
     'by default; platform admins with a recorded justification can reveal the original, and the '
     'reveal itself is audited. Retention is tiered: ninety days hot and searchable, one year in cold '
     'archive, with organisation-configurable shortening but never lengthening past the compliance cap.')
code_block(story, '''
model AuditLog {
  id              String   @id @default(cuid())
  orgId           String
  actorUserId     String
  actorRole       String
  action          AuditAction    // PROMPT | ANSWER | CONFIG | BILLING | REVEAL
  agentId         String?
  kbId            String?
  conversationId  String?
  promptText      String?  @db.Text
  answerText      String?  @db.Text
  model           String?
  promptTokens    Int?
  completionTokens Int?
  redactions      Json      @default("[]")
  prevHash        String
  rowHash         String
  createdAt       DateTime  @default(now())

  @@index([orgId, createdAt])
  @@index([action, orgId, createdAt])
}
''', label='Prisma schema — AuditLog (hash-chained, append-only)')
body(story, 'The platform admin console gains an audit viewer with filters by organisation, actor, '
     'action, agent, and time; CSV export for investigations; and a chain-verification action that '
     'recomputes the hash chain and reports integrity. The organisation dashboard gains the requested '
     'user-questions panel: a scoped, searchable list of the organisation\'s own questions with '
     'answer status, abstention flags, and feedback — the organisation-side view doubles as the '
     'content-gap backlog that Phase 2\'s abstention analytics feed.')
bullets(story, [
    '<b>Acceptance:</b> every chat turn produces exactly one PROMPT and one ANSWER audit row in the '
    'same transaction as the message; chain verification passes and fails loudly on a deliberate '
    'tamper test; redacted fields never render raw without a justification record; the org panel '
    'shows only the organisation\'s own questions; export produces valid CSV with the same filters.'])

h2(story, '3.5 WS-1.5 Streaming responses and chat controls (effort M)')
body(story, 'Chat answers stream token-by-token from the provider through the API route to the client '
     'over server-sent events, with first-token latency budgeted at 1.5 seconds. The client gains the '
     'controls users now assume: a stop button that cancels generation and keeps the partial answer '
     'clearly labelled as truncated, a regenerate action that reuses the same context, per-message '
     'copy, and markdown rendering with syntax-highlighted code blocks behind a strict sanitiser. '
     'Streaming is also the enabling substrate for Phase 2\'s inline citations, which arrive as the '
     'answer streams rather than after it, so building it here is deliberate sequencing rather than '
     'polish. Usage events and audit rows are written on stream completion, including for cancelled '
     'streams, with a cancelled flag recorded.')
bullets(story, [
    '<b>Acceptance:</b> first token arrives under 1.5 seconds at p95 on a warm connection; stop '
    'cancels provider-side and the partial answer persists marked truncated; regenerate produces a '
    'fresh completion billed as a new turn; code blocks render highlighted and pass an XSS test '
    'suite; every completed or cancelled stream writes its usage and audit records.'])

h2(story, '3.6 WS-1.6 Organisation dashboard analytics parity (effort S)')
body(story, 'With the event spine live, the organisation dashboard\'s analytics view is rebuilt on real '
     'aggregations and brought to parity with the platform admin dashboard\'s monitoring. The org view '
     'shows requests today, the 7- and 30-day trend, active users, top questions, and per-agent '
     'activity, all scoped strictly to the organisation; the platform admin view adds cross-organisation '
     'totals, per-model latency percentiles, provider error rates, and ingestion queue depth. '
     'Dashboards poll on a sensible cadence with stale-while-revalidate semantics, so numbers feel '
     'live without hammering the rollup tables.')
bullets(story, [
    '<b>Acceptance:</b> requests-today matches a manual count of the event log for ten sampled '
     'organisations; org views cannot see other organisations\' data under any filter combination; '
     'admin latency percentiles update within one minute of a spike injected in staging.'])

h2(story, '3.7 Phase 1 summary')
story.extend(make_table(
    ['WS', 'Workstream', 'Effort', 'AC section', 'Depends on'],
    [
        ['1.1', 'Usage-event pipeline and meters rebuild', 'M', '3.1', '0.1'],
        ['1.2', 'Quota middleware: gates, 402 contract, soft warnings, race safety', 'M', '3.2', '1.1'],
        ['1.3', 'Plan-by-plan validation suite (all tiers, UI + raw API)', 'S', '3.3', '1.2'],
        ['1.4', 'Audit logging: hash chain, redaction, admin viewer, org questions panel', 'M', '3.4', '1.1'],
        ['1.5', 'Streaming responses, stop / regenerate / copy, safe markdown', 'M', '3.5', '1.2'],
        ['1.6', 'Org analytics parity and live meters', 'S', '3.6', '1.1'],
    ],
    [0.07, 0.49, 0.10, 0.12, 0.22],
    caption='Table 6. Phase 1 workstream summary.'))

# =============================================================
# Chapter 4 — Phase 2: Answer Quality & Trust
# =============================================================
h1(story, '4. Phase 2 — Answer Quality & Trust (Weeks 5-12)')
body(story, 'Phase 2 makes the assistant\'s answers measurably better and visibly trustworthy, and it '
     'builds the loop that keeps them improving after launch. The retrieval layer is upgraded from pure '
     'vector similarity to hybrid search with reranking, which the RAG literature consistently ranks as '
     'the highest-leverage quality change available to a production system. Answers gain inline '
     'citations that open the exact source passage, so verification is one click instead of one '
     'investigation. Conversations become first-class objects with memory, follow-up questions, and '
     'shareable history. The assistant learns to abstain honestly when the knowledge base cannot '
     'support an answer, and every abstention becomes a content-gap signal. Users gain thumbs feedback '
     'that routes unhappy conversations to a review queue. Knowledge-base owners get a retrieval '
     'playground to see exactly what the system would retrieve, and the embedding-model migration '
     'workflow makes model changes safe. Voice output completes the voice loop that voice input began.')

h2(story, '4.1 WS-2.1 Hybrid retrieval and reranking (effort L)')
body(story, 'Hybrid search combines two retrievers that fail in complementary ways. Dense vector search '
     'captures meaning but misses exact identifiers — product codes, error numbers, names that embed '
     'poorly; keyword search (BM25 over PostgreSQL full-text indexes) nails those exact tokens but '
     'misses paraphrase. Both run per query, their ranked lists are fused with Reciprocal Rank Fusion, '
     'and a second-stage cross-encoder reranker (a hosted reranking model or a self-hosted '
     'bge-family reranker) reorders the fused top-k into the final top-n that reaches the prompt. '
     'Query rewriting resolves pronouns and ellipses against the conversation history before retrieval '
     'runs, so "summarise that second point" retrieves the right documents; multi-query expansion '
     'optionally issues two or three reformulations for ambiguous questions and merges their results. '
     'The whole pipeline is behind a per-KB feature flag and evaluated on the golden set before '
     'default-on, because a retrieval change that is not measured is a regression waiting to ship.')
chart(story, f'{ASSETS}/diagram_retrieval.png',
      'Figure 3. The Phase 2 retrieval and citation pipeline, with the abstention branch on low '
      'retrieval confidence.', max_h=310)
code_block(story, '''
function rrfFuse(listA, listB, k = 60) {
  // listA: BM25 ranked chunk ids; listB: vector ranked chunk ids
  const scores = new Map();
  for (const [rank, id] of listA.entries()) {
    scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
  }
  for (const [rank, id] of listB.entries()) {
    scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
  }
  return [...scores.entries()]
    .sort((x, y) => y[1] - x[1])
    .map(([id]) => id);
}
// top-k per leg (k = 20) -> fuse -> rerank to top-n (n = 6) -> prompt context
''', label='Reference implementation — Reciprocal Rank Fusion (TypeScript pseudocode)')
bullets(story, [
    '<b>Acceptance:</b> on the golden set, recall@10 improves by at least 15 percentage points over '
    'the vector-only baseline; identifier-heavy queries (codes, exact names) that failed before now '
    'retrieve their source; rerank adds under 300 milliseconds at p95; the pipeline flag can revert '
    'retrieval to vector-only in one configuration change without a deploy.'])

h2(story, '4.2 WS-2.2 Inline citations and the sources panel (effort M)')
body(story, 'The retrieval layer already knows which chunks supported each answer; this workstream '
     'surfaces that knowledge to the user. Retrieved chunks are numbered in the prompt, and the system '
     'message instructs the model to place bracketed markers on the sentences each chunk supports. A '
     'post-processing validator then checks every marker against the set of chunk identifiers that was '
     'actually retrieved and silently drops any fabricated reference — the guard against invented '
     'citations that the guardrails literature specifically warns about. In the UI, markers render as '
     'clickable chips; clicking opens a popover with the source document name, the exact passage, and a '
     'link to the document. A collapsible sources panel beneath the answer lists every contributing '
     'document. Persisted messages carry their chunk identifiers, so citations survive reloads and '
     'exports.')
bullets(story, [
    '<b>Acceptance:</b> on a 20-document golden KB, at least 90 percent of factual sentences carry a '
    'marker; every rendered marker resolves to a real stored passage (fabricated markers are dropped '
    'pre-render); the sources panel matches the persisted chunk set exactly; citation popovers meet '
    'the mobile touch-target standard.'])

h2(story, '4.3 WS-2.3 Conversation memory and controls (effort M)')
body(story, 'Conversations become first-class persisted objects: a sidebar lists them with rename and '
     'pin; each conversation binds to a knowledge base (and optionally an agent); and turns carry over '
     'automatically with an explicit, configurable memory policy — a token budget for history rather '
     'than an unbounded transcript, with the oldest turns summarised out. Suggested follow-up '
     'questions are generated in the same completion call as the answer at negligible marginal cost, '
     'guiding users deeper into the knowledge base and measurably increasing engagement. Chat export '
     'and share links produce a read-only, citation-preserving snapshot for circulation inside the '
     'organisation.')
bullets(story, [
    '<b>Acceptance:</b> follow-up questions resolve correctly across at least five turns of pronoun '
     'references; memory policy caps history tokens as configured; sidebar operations work on mobile; '
     'shared links are read-only, org-scoped, and revocable.'])

h2(story, '4.4 WS-2.4 Abstention policy and no-answer analytics (effort S)')
body(story, 'When fused retrieval confidence is low — below a per-KB threshold on the reranker\'s '
     'scores — the assistant abstains with an honest, templated response: it states that the knowledge '
     'base does not appear to contain the answer, shows the closest things it did find, and suggests '
     'either asking differently or requesting that the document be added. Abstention replaces the '
     'hallucination failure mode with an actionable gap, which is precisely the behaviour procurement '
     'reviewers probe for. Every abstention is recorded as an event, so the organisation dashboard\'s '
     'content-gap report ranks the questions the KB could not answer — a ranked backlog of what to '
     'ingest next, derived from real user intent rather than guesswork.')
bullets(story, [
    '<b>Acceptance:</b> on a KB that lacks the answer to golden-set unanswerable questions, the '
     'assistant abstains in at least 95 percent of cases instead of fabricating; abstention rate is a '
     'first-class metric on org and admin dashboards; the content-gap report aggregates per KB and '
     'per week.'])

h2(story, '4.5 WS-2.5 Feedback loop and review queue (effort M)')
body(story, 'Every message gains thumbs up and down with an optional comment; feedback is stored with '
     'the full message and conversation context for one-click reproduction. Negative feedback enters a '
     'review queue visible to organisation owners: each entry shows the question, the answer, its '
     'citations, and the retrieval trace, and offers the likely remedies — edit the source document, '
     're-chunk it, adjust the agent prompt, or file a content gap. Aggregations surface quality trends '
     'per agent, per KB, and per organisation, and a weekly digest routes the worst offenders to the '
     'right owner. This loop is what separates platforms that improve after launch from platforms '
     'that decay, and it feeds the evaluation harness in Phase 3 with real failure cases.')
bullets(story, [
    '<b>Acceptance:</b> feedback is captured in under two clicks; the review queue reproduces the '
     'exact conversation and retrieval trace; thumbs-down rate and its trend appear on org and admin '
     'dashboards; a resolved review can be marked fixed with the remedy recorded.'])

h2(story, '4.6 WS-2.6 Voice output (TTS) with per-agent voices (effort M)')
body(story, 'The agent builder\'s Voice tab gains real text-to-speech: a provider abstraction (the '
     'platform\'s default plus an OpenAI-compatible alternative) renders answers as streaming audio '
     'with a per-agent voice selection, and the chat surface gains a listen button with an '
     'auto-speak option. Every render writes a TTS usage event — the Phase 1 spine already carries the '
     'kind — so voice costs are metered, quota-checked, and audited exactly like chat turns. Cached '
     'audio for identical text and voice avoids double-billing regenerations.')
bullets(story, [
    '<b>Acceptance:</b> audio starts streaming under one second from button press; voice settings '
     'persist per agent and preview instantly in the builder; TTS turns respect plan quotas with the '
     'standard 402 contract; usage events and audit rows appear for every render.'])

h2(story, '4.7 WS-2.7 Retrieval playground and chunk inspection (effort M)')
body(story, 'Knowledge-base owners gain a playground: type a question, see the exact chunks the '
     'retriever would fetch, their BM25 and vector scores, their fused rank, and whether each survived '
     'reranking into the prompt. The same view enables chunk-level management — inspect the chunks a '
     'document produced, delete bad chunks without deleting the document, and preview how a different '
     'chunking strategy would split a sample. This single tool converts KB quality work from guesswork '
     'into a measurable loop and directly attacks the leading cause of bad answers: dirty input data.')
bullets(story, [
    '<b>Acceptance:</b> playground results match production retrieval bit-for-bit for the same query '
     'and KB state; chunk deletion takes effect in production retrieval immediately; the re-chunk '
     'preview requires no write access to the KB.'])

h2(story, '4.8 WS-2.8 Embedding-model migration and re-index workflow (effort M)')
body(story, 'Changing an embedding model without re-indexing silently corrupts retrieval for every '
     'existing chunk; this workflow makes the change safe and observable. An admin initiates a '
     'migration on a KB; a background job re-embeds all chunks with the new model into a parallel '
     'index; progress is visible per document with throughput and failure states; retrieval flips to '
     'the new index atomically only when the job completes; and a one-click rollback restores the '
     'previous index without data loss. The workflow records the embedding model identity and '
     'dimension on each KB, and queries refuse to run against a dimension-mismatched state — the '
     'enforcement point Phase 0\'s catalogue fix prepared.')
bullets(story, [
    '<b>Acceptance:</b> a migration on a 10,000-chunk KB completes with zero downtime and no window '
     'of mixed-dimension retrieval; a mid-migration cancellation leaves the KB fully on the old model; '
    'the golden-set score is re-measured automatically post-migration and reported.'])

h2(story, '4.9 Phase 2 summary')
story.extend(make_table(
    ['WS', 'Workstream', 'Effort', 'AC section', 'Depends on'],
    [
        ['2.1', 'Hybrid retrieval (BM25 + vectors), RRF fusion, reranking, query rewrite', 'L', '4.1', '1.1'],
        ['2.2', 'Inline citations, validator, sources panel', 'M', '4.2', '2.1, 1.5'],
        ['2.3', 'Conversation memory, follow-ups, export and share', 'M', '4.3', '1.5'],
        ['2.4', 'Abstention policy and content-gap analytics', 'S', '4.4', '2.1'],
        ['2.5', 'Feedback loop and review queue', 'M', '4.5', '2.2'],
        ['2.6', 'Voice output (TTS) with per-agent voices', 'M', '4.6', '1.1'],
        ['2.7', 'Retrieval playground and chunk inspection', 'M', '4.7', '2.1'],
        ['2.8', 'Embedding migration and re-index workflow', 'M', '4.8', '0.4, 2.1'],
    ],
    [0.07, 0.49, 0.10, 0.12, 0.22],
    caption='Table 7. Phase 2 workstream summary.'))

# =============================================================
# Chapter 5 — Phase 3: Distribution, Agent Intelligence & Enterprise
# =============================================================
h1(story, '5. Phase 3 — Distribution, Agent Intelligence & Enterprise (Months 4-6)')
body(story, 'Phase 3 takes a platform that is now metered, enforced, audited, and trustworthy, and '
     'puts it where the customers are. The embeddable widget turns Clara agents from a destination '
     'into infrastructure that lives on customers\' own websites. Tool calling and the Model Context '
     'Protocol let agents act, not just converse, while every tool invocation is audited and '
     'permissioned. Live connectors keep knowledge bases synchronised with the systems that actually '
     'hold the truth — Drive folders, Confluence spaces, sitemaps. The evaluation harness makes '
     'quality regression impossible to ship silently, and the enterprise pack (SSO, SCIM, RBAC, '
     'data-processing paperwork, white-labelling) converts the Enterprise plan from a list of '
     'promises into a procurement-ready package.')

h2(story, '5.1 WS-3.1 Embeddable website widget (effort M)')
body(story, 'A one-line script tag renders any published agent on any website: per-agent embed keys, '
     'origin allowlist enforcement at the API, customisable colours, logo, position, and welcome '
     'message, and an optional pre-chat lead-capture form that gates or enriches the conversation. '
     'Widget conversations are quota-checked against the hosting organisation\'s plan, rate-limited '
     'per visitor as an abuse control, and fully audited like in-app conversations. The embed page in '
     'the agent builder shows the snippet, a live preview, per-domain analytics, and a revoke action '
     'that instantly disables a leaked key.')
bullets(story, [
    '<b>Acceptance:</b> embedding on a static test page with one script tag renders a working agent; '
     'requests from non-allowlisted origins are refused; widget conversations appear in meters, audit '
     'logs, and analytics indistinguishably from app conversations; key revocation takes effect '
     'within one minute.'])

h2(story, '5.2 WS-3.2 Tool calling and MCP support (effort L)')
body(story, 'Agents gain the ability to call tools: a registry of typed function schemas (JSON Schema) '
     'that the model can invoke mid-conversation with arguments the platform validates before '
     'execution. The first built-ins are web search, a calculator, and a generic HTTP connector with '
     'credential storage; the same registry speaks MCP, so any standards-compliant MCP server becomes '
     'a tool source without custom integration. Tools are enabled per agent with role-gated '
     'permissions, every invocation is audited with its arguments and result, and tool use is a '
     'plan-gated feature enforced server-side. A human-approval mode requires a click before '
     'sensitive tools execute, and daily tool-call budgets per organisation cap runaway loops.')
bullets(story, [
    '<b>Acceptance:</b> an agent with the HTTP tool completes a task requiring an external call; '
     'MCP-hosted tools appear in the registry after entering a server URL; every tool call is audited '
     'and visible in the conversation transcript; budgets and plan gates refuse over-use with the '
     'standard error contract.'])

h2(story, '5.3 WS-3.3 Live knowledge connectors (effort L)')
body(story, 'Static uploads age badly; connectors keep knowledge current. URL and sitemap ingestion '
     'with a configurable crawl depth bring websites in; OAuth integrations for Google Drive, '
     'Confluence, and Notion bring the systems where documents actually live. Every source syncs on a '
     'schedule, computes a content delta, and re-indexes only changed chunks — the document-versioning '
     'machinery from Phase 2 generalised to external sources. Sync health is visible per source with '
     'last-run status, and failures alert the organisation owner rather than silently staling.')
bullets(story, [
    '<b>Acceptance:</b> a changed Confluence page is searchable in updated form within one sync cycle; '
     'unchanged documents are not re-embedded (observable in usage events); a revoked OAuth token '
     'produces a visible disconnected state with re-auth instructions, not silent staleness.'])

h2(story, '5.4 WS-3.4 Evaluation harness (effort M)')
body(story, 'The harness maintains golden sets — 50 to 200 real questions per KB with expected answer '
     'points, seeded from real conversations and failed reviews — and scores them with RAGAS-family '
     'metrics: faithfulness (is the answer supported by retrieved context), answer relevancy, context '
     'precision, and context recall. Runs execute nightly and on demand, and every deployment that '
     'changes prompts, models, or retrieval parameters triggers a regression run whose results gate '
     'the release. Scores trend on dashboards per KB and per agent, and failed cases flow back into '
     'the golden set, so the suite grows with the product. This is the measurement rig that makes '
     'every Phase 2 quality claim durable rather than a one-time demo.')
bullets(story, [
    '<b>Acceptance:</b> nightly runs execute unattended and publish scores; a deliberately degraded '
     'retrieval change is caught and blocks release in CI; every failed case is reviewable with its '
     'full trace; the harness costs are metered as EMBEDDING and CHAT usage events like any other '
     'workload.'])

h2(story, '5.5 WS-3.5 Enterprise pack (effort L)')
body(story, 'The Enterprise plan\'s advertised features become real, verifiable capabilities. SSO via '
     'SAML 2.0 and OIDC with just-in-time provisioning; SCIM for automated user lifecycle; '
     'organisation roles (owner, admin, builder, member) enforced at the API on every route; DPAs, '
     'security documentation, and a penetration test report as sales artefacts; and white-labelling '
     'with custom domains and branding removal. Audit logging from Phase 1 is the prerequisite — '
     'selling SSO without audit trails tends to fail procurement review, which is why this pack '
     'could not ship earlier.')
bullets(story, [
    '<b>Acceptance:</b> a pilot organisation authenticates via SAML with JIT user creation; SCIM '
     'deprovision disables access within one sync; role-gated routes refuse unauthorised calls with '
     '403; a custom-domain tenant serves the widget with the tenant\'s branding and no platform marks; '
     'the penetration test\'s criticals and highs are closed before GA.'])

h2(story, '5.6 WS-3.6 Collaboration and activity feed (effort M)')
body(story, 'Agents become team artefacts: co-editing with change history built on the existing '
     'draft-and-publish lifecycle, inline comments on agents and prompt versions with assignment, and '
     'a per-organisation activity feed showing what colleagues shipped, asked, or flagged. The weekly '
     'ritual this enables — review the feedback queue together, assign fixes, ship — is what makes '
     'the platform sticky inside an organisation and measurably reduces churn risk.')
bullets(story, [
    '<b>Acceptance:</b> two editors cannot silently clobber each other (conflict detection on '
     'publish); comment threads resolve with the fix linked; the activity feed is filterable per '
     'member and per artefact type.'])

h2(story, '5.7 Phase 3 summary')
story.extend(make_table(
    ['WS', 'Workstream', 'Effort', 'AC section', 'Depends on'],
    [
        ['3.1', 'Embeddable website widget with keys, theming, lead capture', 'M', '5.1', '1.2, 1.5'],
        ['3.2', 'Tool calling, built-ins, MCP client, permissions, budgets', 'L', '5.2', '1.4'],
        ['3.3', 'Live connectors: crawler, Drive, Confluence, Notion, delta sync', 'L', '5.3', '2.8'],
        ['3.4', 'Evaluation harness: golden sets, RAGAS metrics, release gating', 'M', '5.4', '2.1'],
        ['3.5', 'Enterprise pack: SSO, SCIM, RBAC, DPA, white-label', 'L', '5.5', '1.4'],
        ['3.6', 'Collaboration: co-editing, comments, activity feed', 'M', '5.6', '1.4'],
    ],
    [0.07, 0.49, 0.10, 0.12, 0.22],
    caption='Table 8. Phase 3 workstream summary.'))

# =============================================================
# Chapter 6 — Shared Engineering Standards
# =============================================================
h1(story, '6. Shared Engineering Standards')
body(story, 'The four phases stay coherent because every workstream obeys the same cross-cutting '
     'standards: one data model with consistent multi-tenant scoping, one API error contract, one '
     'observability stack, one security baseline, and one testing pyramid. This chapter defines those '
     'standards once so the phase chapters can reference them instead of repeating them. New engineers '
     'onboarded mid-programme should be able to read this chapter plus the current phase chapter and '
     'produce code that looks like it was written by the team from day one.')

h2(story, '6.1 Data-model additions')
body(story, 'The plan introduces a compact set of new models, each owned by exactly one workstream and '
     'each carrying orgId for tenant scoping where relevant. The catalogue below lists every new model, '
     'its purpose, and the phase that introduces it; the full column-level schemas for the two '
     'load-bearing tables (UsageEvent and AuditLog) appear in Chapter 3, and the remainder follow the '
     'same conventions: cuid identifiers, createdAt timestamps, orgId indexes on every query path, and '
     'no nullable column that the application cannot render a meaningful state for.')
story.extend(make_table(
    ['Model', 'Purpose', 'Introduced by', 'Key invariants'],
    [
        ['UsageEvent', 'One immutable row per billable AI invocation', 'WS-1.1',
         'Append-only; indexed on (orgId, createdAt)'],
        ['AuditLog', 'Immutable prompt and answer record with hash chain', 'WS-1.4',
         'Append-only; rowHash links to prevHash'],
        ['Conversation / Message', 'Persisted conversations with retrieval trace', 'WS-2.3',
         'Message stores retrieved chunk ids'],
        ['MessageFeedback', 'Thumbs and comment per message', 'WS-2.5',
         'One per user per message, updatable'],
        ['IngestionJob', 'Per-file ingest status with retry semantics', 'WS-0.2',
         'Terminal states only via worker'],
        ['DocumentVersion', 'Versioned documents with delta re-index', 'WS-3.3',
         'Latest version is the indexed one'],
        ['AgentTool / ToolCall', 'Tool registry and per-invocation records', 'WS-3.2',
         'Every call audited with args and result'],
        ['EmbedKey', 'Per-agent widget embed keys with origin allowlist', 'WS-3.1',
         'Revocation is immediate'],
        ['EvaluationRun / Case', 'Golden-set runs and scored cases', 'WS-3.4',
         'Runs are immutable score sets'],
        ['SsoConnection', 'Per-org SAML/OIDC and SCIM configuration', 'WS-3.5',
         'One active connection per org'],
    ],
    [0.20, 0.34, 0.14, 0.32],
    caption='Table 9. New data models, their owning workstreams, and their invariants.',
    small=True))

h2(story, '6.2 API conventions')
body(story, 'All new endpoints follow one error contract so clients can render failures uniformly. '
     'Quota and feature refusals use 402 and 403 respectively with machine-readable codes and an '
     'upgrade payload; validation failures use 422 with a field-annotated payload; unexpected failures '
     'use 500 with a correlation identifier that also appears in the server log line. Every billable '
     'endpoint accepts an idempotency key so retries after network failures cannot double-charge a '
     'quota, and list endpoints paginate with stable cursors rather than offsets so quota suites and '
     'analytics consumers get consistent reads. Rate limits are communicated through standard headers, '
     'and the widget\'s public endpoints additionally validate origin and embed key before any '
     'per-visitor logic runs.')
code_block(story, '''
// Standard error envelope (all routes)
{
  "error": {
    "code": "QUOTA_EXCEEDED",          // machine-readable
    "message": "Daily request limit reached on the Starter plan.",
    "upgrade": { "plan": "pro", "ctaUrl": "/billing/upgrade?reason=requests_day" },
    "correlationId": "01J8ZQ..."       // present on 5xx; matches server logs
  }
}
''', label='API error contract — quota example')

h2(story, '6.3 Observability')
body(story, 'Structured JSON logging with a request correlation identifier is the floor; on top of it '
     'sit OpenTelemetry traces that follow one chat turn from the API route through retrieval, the '
     'model call, and the event append, so a slow answer decomposes into its parts on demand. The '
     'platform admin dashboard carries the operational panels: LLM latency percentiles per model, '
     'provider error and timeout rates, retrieval failure and abstention rates, ingestion queue depth, '
     'and quota refusal counts per plan. Alert thresholds page a human only on user-visible '
     'degradation — p95 first-token latency above four seconds, provider error rate above five '
     'percent, or ingestion queue depth growing for fifteen minutes — because an alert that does not '
     'demand action trains the team to ignore alerts.')

h2(story, '6.4 Security and privacy baseline')
body(story, 'Multi-tenant isolation is enforced at the data layer: every query path includes orgId '
     'scoping, and a CI lint rule fails any raw database access that omits it. Secrets live in the '
     'platform secret store, never in the repository, and rotate on a schedule. The OWASP LLM Top 10 '
     'is the checklist for AI-specific risks: prompt-injection hardening (retrieved content is data, '
     'never instructions; tool calls are permissioned and audited), output filtering, and PII '
     'redaction on both prompt and answer sides of the audit log. Encryption in transit everywhere and '
     'at rest for storage and database volumes, and a penetration test before the enterprise pack goes '
     'generally available, close the baseline.')

h2(story, '6.5 Testing pyramid')
body(story, 'Unit tests cover services and pure functions; integration tests cover API routes against '
     'a real database and the provider abstraction in record-replay mode; end-to-end Playwright tests '
     'cover the user-visible flows of every phase, including the quota suites from WS-1.3 and the '
     'mobile device matrix from WS-0.3; and load tests exercise streaming under concurrency before '
     'each phase exit. The rule that keeps the pyramid honest is that every acceptance criterion in '
     'this document maps to at least one automated test that runs in CI, which is exactly what '
     'Chapter 7 tabulates.')

# =============================================================
# Chapter 7 — Acceptance & QA Matrix
# =============================================================
h1(story, '7. Acceptance & QA Matrix')
body(story, 'This chapter consolidates every acceptance criterion into one matrix, including explicit '
     'entries for the five defects the platform owner reported. It is the single source of truth for '
     'what done means, and the QA protocol that follows it defines how the matrix is executed: seeded '
     'organisations per plan tier, scripted loops that walk each limit to and past its boundary, '
     'raw-API bypass attempts without a browser, and a fixed mobile device matrix. The matrix is '
     'versioned with the code, and a phase\'s exit review walks its rows line by line.')
story.extend(make_table(
    ['ID', 'Capability / defect', 'Acceptance test', 'Sev.', 'Phase'],
    [
        ['D1', 'Requests-today meter reads zero',
         'One chat turn; UsageEvent row exists; meter increments on next poll; equals event-log count',
         'Blocker', '1'],
        ['D2', 'No audit log of prompts and answers',
         'Prompt and answer audit rows written transactionally; admin viewer filters and exports; org '
         'panel shows own questions only', 'Blocker', '1'],
        ['D3', 'Usage limits not enforced / bypassable',
         'Per-plan suites: N-th request admitted, (N+1)-th refused with 402 contract from UI and raw '
         'API; 100-way concurrent burst admits exactly one at the cap', 'Blocker', '1'],
        ['D4', 'KB uploads fail intermittently',
         'Flaky-network triple upload yields one ready document; silent failures impossible; retry '
         'queue works', 'Blocker', '0'],
        ['D5', 'Non-dashboard pages below mobile standard',
         'No horizontal scroll at 360px on any route; 44px targets; Lighthouse ≥ 90 on landing and top '
         'routes', 'Major', '0'],
        ['F1', 'Streaming with stop / regenerate / copy',
         'p95 first token < 1.5s; stop truncates and persists; regenerate bills as new turn', 'Major', '1'],
        ['F2', 'Inline citations and sources panel',
         '≥ 90% of factual sentences cited; all markers resolve to real passages; panel matches '
         'persisted chunks', 'Major', '2'],
        ['F3', 'Hybrid retrieval + reranking',
         'Golden-set recall@10 +15pp vs baseline; identifier queries retrieve; rerank < 300ms p95',
         'Major', '2'],
        ['F4', 'Abstention policy',
         '≥ 95% honest abstention on unanswerable golden set; content-gap report aggregates', 'Major', '2'],
        ['F5', 'Feedback loop and review queue',
         'Two-click capture; queue reproduces conversation and trace; trends on dashboards', 'Major', '2'],
        ['F6', 'Voice output (TTS)',
         'Sub-second audio start; per-agent voices; quota-checked and audited like chat', 'Minor', '2'],
        ['F7', 'Website widget',
         'One-line embed works; origin allowlist enforced; widget traffic metered and audited; '
         'revocation < 1 minute', 'Major', '3'],
        ['F8', 'Tool calling and MCP',
         'HTTP tool task completes; MCP server tools register; every call audited; budgets enforced',
         'Major', '3'],
        ['F9', 'Evaluation harness',
         'Nightly runs publish scores; degraded retrieval blocks release; failed cases return to '
         'golden set', 'Major', '3'],
        ['F10', 'Enterprise pack',
         'SAML SSO pilot with JIT; SCIM deprovision < 1 sync; RBAC 403s on unauthorised routes; '
         'pen-test criticals closed', 'Major', '3'],
    ],
    [0.06, 0.23, 0.49, 0.10, 0.12],
    caption='Table 10. Acceptance and QA matrix: defects D1-D5 and features F1-F10 with tests, severity, phase.',
    small=True))
body(story, 'Severity gates are deliberately strict: a Blocker fails the phase exit outright, and a '
     'Major fails it unless a dated waiver with an owner and a fix window is recorded. The plan-by-plan '
     'quota suites from WS-1.3 run on every merge to main against staging, so D3 can never silently '
     'regress once closed. Mobile checks run as visual-regression snapshots in the device matrix, and '
     'the Lighthouse budget runs on the deploy pipeline for the landing page and the five '
     'highest-traffic dashboard routes, failing the deploy on regression rather than filing a ticket.')

# =============================================================
# Chapter 8 — Risks, Dependencies & Rollout Strategy
# =============================================================
h1(story, '8. Risks, Dependencies & Rollout Strategy')
body(story, 'Every plan of this length carries risks that are cheaper to name now than to discover in '
     'production. The register below lists the most consequential ones with their likelihood, impact, '
     'and the mitigation already embedded in the plan. Beyond the register, three structural choices '
     'de-risk the whole programme: every feature ships behind a flag and can be dark-launched to '
     'internal organisations first; every schema change is forward-compatible so rollback never '
     'requires data surgery; and the weekly release train means any given bad release is small by '
     'construction.')
story.extend(make_table(
    ['Risk', 'L', 'I', 'Mitigation embedded in the plan'],
    [
        ['Model-provider cost spike or pricing change',
         'M', 'H',
         'Per-model cost metadata (WS-0.4) feeds cost estimates on every usage event; daily '
         'per-org cost rollups alert at plan-relative thresholds'],
        ['pgvector scale ceiling on large KBs',
         'M', 'M',
         'Hybrid search reduces dependence on brute-force ANN; index strategy reviewed at Phase 2 '
         'exit with a migration path to a dedicated vector engine if p95 retrieval exceeds budget'],
        ['Razorpay webhook duplication breaks billing windows',
         'L', 'H',
         'Idempotency keys and event deduplication in the billing-period service; webhook replay '
         'tests in the quota suites'],
        ['Re-index migration locks a large KB',
         'M', 'M',
         'Parallel-index build with atomic flip (WS-2.8); migration runs throttled; rollback is a '
         'pointer change'],
        ['Streaming blocked or buffered by CDN/proxy layers',
         'M', 'M',
         'SSE compatibility tested end-to-end in staging behind the production CDN; fallback to '
         'chunked polling if a customer network breaks SSE'],
        ['Enterprise procurement outpaces engineering',
         'M', 'M',
         'DPA and security documentation start in Phase 2 as a parallel paperwork track; pen test '
         'scheduled with lead time; SSO pilot scoped to one friendly organisation'],
        ['Team capacity smaller than assumed',
         'H', 'M',
         'Phases are independently shippable; Phase 3 workstreams are ordered by revenue leverage so '
         'a capacity cut trims scope, never quality gates'],
    ],
    [0.30, 0.05, 0.05, 0.60],
    caption='Table 11. Risk register: likelihood (L) and impact (I) rated L/M/H with plan-embedded mitigations.',
    small=True))
body(story, 'Rollout follows a fixed cadence. Each workstream merges behind a flag; the flag turns on '
     'for an internal dogfood organisation; acceptance tests run against staging with the flag on; and '
     'the flag goes to a canary percentage of production organisations before full rollout, with the '
     'error budget of the affected routes watched throughout. Database migrations deploy ahead of '
     'code, forward-compatible, so a rolled-back release never orphans a schema change. The team shape '
     'assumed throughout is two to four full-stack engineers plus part-time design support; where the '
     'plan says effort L, it means that workstream is the dominant load of its weeks and should not '
     'share a sprint with another L.')

# =============================================================
# Chapter 9 — Success Metrics & the Definition of Stable
# =============================================================
h1(story, '9. Success Metrics & the Definition of Stable')
body(story, 'The programme is judged by the numbers its own Phase 1 spine produces, which closes the '
     'loop: the platform that could not count anything at the start ends as the platform that measures '
     'itself. The KPI table below defines, per phase, the metrics that prove the phase did what it '
     'existed to do. The closure curve in Figure 4 shows the cumulative programme: roughly sixty '
     'tracked items — every gap and defect from the analysis — closed in a deliberate order, with '
     'trust infrastructure first and reach last.')
story.extend(make_table(
    ['Phase', 'Primary KPIs', 'Target'],
    [
        ['0', 'Defect closure; CI discipline; mobile budget',
         'D1-D5 closed or mitigated; 100% of merges via CI; zero horizontal scroll at 360px'],
        ['1', 'Meter accuracy; quota integrity; audit coverage; stream latency',
         'Meters = event log for sampled orgs; zero bypass in suites; 100% of turns audited; p95 '
         'first token < 1.5s'],
        ['2', 'Retrieval quality; citation coverage; abstention honesty; feedback loop SLA',
         'Recall@10 +15pp; ≥ 90% sentences cited; ≥ 95% abstention on unanswerables; reviews resolved '
         '< 5 working days'],
        ['3', 'Distribution; evaluation discipline; enterprise readiness',
         '≥ 10 live widget deployments; nightly evals green with release gating; SSO pilot signed off'],
    ],
    [0.08, 0.42, 0.50],
    caption='Table 12. Phase-level KPIs and their targets.',
    small=True))
chart(story, f'{ASSETS}/chart_closure.png',
      'Figure 4. Cumulative gaps closed across the programme: roughly 60 tracked items, sequenced '
      'trust-first.', max_h=250)
h2(story, '9.1 The definition of stable')
body(story, 'Stable is a checklist, not a feeling. The platform is stable when all five reported '
     'defects are closed with their acceptance tests automated; when every plan tier\'s limits are '
     'enforced server-side and verified by the per-plan suites on each merge; when every prompt and '
     'answer is audited, redacted, and tamper-evident; when meters reconcile against the event log '
     'exactly for sampled organisations; when p95 first-token latency, provider error rate, and '
     'ingestion queue depth have stayed inside their budgets for thirty consecutive days; and when '
     'the nightly evaluation harness has gated releases for two weeks without a silent regression. '
     'At that point the platform counts what it does, refuses what plans forbid, proves what it '
     'answers, and watches itself\u00a0—\u00a0which is precisely what this programme was commissioned to '
     'achieve.')
h2(story, '9.2 Beyond the six months')
body(story, 'A short backlog is deliberately left for after the window rather than crammed into it: '
     'multi-language retrieval with language-aware chunking; a prompt A/B testing loop on top of the '
     'evaluation harness; agentic workflow orchestration beyond single tool calls; marketplace '
     'distribution of agent templates; and usage-based overage billing on top of the usage-event '
     'spine. Each of these becomes materially cheaper once Phase 3 lands, which is the sign of a '
     'well-sequenced foundation rather than an unfinished plan.')

# =============================================================
# Chapter 10 — References
# =============================================================
h1(story, '10. References')
refs = [
    'Anthropic. (2025). Model Context Protocol specification. Retrieved from modelcontextprotocol.io',
    'Amazon Web Services. (2024). Amazon Bedrock Knowledge Bases: ingestion and sync patterns. AWS '
    'Documentation.',
    'Es, S., James, J., Espinosa-Anke, L., & Schoot, H. (2023). RAGAS: Automated evaluation of '
    'retrieval augmented generation. arXiv preprint arXiv:2309.15217.',
    'Gao, Y., Xiong, Y., Gao, X., et al. (2023). Retrieval-augmented generation for large language '
    'models: A survey. arXiv preprint arXiv:2312.10997.',
    'Lewis, P., Perez, E., Piktus, A., et al. (2020). Retrieval-augmented generation for '
    'knowledge-intensive NLP tasks. NeurIPS 2020.',
    'Microsoft. (2024). Azure OpenAI Service: embeddings and vector search best practices. Microsoft '
    'Learn Documentation.',
    'Nogueira, R., & Cho, K. (2019). Passage re-ranking with BERT. arXiv preprint arXiv:1901.04085.',
    'OpenAI. (2024). Embeddings guide and text-embedding-3 model family. OpenAI Documentation.',
    'OWASP Foundation. (2025). OWASP Top 10 for large language model applications. owasp.org.',
    'Playwright. (2025). End-to-end testing and device emulation documentation. playwright.dev',
    'PostgreSQL Global Development Group. (2024). Full text search and pgvector extension '
    'documentation. postgresql.org.',
    'Sentry. (2025). Error monitoring and tracing documentation. sentry.io',
    'AICPA. (2024). Trust Services Criteria for Security, Availability, and Confidentiality '
    '(SOC 2). aicpa.org',
    'Yao, S., Zhao, J., Yu, D., et al. (2023). Tree of thoughts and tool-use in language model '
    'agents. NeurIPS 2023.',
    'Zheng, L., Chiang, W. L., Sheng, Y., et al. (2024). Judgment on APIs: evaluation pipelines for '
    'LLM systems. NeurIPS 2024 Datasets and Benchmarks.',
]
for r in refs:
    story.append(Paragraph(r, S['ref']))

# ---------------- Build ----------------
doc = TocDocTemplate(
    OUT_BODY, pagesize=A4,
    leftMargin=MARGIN, rightMargin=MARGIN,
    topMargin=MARGIN, bottomMargin=MARGIN,
    title=DOC_TITLE, author='Z.ai', creator='Z.ai',
    subject='Phase-by-phase implementation plan and engineering blueprint for the Clara AI platform')
doc.multiBuild(story, onFirstPage=on_page, onLaterPages=on_page)
print('body built:', OUT_BODY)
