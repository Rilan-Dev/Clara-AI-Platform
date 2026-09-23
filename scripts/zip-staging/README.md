# Clara Voice-Agent Master Prompt — Bundle Contents

**Bundle:** `clara-voice-agent-master-prompt.zip` · v2 (2026-09-24, adds design-references)

## What is in this bundle

| File | Purpose |
|---|---|
| `CLARA-Voice-Agent-Master-Prompt.md` | The complete, self-contained implementation prompt: objectives (O1–O7), the annotated 14-screenshot reference registry (§2), non-negotiable product rules (§3), the verified implementation baseline incl. file inventory & live checks (§4), the phase-by-phase plan Phase 0–11 (§5), the voice-orb animation spec (§6), the security & isolation model (§7), the mandatory git workflow (§8), quality gates (§9) and the final acceptance checklist (§10) |
| `references/SCREENSHOT-REGISTRY.md` | **NEW** — the full self-contained R1–R14 registry: owner captions, visual descriptions, phase map. Usable as the visual spec even without the image binaries |
| `references/PUT-SCREENSHOTS-HERE.txt` | The exact filenames to use when re-attaching the 14 originals |
| `design-references/` | **NEW** — the 8 screenshots that DID survive in workspace storage: 7 ElevenLabs Conversational-AI dashboard screens (the design inspiration behind Clara's agent-workspace structure) + 1 Clara Providers dashboard. Annotated in `design-references/DESIGN-REFERENCES.md` |
| `README.md` | This file |

## About the 14 pasted reference screenshots (important)

The prompt references **14 screenshots** (R1–R14) by the exact filenames under which they were pasted in chat on 2026-09-23. Exhaustive searches of workspace storage on 2026-09-24 (full filesystem sweep + vision-analysis of every recoverable paste) confirmed that the chat gateway **did not persist those image binaries**. The only recoverable pastes were older, unrelated ones — which are now included under `design-references/` for completeness.

The prompt and `references/SCREENSHOT-REGISTRY.md` therefore carry the product owner's own annotations for each missing file, which are the authoritative reference.

### Reference registry (re-attach these images to complete the bundle)

**Voice / Preview / Published experience:**

| Filename | Annotation |
|---|---|
| `pasted_image_1790169728678.png` | While enter into Preview |
| `pasted_image_1790169687747.png` | While chatting |
| `pasted_image_1790169802320.png` | While starting with Realtime Voice Agent Conversations |
| `pasted_image_1790170695981.png` | Published page — real-time voice agent |
| `pasted_image_1790170491254.png` | Published page — chat, "simple and crisp in richness" |

**Admin UI/UX structure (round-2 feedback):**

| Filename | Shows |
|---|---|
| `pasted_image_1790178841516.png` | Wrong state — menus at top of main content (anti-pattern) |
| `pasted_image_1790179059322.png` | Sidebar target — agent section under "Agents >" |
| `pasted_image_1790179416607.png` | Sidebar — no agent selected (plain) |
| `pasted_image_1790179235085.png` | Sidebar — agent selected (7 section tabs) |
| `pasted_image_1790179688782.png` | Topbar next to profile avatar (version cluster destination) |
| `pasted_image_1790179931543.png` | Publish UI reference |
| `pasted_image_1790180026215.png` | Versioned drafts reference |
| `pasted_image_1790180748312.png` | Draft diff view reference |
| `pasted_image_1790180948723.png` | Profile popup with usage limits |

### How to re-attach the images

1. Keep the filenames exactly as listed above (they are referenced by name inside the prompt, §2 and Appendix A).
2. Drop the PNGs into `references/` next to `SCREENSHOT-REGISTRY.md` (or re-paste them in chat alongside the prompt).
3. Re-run the prompt — the executing agent can then compare the live UI against the references visually.

## Implementation status at bundle time

All phases in the prompt are **already implemented and deployed** (commits `e4b1c57` and `12a6a25` on `Vite-Converted`; PRs #149/#150/#151 merged, PR #152 → Vercel-Prod open for review). Use §10 as the verification checklist against the live preview, or reuse the whole prompt on a fresh environment.
