# Clara Admin UI/UX Redesign — Bundle Contents

**Bundle:** `clara-admin-ui-redesign-prompt.zip` · created 2026-09-24
**Companion bundle:** `clara-voice-agent-master-prompt.zip` (the voice-chat / preview / published-page task)

## What is in this bundle

| File | Purpose |
|---|---|
| `CLARA-Admin-UI-Redesign-Prompt.md` | The complete, self-contained master prompt for this task: objectives O1–O7, the annotated S1–S9 screenshot registry, non-negotiable rules (redesign, don't add), verified baseline, phase plan 0–7, acceptance checklist, screenshot→phase map, and the delivered implementation inventory (commit `12a6a25`) |
| `references/SCREENSHOT-REGISTRY.md` | Self-contained S1–S9 registry: the owner's verbatim captions + the requested end-state (Agents > structure, version cluster list) + phase map |
| `references/PUT-SCREENSHOTS-HERE.txt` | The exact filenames to use when re-attaching the 9 originals |
| `design-references/` | The 8 screenshots that DID survive in storage (7 ElevenLabs Conversational-AI dashboard screens + 1 Clara Providers dashboard). The ElevenLabs grouped-sidebar and Branches/History screens are the closest structural analogs to S2/S4 and S7. Manifest: `design-references/DESIGN-REFERENCES.md` |
| `README.md` | This file |

## About the 9 reference screenshots (important)

The prompt references **9 screenshots** (S1–S9) by the exact filenames under which they were pasted in chat on 2026-09-23. Verified **twice** on 2026-09-24 (exhaustive filesystem sweep of all upload/temp/sync dirs + vision-analysis of every recoverable paste): the chat gateway **did not persist those image binaries**. The owner's captions — captured verbatim in the prompt §2 and in `references/SCREENSHOT-REGISTRY.md` — are the authoritative reference.

### The 9 filenames (drop the PNGs into `references/` to complete the bundle)

```
pasted_image_1790178841516.png   S1: anti-pattern — menus at top of main content
pasted_image_1790179059322.png   S2: restore target — sidebar under "Agents >"
pasted_image_1790179416607.png   S3: sidebar, no agent selected (plain)
pasted_image_1790179235085.png   S4: sidebar, agent selected (7 tabs)
pasted_image_1790179688782.png   S5: topbar next to profile icon (version cluster)
pasted_image_1790179931543.png   S6: publish screen reference
pasted_image_1790180026215.png   S7: versioned drafts reference
pasted_image_1790180748312.png   S8: draft diff view
pasted_image_1790180948723.png   S9: profile popup (usage limits)
```

## Implementation status at bundle time

**Already implemented, reviewed and confirmed by the product owner** ("All changes are all ok perfect"):
- Commit `12a6a25` on `Vite-Converted` — 11 files, +1090/−339
- PR #151 → Vercel-Preview (merged)
- PR #152 → Vercel-Prod (open for final review)

Use the prompt's §6 acceptance checklist against the live app, or re-run the whole prompt on a fresh environment.
