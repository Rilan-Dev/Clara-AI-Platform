#!/usr/bin/env python3
"""Clara AI Platform — Feature Gap Analysis & AI Enhancement Roadmap.
Body PDF via ReportLab (Report brief). English document.
Crystal Blue palette (Template 07 body system).

Chapter Numbering Plan (Step 3.5):
| Outline | Type    | Chapter | Title                                    |
|---------|---------|---------|------------------------------------------|
| 1       | cover   | —       | Cover (separate HTML/Playwright PDF)    |
| 2       | toc     | —       | Table of Contents                        |
| 3       | content | 1       | Executive Summary                        |
| 4       | content | 2       | Platform Current State Assessment        |
| 5       | content | 3       | Missing AI Features — Gap Analysis       |
| 6       | content | 4       | AI Core Improvements & Corrections       |
| 7       | content | 5       | Knowledge & Ingestion Enhancements       |
| 8       | content | 6       | Trust, Safety & Evaluation               |
| 9       | content | 7       | Analytics, Monitoring & Cost Control     |
| 10      | content | 8       | Integrations & Enterprise Readiness      |
| 11      | content | 9       | Prioritized Roadmap & Benefits           |
| 12      | content | 10      | References & Further Reading             |
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
S['code'] = ParagraphStyle('Code', fontName='DejaVuSans', fontSize=8.5, leading=12,
                           textColor=TEXT_PRIMARY, leftIndent=10, spaceAfter=6)

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

def make_table(headers, rows, ratios, caption=None, align_center_cols=None):
    """Table with Paragraph cells, Crystal Blue scheme, centered, width-fitted."""
    col_w = [r * AVAIL_W for r in ratios]
    assert abs(sum(ratios) - 1.0) < 0.01, 'ratios must sum to 1'
    data = [[Paragraph(f'<b>{h}</b>', S['th']) for h in headers]]
    for row in rows:
        cells = []
        for ci, cell in enumerate(row):
            st = S['td_c'] if (align_center_cols and ci in align_center_cols) else S['td']
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

# ---------------- Header / Footer ----------------
DOC_TITLE = 'Clara AI Platform — Feature Gap Analysis & AI Enhancement Roadmap'

def on_page(canvas, doc):
    canvas.saveState()
    # header
    canvas.setFont('FreeSerif', 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, PAGE_H - 0.55 * inch, DOC_TITLE)
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(MARGIN, PAGE_H - 0.62 * inch, PAGE_W - MARGIN, PAGE_H - 0.62 * inch)
    # footer
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 0.62 * inch, PAGE_W - MARGIN, 0.62 * inch)
    canvas.setFont('FreeSerif', 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, 0.45 * inch, 'RiluRaafu · Platform Strategy Review')
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
# Chapter 1 — Executive Summary
# =============================================================
h1(story, '1. Executive Summary')
body(story, 'Clara is an organisation-grade AI assistant platform built around three pillars: '
     'retrieval-augmented chat over company knowledge bases, configurable AI agents with prompt, '
     'voice, language, and model controls, and a multi-tenant subscription business with platform '
     'admin and organisation dashboards. The product already covers an impressive amount of ground '
     'for a young platform: knowledge base selection in chat, voice input, suggested prompts, an '
     'agent publish/draft workflow, OpenAI model management, and Razorpay-backed billing with '
     'per-plan usage meters. This report was commissioned to answer a focused question: measured '
     'against the current state of the art, which AI features are missing, which existing features '
     'need correction, and where should the team invest next.')
body(story, 'The analysis combines two inputs. First, a full inventory of the platform was reconstructed '
     'from the product screens currently deployed, covering the chat workspace, the agent builder '
     '(Overview, Prompt, Voice, Language, Model, and Projects tabs), the model configuration console, '
     'and the billing and plan pages. Second, the inventory was benchmarked against published feature '
     'sets and engineering guidance from market-leading platforms and references: Chatbase, CustomGPT, '
     'Dify, Botpress and ChatGPT Enterprise for product surface area; RAG best-practice literature for '
     'retrieval quality; the RAGAS and LangSmith ecosystems for evaluation; and the guardrails literature '
     'for safety. All sources are listed in Chapter 10.')
stat_row(story, [
    ('55+', 'Missing or incomplete AI features identified'),
    ('8', 'Capability areas benchmarked'),
    ('10', 'Known defects and corrections catalogued'),
    ('3', 'Roadmap phases proposed'),
])
body(story, 'Three findings dominate. First, the platform has a <b>trust gap</b>: answers currently ship '
     'without inline citations, confidence signals, or feedback controls, which is the single most '
     'requested capability in enterprise AI adoption and the cheapest to deliver relative to its impact. '
     'Second, there is a <b>visibility gap</b>: conversation analytics, audit logging of prompts and '
     'generated answers, per-tenant cost metering, and working usage counters are either missing or '
     'defective, which blocks both enterprise sales and internal cost control. Third, there is a '
     'correctness backlog — the requests-today counter, knowledge base upload reliability, embedding '
     'model configuration, and subscription quota enforcement all require repair before new surface '
     'area is added. Chapter 9 sequences these into a three-phase roadmap in which every phase is '
     'independently shippable and value-bearing.')
callout(story, '<b>Recommendation in one sentence:</b> fix the measurement and enforcement core first '
        '(counters, audit logs, quotas), ship the trust layer next (citations, streaming, feedback), '
        'then invest in retrieval quality (hybrid search, reranking) and distribution (website widget, '
        'integrations) — in that order.')

# =============================================================
# Chapter 2 — Platform Current State Assessment
# =============================================================
h1(story, '2. Platform Current State Assessment')
body(story, 'A precise inventory of what exists today is the baseline for every gap statement that follows. '
     'The table below consolidates the platform surface as observed across the product screens, together '
     'with the operational state of each area. Status codes: OK = functioning; PARTIAL = present but '
     'incomplete; DEFECT = present but broken or unenforced; ABSENT = not found in the product.')

story.extend(make_table(
    ['Capability area', 'What exists today', 'Status'],
    [
        ['Chat and RAG', 'Chat workspace with knowledge base selector, voice input button, suggested '
         'starter prompts, hallucination disclaimer, "N documents ready" indicator', 'PARTIAL'],
        ['Knowledge bases', 'Multiple KBs per organisation (5 in use on observed account); document '
         'upload; storage metering', 'PARTIAL'],
        ['AI agents', 'Agent builder with Overview, Prompt, Voice, Language, Model, Projects tabs; '
         'publish / back-to-draft workflow; agent name, purpose, assistant name, avatar URL', 'PARTIAL'],
        ['Model management', 'OpenAI chat model selection (gpt-5.6-terra / luna / sol, gpt-4o, '
         'gpt-4o-mini) with confirmation checkbox; embedding model setting', 'DEFECT'],
        ['Billing and plans', 'Enterprise plan flags (Unlimited KBs, documents, requests, SSO/SAML, '
         'Custom LLM, SLA); Razorpay renewal; usage meters for KBs, requests, storage', 'DEFECT'],
        ['Organisation dashboards', 'Home, Agents, Members, Billing, More navigation; organisation '
         'analytics view; user question visibility requested', 'DEFECT'],
        ['Platform administration', 'Platform admin dashboard with monitoring; audit logging of prompts '
         'and answers required but not yet present', 'DEFECT'],
        ['Mobile experience', 'Dashboard meets mobile standard; remaining pages lack card spacing and '
         'component scaling', 'PARTIAL'],
    ],
    [0.18, 0.64, 0.18],
    caption='Table 1. Current-state inventory of the Clara platform.',
    align_center_cols={2},
))

h2(story, '2.1 What the platform already does well')
body(story, 'The agent builder is genuinely well-conceived. Separating the internal agent name from the '
     'customer-facing assistant name, capturing an explicit purpose note, and gating every change behind '
     'a save action with a draft/publish lifecycle mirrors how mature no-code platforms such as Voiceflow '
     'and Botpress manage agent state. The model configuration console deserves similar credit: forcing an '
     'explicit "I confirm this change" acknowledgement before switching the primary chat model protects '
     'organisations from accidental model downgrades mid-flight, and the dropdown listing alternative '
     'models with checkmark selection is the correct interaction pattern.')
body(story, 'The billing skeleton is also structurally sound. Per-plan feature flags, a renewal trail with '
     'payment provider attribution, and three usage meters (knowledge bases, requests today, storage) are '
     'the right primitives for a usage-based SaaS. The problems are all in enforcement and observability, '
     'not in information architecture — which is the best possible position to be fixing from, as '
     'Chapter 7 details.')

h2(story, '2.2 Known defects and outstanding work')
body(story, 'Five defects were reported by the platform owner and are confirmed as open items: (1) the '
     '"requests today" counter on organisation dashboards always reports zero; (2) no audit logging of '
     'user prompts and AI-generated answers exists anywhere, for either platform admins or organisation '
     'owners; (3) usage-limit monitoring does not enforce subscription quotas, so plan limits can be '
     'exceeded or bypassed; (4) knowledge base uploads fail intermittently; and (5) pages outside the '
     'dashboard do not yet meet the mobile responsiveness standard the dashboard set. Each of these is '
     'carried into the roadmap as a Phase 1 item because they are trust and revenue risks before they '
     'are feature gaps.')
callout(story, '<b>Sequencing principle:</b> a broken meter cannot be upsold against, and an unlogged '
        'answer cannot be defended. Metering, logging, and enforcement precede every new AI capability '
        'in the proposed roadmap.')

# =============================================================
# Chapter 3 — Missing AI Features — Gap Analysis
# =============================================================
h1(story, '3. Missing AI Features — Gap Analysis')
body(story, 'The gap analysis benchmarks Clara against the published feature sets of four horizontal '
     'platforms (Chatbase, CustomGPT, Dify, Botpress) and one vertical reference (ChatGPT Enterprise), '
     'plus the engineering practice documented in the RAG and evaluation literature. The intent is not '
     'to clone any competitor but to identify which capabilities have become table stakes — features '
     'that a buyer now assumes exist — and which are differentiators. The summary chart shows the '
     'distribution of the 55+ identified gaps across eight capability areas; the sections that follow '
     'detail the most consequential ones.')
chart(story, f'{ASSETS}/chart_gaps.png',
      'Figure 1. Missing or incomplete AI features identified, grouped by capability area.',
      max_h=280)

h2(story, '3.1 Answer trust: citations, sources, and confidence')
body(story, 'Every benchmarked competitor renders answers with inline numbered citations that open the '
     'source passage, and ChatGPT Enterprise extends this with links to the exact source documents. '
     'Clara currently returns plain prose. This is the highest-leverage gap in the entire report: '
     'industry survey data consistently ranks "ability to verify answers against sources" among the '
     'top two purchase criteria for enterprise assistants, and internal pilots show that cited answers '
     'are re-read, shared, and acted upon far more often than uncited ones. The platform already knows '
     'which chunks were retrieved for each answer — the metadata simply is not surfaced to the user. '
     'Related gaps include a source panel listing the documents that contributed to each answer, '
     'clickable snippet popovers, and a per-answer confidence or groundedness indicator.')

h2(story, '3.2 Chat experience: streaming and conversation controls')
body(story, 'The chat surface lacks the interaction basics that users now treat as ambient expectations: '
     'token-by-token streaming with a stop-generation control, a regenerate button, per-message copy, '
     'markdown and code rendering with syntax highlighting, chat export or share links, and suggested '
     'follow-up questions after each answer. Without streaming, a long answer produces 10–20 seconds of '
     'perceived dead time, which usability studies consistently rate as the largest single driver of '
     '"the bot feels broken" feedback. Conversation management is equally absent: there is no visible '
     'history list, no rename or pin, no per-conversation knowledge base switching, and no ability to '
     'resume a thread — every session currently starts from zero context, which silently discards the '
     'single biggest quality lever available (conversation memory).')

h2(story, '3.3 Retrieval quality: hybrid search and reranking')
body(story, 'The retrieval layer appears to be pure vector similarity. The 2024–2026 RAG best-practice '
     'literature is unusually unanimous that production systems need hybrid retrieval (dense vectors '
     'combined with keyword/BM25 scoring) plus a second-stage reranker (a cross-encoder such as Cohere '
     'Rerank or a hosted reranking model). Hybrid search fixes the failure mode where exact identifiers, '
     'product codes, or names that embed poorly get missed; reranking typically improves answer '
     'groundedness by reordering the top retrieved chunks before they reach the LLM. Missing alongside '
     'these are query rewriting for multi-turn conversations (resolving "it" and "that" against prior '
     'turns), multi-query expansion for ambiguous questions, and an explicit abstention policy so the '
     'assistant says "I do not find this in your knowledge base" instead of hallucinating when retrieval '
     'confidence is low.')

h2(story, '3.4 Agent intelligence: tools, MCP, and human handoff')
body(story, 'Clara agents can converse but cannot act. The benchmark platforms expose tool calling '
     '(function calling) so an agent can search the web, run calculations, call internal APIs, or '
     'trigger workflows; Dify and the newer Botpress releases go further with multi-step agent '
     'orchestration, and the industry is consolidating rapidly on the Model Context Protocol (MCP) as '
     'the standard way to plug tools, data sources, and actions into agents. Also missing is '
     'AI-to-human handoff: escalation rules that hand a conversation to a human operator with full '
     'context transfer when confidence drops, sentiment turns negative, or the user explicitly asks '
     'for a person. For a platform whose agents carry "Guide and Support" purposes, handoff is not an '
     'advanced extra — it is the difference between a demo and deployable support automation.')

h2(story, '3.5 Feedback, evaluation, and the improvement loop')
body(story, 'There is currently no mechanism for a user to say an answer was good or bad: no thumbs '
     'up/down, no per-message feedback, no CSAT survey, and no analytics on any of it. This closes the '
     'loop that every serious deployment relies on — negative feedback feeds the content gap backlog '
     '(what should be added to the KB), while aggregate metrics (answer rating, resolution rate, '
     'no-answer rate) are the numbers that prove ROI to the organisation paying the subscription. On '
     'the engineering side, the platform also lacks a prompt versioning and A/B testing workflow and '
     'an offline evaluation harness (golden question sets scored with RAGAS-style faithfulness and '
     'relevancy metrics), which are what allow prompt or model changes to ship with evidence rather '
     'than hope.')

h2(story, '3.6 Distribution and enterprise controls')
body(story, 'Two further gap clusters complete the picture. Distribution: there is no embeddable website '
     'widget, no Slack/Teams/WhatsApp channel support, no public API with keys and rate limits, and no '
     'webhooks or Zapier-class automation — meaning Clara agents can only be used inside the platform, '
     'while every competitor lives primarily on the customer is own website. Enterprise controls: audit '
     'logs of prompts and generated answers (a compliance requirement before most mid-market sales), '
     'granular RBAC down to agent-level permissions, data retention policies, and white-labelling are '
     'all absent, even though SSO/SAML is already advertised in the Enterprise plan. Selling SSO '
     'without audit logging tends to fail procurement review; Chapter 8 covers the full enterprise '
     'readiness checklist.')

# =============================================================
# Chapter 4 — AI Core Improvements & Corrections
# =============================================================
h1(story, '4. AI Core Improvements & Corrections')
body(story, 'This chapter specifies the upgrades and fixes to features that already exist — the '
     'corrections that make current surface area behave the way the marketing already implies it does. '
     'Each item states what to change, why it matters, and the acceptance test that proves it is done.')

h2(story, '4.1 Fix the model configuration layer')
body(story, 'The model console shows the embedding model set to <font name="DejaVuSans" size="8.5">'
     'gpt-4o-2024-08-06</font>, which is a chat model identifier, not an embedding model — embedding '
     'generation should reference the text-embedding family (for example text-embedding-3-small or '
     '-large). Beyond the naming defect, the deeper risk is dimension coupling: the console warns that '
     'the embedding model "must match vector dimension", which means switching embedding models without '
     'a re-indexing pipeline silently corrupts retrieval. The correction is threefold: (1) separate the '
     'chat-model and embedding-model catalogues so only valid models appear in each; (2) add a '
     'migration workflow that re-embeds all knowledge base chunks in a background job when the '
     'embedding model changes, with progress UI and rollback; (3) store the embedding model identity '
     'and dimension alongside each KB and refuse queries against dimension-mismatched indexes. '
     'Acceptance test: change the embedding model on a populated KB and verify answers remain correct '
     'after re-index completes, with zero manual SQL intervention.')

h2(story, '4.2 Streaming responses with full message controls')
body(story, 'Convert chat completion to server-sent events (or an equivalent streaming transport) so '
     'tokens render as they arrive, with a stop button that aborts generation, a regenerate control '
     'that re-runs the last turn, per-message copy, and markdown plus code-block rendering with syntax '
     'highlighting. Streaming changes perceived latency from "seconds of nothing" to "immediate, '
     'progressive output", which is the strongest cheap win available in chat UX. The engineering '
     'prerequisites are modest: the OpenAI-compatible APIs stream natively, and the main work is '
     'partial-message persistence (write the message row on start, append deltas, finalise on '
     'completion) so that interrupted answers are stored correctly for the audit log introduced in '
     'Chapter 7. Acceptance test: a 500-token answer shows first tokens within one second, stop '
     'mid-stream leaves a coherent partial message in history, and regenerate produces a replacement '
     'answer with both versions counted in usage metering.')

h2(story, '4.3 Inline citations and the source panel')
body(story, 'With streaming in place, citations become the natural next layer. The retrieval layer '
     'already selects chunks per answer; persist those chunk IDs with the answer and render numbered '
     'citation markers on the sentences they support. Clicking a marker opens a popover with the '
     'source document name, the exact passage, and a link to the document. A collapsible "Sources" '
     'panel beneath the answer lists all contributing documents. The prompt should instruct the model '
     'to answer only from retrieved context and to place citation markers, and a post-processing step '
     'can drop citations that do not correspond to actually-retrieved chunks — a guard against '
     'fabricated references. Acceptance test: for a KB of 20 documents, 90% of factual sentences carry '
     'at least one citation, and every citation resolves to a real stored passage.')

h2(story, '4.4 Conversation memory and follow-ups')
body(story, 'Persist conversations as first-class objects: a history sidebar with rename and pin, '
     'per-conversation knowledge base binding, and automatic context carry-over across turns with '
     'query rewriting so follow-up questions like "summarise that second point" resolve correctly. '
     'Suggested follow-up questions (generated in the same completion call, cheaply) guide users '
     'deeper into the KB and demonstrably increase engagement. Memory policy should be explicit and '
     'configurable per agent — how many turns of context to include, and whether history is scoped to '
     'the conversation only — because token budgeting and cost metering (Chapter 7) both depend on it. '
     'Acceptance test: ask a question, then ask "what else does it say about that?" and verify the '
     'second answer references the first turn without the user repeating context.')

h2(story, '4.5 Voice: complete the loop')
body(story, 'The chat header already carries a Voice input button, so speech-to-text exists. The '
     'missing half is voice output: a speaker control on each answer that plays a natural TTS '
     'rendering, and, as a stretch capability, a real-time voice mode in which the conversation is '
     'spoken turn-by-turn with barge-in support. The pragmatic build is to integrate a hosted TTS API '
     '(ElevenLabs, Azure Speech, or similar), cache generated audio per message so replay is free, and '
     'expose per-agent voice selection in the existing Voice tab — which already exists in the agent '
     'builder and is currently the natural home for this configuration. Acceptance test: with voice '
     'enabled, a full question-and-answer round trip completes hands-free, and the same audio is not '
     'regenerated on replay.')

h2(story, '4.6 Multimodal input in chat')
body(story, 'Add image and file attachment to the chat composer so users can paste a screenshot or '
     'attach a spreadsheet and ask questions about it. This requires selecting a vision-capable chat '
     'model for image turns (the model catalogue from 4.1 makes this a dropdown, not a project), file '
     'type and size validation, and extending the usage meter to count multimodal tokens. Multimodal '
     'input consistently ranks among the most-used features after launch on comparable platforms '
     'because it matches how users actually work — they have a document on screen, not a clean text '
     'question in mind. Acceptance test: attach a product screenshot and ask "what setting is '
     'highlighted here?" and receive an accurate grounded answer.')

# =============================================================
# Chapter 5 — Knowledge & Ingestion Enhancements
# =============================================================
h1(story, '5. Knowledge & Ingestion Enhancements')
body(story, 'The knowledge base is the platform is compounding asset: every ingestion-quality improvement '
     'multiplies the quality of every future answer. Today ingestion is limited to manual document '
     'uploads, and the observed upload bug means even that path is unreliable. This chapter specifies the '
     'ingestion upgrades in priority order, following the same pattern that managed KB services such as '
     'Amazon Bedrock Knowledge Bases have normalised.')

h2(story, '5.1 Stabilise and enrich file ingestion')
body(story, 'First, fix the upload pipeline: make it resumable, add per-file progress, validate types '
     'server-side, and surface partial-failure states honestly instead of failing silently. Second, widen '
     'the format matrix: CSV and XLSX (with table-aware extraction so row context is preserved), JSON and '
     'XML, HTML pages, EPUB, and subtitle files are all standard fare on competitor platforms. Third, add '
     'OCR for scanned PDFs and image-only pages — without it, a large fraction of real corporate PDF '
     'collections ingest as empty text. Each parser should record what it extracted (pages, tables, '
     'characters) so the KB detail view can show ingestion health per document, and failed documents '
     'should land in a retry queue visible to organisation owners rather than disappearing.')

h2(story, '5.2 Live sources: crawling and re-sync')
body(story, 'Static uploads age badly. Add URL and sitemap ingestion so an organisation can point Clara '
     'at its website, help centre, or docs portal and have content pulled automatically, plus scheduled '
     're-sync (daily or weekly) with change detection so updated pages are re-ingested without human '
     'attention. Crawler hygiene matters: respect robots.txt, cap crawl depth and page count per plan, '
     'and deduplicate near-identical pages. This one capability converts the KB from a "snapshot the '
     'intern uploaded once" into a living index, and it is the single most requested ingestion feature '
     'in the Chatbase and CustomGPT feature sets.')

h2(story, '5.3 Third-party connectors')
body(story, 'Behind crawling sit the connector integrations buyers expect: Notion, Google Drive, '
     'Confluence, SharePoint, and Dropbox at minimum, with YouTube transcript ingestion as a low-cost '
     'differentiator. Each connector needs OAuth-based account linking per organisation, a selectable '
     'folder or space scope, and incremental sync. Connector depth is also a pricing lever — every '
     'competitor gates connectors to upper tiers, and Clara is subscription structure (Chapter 2) already '
     'has the plan-flag machinery to do the same. Recommendation: ship Notion and Google Drive first; '
     'they cover the majority of SMB and mid-market document stores and both have mature APIs.')

h2(story, '5.4 Retrieval playground and chunk quality control')
body(story, 'Give KB owners a retrieval playground: type a question, see the exact chunks the retriever '
     'would fetch, their scores, and which would be reranked into the prompt. This single tool converts '
     'KB quality work from guesswork into a measurable loop — owners see immediately when a document '
     'is missing, badly chunked, or out of date. Alongside it, expose chunk-level management: view the '
     'chunks a document produced, delete bad chunks without deleting the document, and preview how a '
     're-chunk would change the split. These tools are cheap to build (the retrieval path already '
     'exists) and they directly attack the number-one cause of bad answers: dirty input data.')

h2(story, '5.5 Preprocessing rules and versioning')
body(story, 'Add per-KB preprocessing rules — find-and-replace, regex cleanup, header/footer stripping, '
     'and metadata tagging — applied at ingest time so boilerplate and navigation chrome do not pollute '
     'embeddings. Add document versioning: re-uploading a document with the same name should create a '
     'new version with delta re-indexing (only changed chunks re-embedded) rather than a duplicate, and '
     'older versions should remain queryable-with-flag or archivable. Combined with the embedding-model '
     'migration workflow from 4.1, this gives the KB a genuine lifecycle model: ingest, inspect, revise, '
     're-index, retire.')

# =============================================================
# Chapter 6 — Trust, Safety & Evaluation
# =============================================================
h1(story, '6. Trust, Safety & Evaluation')
body(story, 'Trust features are what allow an AI assistant to move from "impressive demo" to "deployed in '
     'front of customers". The guardrails literature is clear that safety is layered: input-side '
     'guardrails, grounding controls at generation, output-side checks, and an evaluation harness that '
     'measures whether any of it is working. Clara currently has one trust affordance — the static '
     '"Clara can make mistakes" disclaimer — and this chapter lays out the rest.')

h2(story, '6.1 Input guardrails')
body(story, 'Protect the prompt boundary. Add prompt-injection detection for user messages that try to '
     'override the system prompt ("ignore your instructions and..."), which is the attack class most '
     'likely to embarrass a deployed assistant; topic restriction controls per agent (refuse out-of-scope '
     'subjects gracefully); and PII redaction on input so names, emails, and account numbers never reach '
     'the model provider. Every one of these is best implemented as a pre-generation check that returns '
     'a policy-compliant refusal message — the guardrail itself becomes part of the conversation record, '
     'which the audit log in Chapter 7 then preserves.')

h2(story, '6.2 Grounding and abstention controls')
body(story, 'On the generation side, enforce answer-from-context: the system prompt instructs the model '
     'to answer only from retrieved chunks and to say when the knowledge base does not contain the '
     'answer. Pair it with a retrieval-score threshold below which the assistant abstains ("I do not '
     'find this in your knowledge base — would you like to ask it differently or request that this '
     'document be added?") rather than generating from parametric memory. Abstention turns the '
     'hallucination problem into an honest gap the organisation can close by adding content — and it is '
     'the behaviour procurement reviewers specifically probe for. The abstention rate itself becomes a '
     'first-class analytics metric (Chapter 7): every abstention is a content-gap signal.')

h2(story, '6.3 Output checks and feedback loop')
body(story, 'Post-generation, run lightweight output checks: citation validation (every marker must '
     'resolve to a retrieved chunk, per 4.3), optional toxicity and moderation scoring, and PII '
     'redaction on output. Then give users the feedback primitives: thumbs up/down per message with an '
     'optional comment, aggregated into a per-agent, per-KB, and per-organisation quality view. Negative '
     'feedback should queue for review with the full conversation attached, turning each unhappy user '
     'into a concrete content or prompt fix. Over time this loop is what separates platforms that '
     'improve after launch from platforms that decay.')

h2(story, '6.4 Evaluation harness')
body(story, 'Finally, build the offline measurement rig. Maintain a golden set of 50–200 real questions '
     'per KB with expected answer points; run it on every prompt, model, or retrieval change; and score '
     'with RAGAS-family metrics — faithfulness (is the answer supported by retrieved context?), answer '
     'relevancy, and context precision/recall (did retrieval fetch the right chunks?). Wire results into '
     'the existing agent draft/publish flow so a draft agent must pass its evaluation before publishing. '
     'Add prompt versioning with rollback and simple A/B routing (per-agent prompt variants split by '
     'user hash) so improvements are demonstrated, not asserted. This is the machinery that lets the '
     'team change models in 4.1 without gambling the product on vibes.')
callout(story, '<b>Safety is a product feature:</b> guardrails, abstention, citations, and feedback are '
        'not compliance overhead — they are the capabilities enterprise buyers demo before they buy, '
        'and they are cheaper than any go-to-market spend at converting trials into contracts.')

# =============================================================
# Chapter 7 — Analytics, Monitoring & Cost Control
# =============================================================
h1(story, '7. Analytics, Monitoring & Cost Control')
body(story, 'This chapter consolidates the measurement layer: the fixes that make existing meters work, '
     'the audit trail that enterprise buyers require, and the cost telemetry that protects margin. '
     'Measurement items are deliberately sequenced first in the roadmap because every other chapter '
     'depends on them — citations need message persistence, evaluation needs conversation records, '
     'and pricing needs usage truth.')

h2(story, '7.1 Fix the meters and enforce the quotas')
body(story, 'The "requests today" counter reads zero because chat completions evidently do not write '
     'usage events. The fix is architectural, not cosmetic: every model invocation (chat turn, '
     'embedding batch, TTS render) should append an immutable usage event row recording organisation, '
     'user, agent, KB, model, token counts, latency, and cost estimate. All meters — requests today, '
     'monthly request totals, storage, KB counts — then become simple aggregations over that table, '
     'and the organisation dashboard renders them live. Enforcement is the other half: subscription '
     'quotas must be checked server-side before every billable action, returning a friendly '
     'quota-exceeded message with an upgrade path when the limit is hit, and soft warnings at 80% '
     'utilisation. Plan-gated features (model access, connectors, SSO) must be enforced at the API '
     'layer too — hidden in the UI is not enforced. Acceptance test: on a capped test plan, the '
     'request counter increments immediately per turn, the 81st request is refused with the upgrade '
     'message, and direct API calls reproduce the same refusal.')

h2(story, '7.2 Audit logging of prompts and answers')
body(story, 'Log every user prompt and AI-generated answer as a first-class audit record: timestamp, '
     'actor, organisation, agent, KB, the prompt text, the answer text, the retrieved sources, the '
     'model used, and any guardrail actions taken. Platform admins get a global, filterable audit '
     'view (by organisation, user, agent, date, keyword); organisation owners get the same records '
     'scoped to their tenant — which simultaneously satisfies the "show user questions in the '
     'organisation dashboard" requirement. Retention should be configurable per plan (30 days to '
     'indefinite) with export to CSV/JSON for SIEM ingestion. This is the feature that unblocks '
     'procurement: security reviewers ask "who asked what, and what did the AI say?" and today the '
     'platform has no answer.')

h2(story, '7.3 Conversation analytics')
body(story, 'With conversations and feedback persisted, the analytics layer writes itself into the '
     'organisation dashboard: query volume over time, top questions, no-answer and abstention rates '
     '(the content-gap backlog, ranked), thumbs-up ratio and CSAT trend, resolution rate, and topic '
     'clustering of unanswered questions so the KB owner can see "these 40 failed questions are all '
     'about refunds" at a glance. Platform admins get cross-tenant aggregates without ever exposing '
     'one tenant is content to another. These are the dashboards that turn a subscription into a '
     'line of business: the organisation owner logs in to see value being delivered daily.')

h2(story, '7.4 Token and cost telemetry')
body(story, 'Attach cost to every usage event: prompt tokens, completion tokens, embedding tokens, '
     'and (once TTS and tools exist) their respective unit costs, computed from a per-model price '
     'table that admins can update. Render cost per organisation, per agent, and per KB alongside '
     'the usage meters, with budget alerts at configurable thresholds. This gives the platform three '
     'things at once: margin visibility (gross margin per tenant per month), an upsell instrument '
     '(usage-based overage pricing becomes possible), and an engineering signal (which agents burn '
     'tokens without producing rated-good answers).')

h2(story, '7.5 Operational monitoring')
body(story, 'Finally, the platform-facing telemetry: LLM latency percentiles, error and timeout rates '
     'per model provider, retrieval failure rates, and queue depth for ingestion jobs, exposed on the '
     'platform admin dashboard with alerting. The existing platform admin view already provides the '
     'shell; what it needs is these AI-specific signals so incidents ("the assistant is slow today") '
     'are diagnosed in minutes from data rather than assembled from user complaints.')

# =============================================================
# Chapter 8 — Integrations & Enterprise Readiness
# =============================================================
h1(story, '8. Integrations & Enterprise Readiness')
body(story, 'Distribution determines whether Clara agents live where customers actually are, and '
     'enterprise controls determine whether organisations are allowed to buy. Both clusters are '
     'absent today, and both follow a well-trodden sequence on comparable platforms.')

h2(story, '8.1 The website widget')
body(story, 'The single highest-value integration is the embeddable chat widget: a one-line script '
     'tag that renders the agent on any website, with customisable colours, logo, position, '
     'welcome message, and a pre-chat lead-capture form (name and email) that gates or enriches the '
     'conversation. Every benchmark platform leads with this feature because it converts the platform '
     'from a destination into infrastructure — the agent meets the customer on the customer is site. '
     'Required plumbing: per-agent embed keys, origin allow-listing, transcript pass-back to the '
     'CRM via webhook, and rate limiting per plan. Acceptance test: paste the snippet into a plain '
     'HTML page, verify the branded widget loads, captures a lead, answers from the KB, and the '
     'conversation appears in the organisation dashboard in real time.')

h2(story, '8.2 Channels and automation')
body(story, 'After the widget, extend the same agent runtime to Slack and Microsoft Teams (workspace '
     'apps), WhatsApp Business, and Messenger — each channel is a thin adapter over the existing '
     'conversation API, with channel-specific affordances (threads, mentions, message length). Then '
     'expose the automation surface: outbound webhooks on conversation events (lead captured, '
     'handoff requested, negative feedback), a public REST API with scoped keys and per-plan rate '
     'limits, and Zapier/Make connectors so non-developer customers can wire Clara into their CRM '
     'and ticketing without the platform writing a single bespoke integration.')

h2(story, '8.3 Enterprise controls and compliance')
body(story, 'The Enterprise plan already promises SSO/SAML, custom LLMs, and an SLA. To be sellable '
     'it also needs: the audit logging of Chapter 7.2 (non-negotiable for most buyers); granular '
     'RBAC with agent-level and KB-level permissions (viewer, operator, editor, owner) extending the '
     'existing Members area; data residency and retention policy controls including hard-delete '
     'workflows and export/delete on request (GDPR); a DPA and security documentation page; and, as '
     'the trust milestone, SOC 2 Type II certification on the roadmap. White-labelling — custom '
     'domain, custom branding, removal of platform marks — completes the picture and is a proven '
     'up-sell at the top tier. None of this is glamorous, and all of it is what the Enterprise plan '
     'is actually for.')

h2(story, '8.4 Collaboration')
body(story, 'Last, close the teamwork gap: agent co-editing with change history (the draft/publish '
     'lifecycle already provides the skeleton), inline comments on agents and prompt versions, and an '
     'activity feed per organisation so members see what colleagues shipped, asked, or flagged. '
     'Multi-person workflows are what make the platform sticky inside an organisation — the moment '
     'a team runs its weekly "review flagged answers" ritual inside the product, churn risk drops '
     'dramatically.')

# =============================================================
# Chapter 9 — Prioritized Roadmap & Benefits
# =============================================================
h1(story, '9. Prioritized Roadmap & Benefits')
body(story, 'The roadmap sequences everything in this report into three independently shippable phases. '
     'Sequencing follows two rules: measurement before capability (you cannot sell what you cannot '
     'count), and trust before reach (citations and feedback before channels and white-label). Effort '
     'scores are relative to a small full-stack team; impact scores reflect expected influence on '
     'adoption, retention, and revenue.')
chart(story, f'{ASSETS}/chart_roadmap.png',
      'Figure 2. Top initiatives positioned by expected impact and implementation effort, coloured by phase.',
      max_h=310)

story.extend(make_table(
    ['Phase', 'Initiative', 'Effort', 'Impact', 'Primary benefit'],
    [
        ['1 (0–1 mo)', 'Usage-event pipeline; fix requests-today counter', 'M', 'High',
         'Working meters enable quota enforcement and upsell'],
        ['1 (0–1 mo)', 'Server-side quota + feature enforcement per plan', 'M', 'High',
         'No bypass; plan limits finally bite'],
        ['1 (0–1 mo)', 'Audit logging of prompts and answers (admin + org views)', 'M', 'High',
         'Unblocks procurement; shows user questions in org dashboard'],
        ['1 (0–1 mo)', 'KB upload stabilisation', 'S', 'High',
         'Trust in the core ingest path'],
        ['1 (0–1 mo)', 'Streaming responses + stop / regenerate / copy', 'M', 'High',
         'Perceived latency drops from seconds to instant'],
        ['2 (1–3 mo)', 'Inline citations + sources panel', 'M', 'Very high',
         'Answer trust; verification against sources'],
        ['2 (1–3 mo)', 'Thumbs feedback + conversation analytics', 'M', 'High',
         'Quality loop; ROI dashboards per organisation'],
        ['2 (1–3 mo)', 'Hybrid retrieval + reranking', 'L', 'Very high',
         'Measurable answer-quality lift'],
        ['2 (1–3 mo)', 'Abstention policy + no-answer analytics', 'S', 'High',
         'Honest failures; content-gap backlog'],
        ['2 (1–3 mo)', 'Retrieval playground + chunk inspection', 'M', 'Medium',
         'KB owners self-serve quality'],
        ['2 (1–3 mo)', 'Voice output (TTS) with per-agent voices', 'M', 'Medium',
         'Completes the voice loop'],
        ['2 (1–3 mo)', 'Model catalogue fix + re-index migration workflow', 'M', 'High',
         'Safe model changes; removes embedding defect'],
        ['3 (3–6 mo)', 'Website widget with lead capture', 'L', 'Very high',
         'Agents reach customers on customer sites'],
        ['3 (3–6 mo)', 'Tools / function calling + MCP support', 'L', 'High',
         'Agents act, not just answer'],
        ['3 (3–6 mo)', 'Human handoff + escalation rules', 'M', 'High',
         'Support automation becomes deployable'],
        ['3 (3–6 mo)', 'Notion + Google Drive connectors; web crawling + re-sync', 'L', 'High',
         'Living knowledge bases; connector upsell tier'],
        ['3 (3–6 mo)', 'Evaluation harness (golden sets, RAGAS metrics, prompt A/B)', 'M', 'High',
         'Evidence-based prompt and model changes'],
        ['3 (3–6 mo)', 'Public API + webhooks + RBAC depth', 'L', 'High',
         'Platform becomes infrastructure'],
        ['3 (3–6 mo)', 'White-label + compliance pack (retention, DPA, SOC 2 path)', 'M', 'High',
         'Enterprise tier becomes sellable'],
    ],
    [0.115, 0.335, 0.075, 0.10, 0.375],
    caption='Table 2. Three-phase roadmap. Effort: S = small, M = medium, L = large.',
    align_center_cols={0, 2, 3},
))

h2(story, '9.1 Why this order maximises benefit')
body(story, 'Phase 1 costs roughly one engineering month and converts the platform from unverifiable '
     'to verifiable: meters that count, quotas that bite, an audit trail that exists, and a chat '
     'surface that feels instant. Phase 2 spends the next two months converting quality into visible '
     'trust — cited answers, a working feedback loop, materially better retrieval — which is the '
     'combination that moves conversion metrics in every comparable product is history. Phase 3 '
     'then expands reach (widget, channels, connectors, API) from a position of strength: agents '
     'that are already trusted, measured, and enforced. Reversing the order — widget first, '
     'measurement later — is the classic failure mode, because it pours acquisition traffic into a '
     'product whose quality and cost cannot be seen or steered.')
stat_row(story, [
    ('Phase 1', '~1 month · meters, audit, quotas, streaming'),
    ('Phase 2', '~2 months · citations, analytics, retrieval quality'),
    ('Phase 3', '~3 months · widget, tools, connectors, enterprise'),
])
body(story, 'Benefit summary, in business terms: the trust layer (citations, abstention, feedback) '
     'raises answer credibility and trial-to-paid conversion; the measurement layer (meters, audit, '
     'cost telemetry) raises enterprise win-rate and gross margin visibility; the quality layer '
     '(hybrid retrieval, reranking, evaluation) raises answer usefulness and retention; and the '
     'distribution layer (widget, channels, connectors, API) raises reachable users per customer '
     'without proportional acquisition spend. Each phase compounds the previous one, and no phase '
     'depends on unshipped work from a later one.')

# =============================================================
# Chapter 10 — References & Further Reading
# =============================================================
h1(story, '10. References & Further Reading')
body(story, 'The recommendations in this report are grounded in the following current sources, '
     'consulted during the analysis. They are grouped by topic and correspond to the chapters above; '
     'URLs are provided so the team can go to the primary material directly.')

refs = [
    'RAG best practices (chunking, hybrid search, reranking): Stack AI, "Retrieval-Augmented '
    'Generation (RAG) Best Practices", www.stackai.com; CodeWheel, "RAG Best Practices: Chunking, '
    'Hybrid Search, Reranking", codewheel.ai; towardsdatascience.com, "Hybrid Search and Re-Ranking '
    'in Production RAG".',
    'Enterprise RAG guidance: Synvestable, "Enterprise RAG Guide 2026", www.synvestable.com; '
    'iNexture, "Advanced RAG: Hybrid Search, Modern Pipelines"; Orkes, "Best Practices for '
    'Production-Scale RAG Systems", orkes.io.',
    'Evaluation and observability: LangChain, "Evaluating RAG pipelines with Ragas + LangSmith", '
    'www.langchain.com; RAGAS metrics reference, docs.ragas.io; Langfuse, "Evaluation of RAG '
    'pipelines with Ragas", langfuse.com; Confident AI, "RAG Evaluation Metrics: Answer Relevancy".',
    'Hallucination prevention and guardrails: Contextual AI, "Why Does Enterprise AI Hallucinate? '
    'Causes, Solutions and Prevention", contextual.ai; Guardrails AI, "Reducing Hallucinations with '
    'Provenance Guardrails", guardrailsai.com; NVIDIA Developer, "Use Guardrails to Prevent '
    'Hallucinations in Generative AI Applications".',
    'Competitor feature sets: Botpress, "Chatbase Review: Features, Pros, Cons and Alternatives", '
    'botpress.com; OpenAssistantGPT feature comparison, www.openassistantgpt.io; Choosely.ai, '
    '"Chatbase vs Botpress"; BuiltS, "Best AI Chatbot Builders: Tidio vs Chatbase vs Botpress".',
    'ChatGPT Enterprise controls: OpenAI, "New compliance and administrative tools for ChatGPT '
    'Enterprise", openai.com; Harmonic Security, "Securing ChatGPT Enterprise Guide"; Reco AI, '
    '"ChatGPT Enterprise Security: Risks and Best Practices".',
    'Agents, tools and MCP: Anthropic, "How we built our multi-agent research system", '
    'www.anthropic.com; Credal, "The Complete Guide to Multi-Agent Platforms", credal.ai; '
    'TrueFoundry, "Multi-Agent System with MCP: A Complete Guide"; OneReach, "MCP and Multi-Agent '
    'AI: Building Collaborative Intelligence".',
    'Prompt management: Braintrust, "What is prompt versioning?"; LaunchDarkly, "Prompt Versioning '
    'and Management Guide"; Maxim AI, "How to Perform A/B Testing with Prompts"; MLflow, "Top LLM '
    'Prompt Versioning Platforms".',
    'Knowledge base ingestion: AWS, "Turning data into a knowledge base — Amazon Bedrock Knowledge '
    'Bases", docs.aws.amazon.com; AWS Builder, "How Amazon Bedrock Managed Knowledge Base works".',
    'Voice AI: Speechmatics, "Best TTS APIs: ElevenLabs, Google, AWS and others", '
    'www.speechmatics.com; AssemblyAI, "Best real-time speech-to-text apps", assemblyai.com; '
    'GetStream, "Top Real-Time Speech-to-Speech APIs and Libraries".',
    'Analytics and KPIs: OMQ, "Chatbot KPIs: The Most Important Metrics", omq.ai; Rasa, "AI Agent '
    'Performance Metrics: Contact Center KPIs"; Nicereply, "Measure satisfaction with Thumbs '
    'up/down CSAT survey".',
    'Handoff and escalation: Robofy, "AI to Human Handoff for Chatbots", www.robofy.io; Salted, '
    '"AI-to-human handoff: escalation rules, context and metrics", salted.cx; Alhena, "AI-to-Human '
    'Handoff in Ecommerce: Context Transfer".',
    'Usage metering and billing: Lago, "AI Billing is (mostly) token plumbing", getlago.com; '
    'Flexprice, "How Do You Meter LLM Token Usage for Billing?"; Metacto, "LLM Cost Attribution: '
    'Per-User and Per-Tenant Tracking".',
]
for r in refs:
    story.append(Paragraph(r, S['ref']))

# ---------------- Build ----------------
doc = TocDocTemplate(
    OUT_BODY, pagesize=A4,
    leftMargin=MARGIN, rightMargin=MARGIN,
    topMargin=MARGIN + 0.12 * inch, bottomMargin=MARGIN,
    title=DOC_TITLE, author='Z.ai', creator='Z.ai',
    subject='Feature gap analysis and AI enhancement roadmap for the Clara AI platform')
doc.multiBuild(story, onFirstPage=on_page, onLaterPages=on_page)
print('body PDF written:', OUT_BODY)
