# Screenshot Reference Registry (R1–R14)

**Status: ORIGINAL BINARIES NOT RECOVERABLE** — the 14 screenshots below were pasted into chat on 2026-09-23 with the captions/annotations shown. The chat gateway did not persist their image binaries to workspace storage (verified by exhaustive filesystem search + vision-analysis of every recoverable paste on 2026-09-24). The annotations below — written from the product owner's own captions — are therefore the authoritative visual reference until the owner re-attaches the PNGs.

> **To complete this bundle:** paste the 14 PNGs (or drop them next to this file) keeping the EXACT filenames below. They are referenced by name inside `../CLARA-Voice-Agent-Master-Prompt.md` (§2 and Appendix A).

---

## Group 1 — Voice / Preview / Published experience (round-1 references)

| Ref | Filename | Owner's caption | What it shows |
|---|---|---|---|
| R1 | `pasted_image_1790169728678.png` | "While enter into Preview" | Entry state of the preview page: how the chat window presents itself on first load (greeting, hero, where voice entry is offered, overall layout proportions) |
| R2 | `pasted_image_1790169687747.png` | "while chatting" | Active chat state: message bubbles, composer, citation presentation, general richness |
| R3 | `pasted_image_1790169802320.png` | "While starting with Realtime Voice Agent Conversations" | Voice session start state: orb placement, status pill, controls (mute / interrupt / end), transcript |
| R4 | `pasted_image_1790170695981.png` | "For real-time voice agent" — published page reference | Public realtime voice experience: minimal chrome, centered voice presence, public-friendly copy |
| R5 | `pasted_image_1790170491254.png` | "For chat: simple and crisp in richness" — published page reference | Public chat experience: clean and crisp yet rich; the bar for "simple, crisp, rich, more perfect" |

## Group 2 — Admin UI/UX structure (round-2 references)

| Ref | Filename | Shows |
|---|---|---|
| R6 | `pasted_image_1790178841516.png` | **Anti-pattern to eliminate:** agent section menus rendered at the TOP of the main content area — the seven section menus must NOT live here |
| R7 | `pasted_image_1790179059322.png` | **Restore target:** sidebar with the agent section expanded — the seven menus return under the "Agents >" group header |
| R8 | `pasted_image_1790179416607.png` | Idle/plain sidebar with NO agent selected (no agent submenu, clean nav) |
| R9 | `pasted_image_1790179235085.png` | Selected-state sidebar: identity card + the 7 section tabs with icons |
| R10 | `pasted_image_1790179688782.png` | Topbar area next to the profile avatar — destination for the version cluster; username removed from the navbar; avatar-only profile trigger |
| R11 | `pasted_image_1790179931543.png` | Publish screen — published URL controls live here and in the "Published vN" popover |
| R12 | `pasted_image_1790180026215.png` | Versioned drafts presentation — version chips, saved-age, pending-changes entry |
| R13 | `pasted_image_1790180748312.png` | Draft diff view — the "view pending changes" experience: draft vs current version |
| R14 | `pasted_image_1790180948723.png` | Profile popup — usage limits, plan, meters |

---

## Screenshot → Phase quick map (from master prompt Appendix A)

| Ref | Filename | Phase(s) |
|---|---|---|
| R1 | `pasted_image_1790169728678.png` | 4, 6 |
| R2 | `pasted_image_1790169687747.png` | 4, 6 |
| R3 | `pasted_image_1790169802320.png` | 4, 5 |
| R4 | `pasted_image_1790170695981.png` | 5, 8 |
| R5 | `pasted_image_1790170491254.png` | 8 |
| R6 | `pasted_image_1790178841516.png` | 9 (anti-pattern) |
| R7 | `pasted_image_1790179059322.png` | 9 |
| R8 | `pasted_image_1790179416607.png` | 9 |
| R9 | `pasted_image_1790179235085.png` | 9 |
| R10 | `pasted_image_1790179688782.png` | 9 |
| R11 | `pasted_image_1790179931543.png` | 9 |
| R12 | `pasted_image_1790180026215.png` | 9 |
| R13 | `pasted_image_1790180748312.png` | 9 |
| R14 | `pasted_image_1790180948723.png` | 9 |

---

## Related design references actually included in this bundle

The `../design-references/` folder contains the 8 screenshots that DID survive in workspace storage. They are **not** R1–R14, but they are the ElevenLabs dashboard references that inspired the Clara agent-workspace structure (Overview / Configure / Knowledge Base / Tools / Branches grouping, version chip in sidebar, branches + history layout) plus one Clara providers dashboard. See `../design-references/DESIGN-REFERENCES.md` for the annotated manifest.
