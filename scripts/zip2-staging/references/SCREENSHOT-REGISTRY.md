# Screenshot Reference Registry (S1–S9) — Admin UI/UX Restructure

**Status: ORIGINAL BINARIES NOT RECOVERABLE** — the 9 screenshots below were pasted into chat on 2026-09-23. The chat gateway did not persist their image binaries to workspace storage (verified twice on 2026-09-24: exhaustive filesystem sweep of every upload dir / temp dir / sync dir + vision-analysis of every recoverable paste on disk). The owner's captions — verbatim from the request — are the authoritative reference until the PNGs are re-attached.

> **To complete this bundle:** re-paste the 9 PNGs as real image attachments in chat, or drop them next to this file keeping the EXACT filenames below. They are referenced by name inside `../CLARA-Admin-UI-Redesign-Prompt.md` (§2 and Appendix A).

---

## The requested end-state, in the owner's own words

```
Agents >
- Overview
- Main
- FAQ
- Knowledge
- Tools
- Branches
- Publish
```

> "We need to redesign the existing UI/UX, not introduce anything new."

Version cluster to move into the topbar near the profile icon ("MR MOHAMMED RILAN. J"), username removed from the navbar:

```
[ Main | v8 | Draft changes | Published v8 | Draft saved 18 min ago | Preview | Publish update ]
```

---

## Registry

| Ref | Filename | Owner's caption | What it shows |
|---|---|---|---|
| S1 | `pasted_image_1790178841516.png` | "This is what you changed" — **the anti-pattern** | Agent section menus rendered at the TOP of the main content area. The wrong state to eliminate. |
| S2 | `pasted_image_1790179059322.png` | "But I want to restore these menus into sidebar before exists… move the above menus here below under 'Agents >'" | Sidebar with the agent section expanded — the restore target: `Agents >` followed by the 7 section menus. |
| S3 | `pasted_image_1790179416607.png` | "When not selecting an agent, the sidebar looks something like this" | Idle/plain sidebar, no agent selected — no agent submenu, clean nav. |
| S4 | `pasted_image_1790179235085.png` | "For example, selected agent sidebar view" | Selected-state sidebar: identity card + the 7 section tabs with icons. |
| S5 | `pasted_image_1790179688782.png` | "move these things into the top of the navbar near the profile icon 'MR MOHAMMED RILAN. J' and remove the username from the navbar" | Topbar area next to the profile avatar — destination for the version cluster. |
| S6 | `pasted_image_1790179931543.png` | "Reference to update for publishing" | Publish screen — publishing UX reference; published URL controls. |
| S7 | `pasted_image_1790180026215.png` | "for versioning drafts examples" | Versioned drafts presentation: version chips, saved-age, pending-changes entry. |
| S8 | `pasted_image_1790180748312.png` | "to click 'view pending changes' … we show the draft diff view changes" | Draft diff view: draft vs current version. |
| S9 | `pasted_image_1790180948723.png` | "for the profile pop up we need like this: show usage limits etc…" | Profile popup: usage limits, plan, meters. |

## Screenshot → Phase map (from prompt Appendix A)

| Ref | Filename | Phase(s) |
|---|---|---|
| S1 | `pasted_image_1790178841516.png` | 2 (anti-pattern to remove) |
| S2 | `pasted_image_1790179059322.png` | 2 |
| S3 | `pasted_image_1790179416607.png` | 2 |
| S4 | `pasted_image_1790179235085.png` | 2 |
| S5 | `pasted_image_1790179688782.png` | 1, 2 |
| S6 | `pasted_image_1790179931543.png` | 4 |
| S7 | `pasted_image_1790180026215.png` | 1, 3 |
| S8 | `pasted_image_1790180748312.png` | 3 |
| S9 | `pasted_image_1790180948723.png` | 5 |

---

## Closest recovered visual analogs (included in `../design-references/`)

The 8 screenshots that DID survive in workspace storage are bundled alongside. Two of them are directly relevant as structural analogs:

- **`pasted_image_1789983409291.png` / `pasted_image_1789983448061.png`** — ElevenLabs "Support agent" sidebar with grouped navigation (Overview / Configure: Agent, Procedures, Workflow, Branches, Knowledge Base, Analysis, Tools, Guardrails, Settings / Monitor) **with a version chip** — the same grouped-section-under-an-agent pattern required for S2/S4 (`Agents >` + 7 tabs).
- **`pasted_image_1789991062571.png` / `pasted_image_1789991137182.png`** — ElevenLabs Branches table + Branch History panel — the versioned-drafts presentation analog for S7.
- **`pasted_image_1789991219077.png`** — ElevenLabs agent configuration screen (system prompt, voice, languages, LLM, first message) — context for where draft changes originate.

These are NOT the S1–S9 originals; full manifest in `../design-references/DESIGN-REFERENCES.md`.
