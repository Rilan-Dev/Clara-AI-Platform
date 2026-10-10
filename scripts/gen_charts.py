#!/usr/bin/env python3
"""Charts for Clara AI Platform Gap Analysis report.
Crystal Blue palette (Template 07 body colors). English labels.
Follows typesetting/charts.md: no top/right spines, dashed grid 20% opacity,
horizontal bars for long labels, value labels, no legend border.
"""
import matplotlib
matplotlib.use('Agg')
import matplotlib.font_manager as fm
fm.fontManager.addfont('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

# Crystal Blue palette
ACCENT   = '#2d7ab3'
ACCENT2  = '#4da8da'
HEADER   = '#1a4a7a'
MUTED    = '#5a7a96'
TEXTP    = '#142840'
BORDER   = '#c0d0e2'

OUT = '/home/z/my-project/scripts/assets'
import os
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------
# Chart 1: Missing AI features identified, grouped by capability
# ---------------------------------------------------------------
categories = [
    'Enterprise controls\n(audit, RBAC, compliance)',
    'Integrations & channels\n(widget, Slack, API)',
    'Voice & multimodal\n(TTS, image input)',
    'Feedback & evaluation\n(thumbs, RAGAS, A/B)',
    'Agent capabilities\n(tools, MCP, handoff)',
    'Retrieval quality\n(hybrid, reranking)',
    'Chat UX & streaming\n(regenerate, export)',
    'Answer trust & citations\n(sources, confidence)',
]
counts = [7, 8, 6, 7, 8, 6, 7, 6]

fig, ax = plt.subplots(figsize=(8.6, 4.4), constrained_layout=True)
bars = ax.barh(categories, counts, color=ACCENT, height=0.62, edgecolor='none', zorder=3)
# subtle gradient effect via alpha on alternate bars
for i, b in enumerate(bars):
    b.set_alpha(0.92 if i % 2 == 0 else 0.78)

for b, c in zip(bars, counts):
    ax.text(b.get_width() + 0.12, b.get_y() + b.get_height() / 2, str(c),
            va='center', ha='left', fontsize=10, color=TEXTP, fontweight='bold')

ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['left'].set_color(BORDER)
ax.spines['bottom'].set_color(BORDER)
ax.tick_params(axis='both', labelsize=9.5, colors=TEXTP, length=0)
ax.grid(axis='x', linestyle='--', linewidth=0.5, alpha=0.2, color=MUTED, zorder=0)
ax.set_axisbelow(True)
ax.set_xlim(0, 9.6)
ax.set_xlabel('Missing features identified (count)', fontsize=10, color=TEXTP)
fig.savefig(f'{OUT}/chart_gaps.png', dpi=200, facecolor='white')
plt.close(fig)

# ---------------------------------------------------------------
# Chart 2: Roadmap phases - impact vs effort (top initiatives)
# ---------------------------------------------------------------
initiatives = [
    'Citations & source attribution',
    'Streaming responses',
    'Quota enforcement + audit logs',
    'Hybrid search + reranking',
    'Feedback & conversation analytics',
    'Retrieval playground',
    'Voice output (TTS)',
    'Tool calling & MCP',
    'Website widget embed',
    'Evaluation suite (RAGAS)',
]
impact = [9.5, 8.5, 9.0, 9.0, 8.0, 7.0, 6.5, 8.5, 8.0, 7.0]
effort  = [4.0, 3.5, 5.0, 6.5, 4.5, 3.0, 5.5, 8.0, 6.0, 7.0]
phase   = [1, 1, 1, 2, 2, 2, 2, 3, 3, 3]
colors  = {1: ACCENT, 2: ACCENT2, 3: HEADER}

fig, ax = plt.subplots(figsize=(8.6, 5.2), constrained_layout=True)
for p in (1, 2, 3):
    xs = [e for e, ph in zip(effort, phase) if ph == p]
    ys = [i for i, ph in zip(impact, phase) if ph == p]
    ax.scatter(xs, ys, s=150, color=colors[p], alpha=0.9, edgecolors='white',
               linewidths=1.2, zorder=3,
               label=f'Phase {p}')

# label each point with slight offsets to avoid overlap
offsets = {
    'Citations & source attribution': (0.18, 0.12),
    'Streaming responses': (0.18, 0.10),
    'Quota enforcement + audit logs': (0.18, -0.28),
    'Hybrid search + reranking': (0.18, 0.10),
    'Feedback & conversation analytics': (0.18, 0.12),
    'Retrieval playground': (0.18, -0.30),
    'Voice output (TTS)': (0.18, 0.10),
    'Tool calling & MCP': (0.18, 0.10),
    'Website widget embed': (0.18, 0.12),
    'Evaluation suite (RAGAS)': (0.18, -0.32),
}
for name, e, i in zip(initiatives, effort, impact):
    dx, dy = offsets[name]
    ax.text(e + dx, i + dy, name, fontsize=8.6, color=TEXTP, ha='left', va='center')

ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['left'].set_color(BORDER)
ax.spines['bottom'].set_color(BORDER)
ax.tick_params(axis='both', labelsize=10, colors=TEXTP, length=0)
ax.grid(linestyle='--', linewidth=0.5, alpha=0.2, color=MUTED, zorder=0)
ax.set_axisbelow(True)
ax.set_xlim(2, 10.4)
ax.set_ylim(5.6, 10.4)
ax.set_xlabel('Implementation effort (relative scale)', fontsize=10.5, color=TEXTP)
ax.set_ylabel('Expected business impact (relative scale)', fontsize=10.5, color=TEXTP)
leg = ax.legend(loc='lower right', frameon=False, fontsize=10, handletextpad=0.4)
for t in leg.get_texts():
    t.set_color(TEXTP)
fig.savefig(f'{OUT}/chart_roadmap.png', dpi=200, facecolor='white')
plt.close(fig)

print('charts saved:', os.listdir(OUT))
