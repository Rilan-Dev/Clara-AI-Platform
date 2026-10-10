#!/usr/bin/env python3
"""Charts for the Clara AI Implementation Plan (Crystal Blue family).
Chart 1: Phase timeline (Gantt-style horizontal bars, 26 weeks).
Chart 2: Cumulative gaps closed by phase (step area).
Rules applied: constrained_layout only (no tight_layout), top/right spines
removed, dashed grid 20% opacity, legend outside plot area, same-family blues.
"""
import matplotlib.font_manager as fm
fm.fontManager.addfont('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

plt.rcParams['font.sans-serif'] = ['DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

# Crystal Blue family (same hue ~210deg)
C_P0 = '#a8cce8'   # light
C_P1 = '#4da8da'   # bright
C_P2 = '#2d7ab3'   # mid
C_P3 = '#1a4a7a'   # deep
TXT  = '#142840'
MUT  = '#5a7a96'
GRID = '#c0d0e2'

OUT = '/home/z/my-project/scripts/assets'

# ---------------------------------------------------------------
# Chart 1 — Phase timeline Gantt
# ---------------------------------------------------------------
# (label, start_week, end_week, phase)  weeks are 1-based inclusive
tasks = [
    ('CI, staging & release baseline',        1,  2,  0),
    ('KB upload stabilisation',               1,  2,  0),
    ('Mobile responsiveness sweep',           1,  2,  0),
    ('Model catalogue correction',            1,  2,  0),
    ('Usage-event pipeline (meters spine)',   1,  3,  1),
    ('Server-side quota enforcement',         2,  4,  1),
    ('Audit logging (admin + org views)',     2,  4,  1),
    ('Streaming responses & chat controls',   2,  4,  1),
    ('Org dashboard analytics parity',        3,  4,  1),
    ('Hybrid retrieval + reranking',          5,  7,  2),
    ('Inline citations & sources panel',      6,  8,  2),
    ('Conversation memory & follow-ups',      8,  9,  2),
    ('Abstention policy & feedback loop',     9,  10, 2),
    ('Retrieval playground & chunk tools',    10, 11, 2),
    ('Voice output (TTS) & re-index migration', 11, 12, 2),
    ('Embeddable website widget',             13, 15, 3),
    ('Tool calling & MCP',                    14, 17, 3),
    ('Live knowledge connectors',             16, 19, 3),
    ('Evaluation harness (golden sets)',      18, 20, 3),
    ('Enterprise pack (SSO, SCIM, white-label)', 19, 24, 3),
    ('Collaboration & activity feed',         22, 25, 3),
]
phase_color = {0: C_P0, 1: C_P1, 2: C_P2, 3: C_P3}

fig, ax = plt.subplots(figsize=(8.8, 6.2), constrained_layout=True)

ypos = list(range(len(tasks)))[::-1]  # first task on top
for (label, s, e, ph), y in zip(tasks, ypos):
    ax.barh(y, e - s + 1, left=s - 0.5, height=0.62,
            color=phase_color[ph], edgecolor='none', zorder=3)

ax.set_yticks(ypos)
ax.set_yticklabels([t[0] for t in tasks], fontsize=9, color=TXT)
ax.set_xlim(0.5, 26.5)
ax.set_ylim(-0.8, len(tasks) - 0.2)
ax.set_xticks(list(range(1, 27, 2)))
ax.set_xticklabels([f'W{w}' for w in range(1, 27, 2)], fontsize=8.5, color=MUT)

# Month markers
for mw, mlabel in [(4.5, 'M1'), (8.5, 'M2'), (13.5, 'M3'),
                   (17.5, 'M4'), (21.5, 'M5'), (26.0, 'M6')]:
    ax.axvline(mw, color=GRID, linewidth=0.8, linestyle='--', alpha=0.6, zorder=1)
    ax.text(mw, len(tasks) - 0.55, mlabel, fontsize=7.5, color=MUT,
            ha='right', va='bottom')

# Phase dividers
for w in (2.5, 4.5, 12.5):
    ax.axvline(w, color=MUT, linewidth=1.0, linestyle=':', alpha=0.8, zorder=2)
phase_labels = [('Phase 0', 1.5), ('Phase 1', 3.5), ('Phase 2', 8.5), ('Phase 3', 19.5)]
for name, x in phase_labels:
    ax.text(x, -0.55, name, fontsize=9, color=TXT, ha='center', va='top',
            fontweight='bold')

for spine in ('top', 'right', 'left'):
    ax.spines[spine].set_visible(False)
ax.spines['bottom'].set_color(GRID)
ax.tick_params(axis='both', length=0)
ax.grid(axis='x', linestyle='--', linewidth=0.5, alpha=0.2, color=TXT, zorder=0)

# Legend outside (above), no frame
handles = [mpatches.Patch(color=phase_color[i], label=lbl) for i, lbl in
           enumerate(['Phase 0 · Stabilisation (W1-2)',
                      'Phase 1 · Metering & Enforcement (W1-4)',
                      'Phase 2 · Answer Quality & Trust (W5-12)',
                      'Phase 3 · Distribution & Enterprise (W13-26)'])]
ax.legend(handles=handles, loc='lower center', bbox_to_anchor=(0.5, 1.01),
          ncol=2, frameon=False, fontsize=8.5, handlelength=1.2,
          handleheight=0.9, columnspacing=1.6)

fig.savefig(f'{OUT}/chart_timeline.png', dpi=200, facecolor='white')
plt.close(fig)

# ---------------------------------------------------------------
# Chart 2 — Cumulative gaps closed by phase (step area)
# ---------------------------------------------------------------
import numpy as np
weeks = np.array([0, 2, 4, 12, 26])
closed = np.array([0, 8, 20, 42, 60])   # cumulative items closed

fig2, ax2 = plt2 = plt.subplots(figsize=(8.8, 3.6), constrained_layout=True)

# step plot
ax2.step(weeks, closed, where='post', color=C_P2, linewidth=2.5, zorder=4)
ax2.fill_between(weeks, closed, step='post', color=C_P1, alpha=0.18, zorder=2)

# markers + labels on phase-end points only (first/last/key rule)
for x, y in zip(weeks[1:], closed[1:]):
    ax2.plot(x, y, 'o', color=C_P3, markersize=5, zorder=5)
    ax2.annotate(f'{y}', (x, y), textcoords='offset points', xytext=(0, 8),
                 ha='center', fontsize=9, color=TXT, fontweight='bold')

# phase annotations
ann = [(1.0, 'Phase 0\ndefect triage', 8), (3.0, 'Phase 1\nmeters · audit · quotas', 20),
       (8.0, 'Phase 2\nretrieval · citations · feedback', 42),
       (19.0, 'Phase 3\nwidget · tools · enterprise', 60)]
for x, lbl, y in ann:
    ax2.annotate(lbl, (x, y), textcoords='offset points', xytext=(0, 26),
                 ha='center', fontsize=8, color=MUT)

ax2.set_xlim(0, 26)
ax2.set_ylim(0, 78)
ax2.set_xticks(list(range(0, 27, 4)))
ax2.set_xticklabels([f'W{w}' for w in range(0, 27, 4)], fontsize=8.5, color=MUT)
ax2.set_ylabel('Gaps closed (cumulative)', fontsize=9, color=TXT)
ax2.tick_params(axis='both', length=0, labelsize=8.5, colors=MUT)

for w in (2, 4, 12):
    ax2.axvline(w, color=GRID, linewidth=0.8, linestyle='--', alpha=0.6, zorder=1)

for spine in ('top', 'right'):
    ax2.spines[spine].set_visible(False)
ax2.spines['left'].set_color(GRID)
ax2.spines['bottom'].set_color(GRID)
ax2.grid(axis='y', linestyle='--', linewidth=0.5, alpha=0.2, color=TXT, zorder=0)

fig2.savefig(f'{OUT}/chart_closure.png', dpi=200, facecolor='white')
plt.close(fig2)

print('charts done')
