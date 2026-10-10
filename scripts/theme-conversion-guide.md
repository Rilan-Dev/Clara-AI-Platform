# Clara AI Platform — Light Theme Conversion Guide

**READ THIS FULLY BEFORE EDITING ANY FILE.**

## Context

The Clara AI Platform is migrating from a dark theme to a professional, modern LIGHT theme. The design tokens in `src/app/globals.css` `:root` are ALREADY converted (indigo #4F46E5 → violet #8B5CF6 on cool neutral #FCFCFD). The forced `dark` class has been REMOVED from `<html>` and the admin shell. **Your job is only to convert hardcoded dark Tailwind classes in your assigned .tsx files to semantic light tokens.**

## Design Language (target)

- **Primary**: indigo-600 `#4F46E5` (`primary` token)
- **Secondary**: violet-500 `#8B5CF6` (`secondary` token)
- **Background**: `#FCFCFD` cool neutral; **Surfaces/cards**: pure white `#FFFFFF`
- **Text**: near-black `#1B1B23` (foreground); secondary text: gray `text-muted-foreground`
- **Borders**: soft cool gray `border-border` (hsl 240 14% 90%)
- **Shadows**: soft layered (`shadow-sm`/`shadow-md`/`shadow-lg` utilities = `shadow-soft`/`shadow-medium`/`shadow-large` classes, or Tailwind's `shadow-sm` etc.)
- Active/selected states: `bg-primary/10 text-primary border-primary/20`
- Modern SaaS look: clean white cards on neutral bg, hairline borders, subtle indigo-tinted shadows

## THE MAPPING TABLE (apply consistently)

| Dark pattern (find) | Light replacement (use) |
|---|---|
| `bg-[#0a0a0f]`, `bg-[#0A0A0F]`, `bg-[#08081a]`, `bg-[#08080D]`, `bg-black` (page-level) | `bg-background` |
| `bg-[#0d0d1a]`, `bg-[#0D0D1A]`, `bg-[#111118]`, `bg-[#13131f]`, `bg-[#0d0d14]` (sidebar/panel) | `bg-card` (or `bg-surface` for inset areas) |
| `bg-white/[0.02]`–`bg-white/[0.06]` (subtle surface) | `bg-muted/50` or `bg-surface` |
| `bg-white/[0.04]`–`bg-white/[0.08]` (hover surface) | `bg-muted` / `hover:bg-muted` / `hover:bg-accent` |
| `bg-white/[0.03]`, `bg-white/[0.05]` (card surface on dark) | `bg-card` with `border border-border` |
| `text-white` (body/heading text) | `text-foreground` |
| `text-white/80`, `text-white/75`, `text-white/90` | `text-foreground/80` |
| `text-white/50`, `text-white/60`, `text-white/70` | `text-muted-foreground` |
| `text-white/25`, `text-white/30`, `text-white/35`, `text-white/40` | `text-muted-foreground/70` (or plain `text-muted-foreground` for /40) |
| `text-white/20` | `text-muted-foreground/50` |
| `hover:text-white`, `hover:text-white/80` | `hover:text-foreground` |
| `border-white/[0.04]`–`border-white/[0.10]`, `border-white/10` | `border-border` (structural) or `border-border/70` (subtle) |
| `border-white/[0.12]`+ (strong) | `border-border` |
| `divide-white/[0.06]` | `divide-border` |
| `text-indigo-300`, `text-indigo-400` (accents on dark) | `text-primary` |
| `text-indigo-200`, `text-indigo-200/90` | `text-primary` (or `text-foreground` if body-like) |
| `text-violet-300`, `text-violet-400` | `text-secondary` (rare) or `text-primary` |
| `bg-indigo-500/10`, `bg-indigo-600/15`, `bg-indigo-600/20` | `bg-primary/10` |
| `bg-indigo-500/15`, `bg-indigo-600/30` | `bg-primary/15` |
| `border-indigo-500/20`, `border-indigo-500/30` | `border-primary/20` |
| `bg-indigo-600`, `bg-indigo-500` (solid CTA) | `bg-primary` + `hover:bg-primary/90` + `text-primary-foreground` |
| `text-indigo-300 hover:text-indigo-200` links | `text-primary hover:text-primary/80` |
| `text-cyan-300`, `text-cyan-400` accents | `text-primary` (unify palette) unless semantically "info" → `text-sky-600` |
| `text-emerald-300`, `text-emerald-400` (success/live) | `text-emerald-600` |
| `bg-emerald-400`, `bg-emerald-500` (status dot) | `bg-emerald-500` (keep) |
| `text-rose-300`, `text-rose-400` (danger) | `text-destructive` |
| `hover:text-red-400`, `text-red-400` | `hover:text-destructive`, `text-destructive` |
| `hover:bg-red-500/10`, `hover:bg-rose-500/10` | `hover:bg-destructive/10` |
| `text-amber-300`, `text-amber-400`, `text-yellow-400` (warning) | `text-amber-600`, `text-amber-500` |
| `bg-amber-400`/`bg-yellow-400` status | `bg-amber-500` (keep) |
| `text-slate-400`, `text-gray-400`, `text-zinc-400` on dark | `text-muted-foreground` |
| `text-slate-300`, `text-gray-300` | `text-foreground/80` |
| inline `style={{ background: "rgba(10,10,15,…)" }}` etc. | remove → Tailwind classes (`bg-background/80 backdrop-blur-xl` for navbars) |
| inline `style={{ background: "rgba(255,255,255,0.04)" }}` | remove → `bg-muted` class |
| inline `style={{ color: "#fff" / "rgba(255,255,255,…" }}` | remove → text token class |
| `shadow-indigo-500/20`, `shadow-indigo-500/30` glows | keep but soften: `shadow-primary/20` |
| `placeholder:text-white/30` | `placeholder:text-muted-foreground/60` |
| `ring-indigo-400`, `focus:ring-indigo-…` | `ring-primary` / `focus-visible:ring-primary/40` |
| `backdrop-blur` on `bg-[#0d0d14]/90`-style headers | `bg-background/85 backdrop-blur-md` |
| `glass-premium`, `glass`, `glass-card` utilities | KEEP — already light-adapted in globals.css |
| `gradient-text`, `.text-glow`, `.glow` | KEEP — already light-adapted |
| `from-indigo-400 via-violet-400 to-cyan-400` (gradient TEXT) | `from-indigo-600 via-violet-600 to-cyan-600` |
| `from-indigo-500 to-violet-600` (gradient BG, logo etc.) | KEEP (works on light) |

## HARD RULES

1. **ONLY change `className` strings, inline `style` color values, and gradient class fragments.** Do NOT touch: component logic, hooks, state, props, event handlers, text content, file structure, imports (unless an import becomes truly unused — leave imports alone).
2. **KEEP `text-white` where the parent has a solid colored/gradient background** (e.g. `bg-primary`, `bg-gradient-to-br from-indigo-500 to-violet-600`, `bg-emerald-600`) — white on indigo is still correct in light theme.
3. **KEEP any existing `dark:` variant classes** — they are inert (no `dark` class on html) and preserve future opt-in dark mode. Do NOT add NEW `dark:` variants; plain semantic tokens already adapt.
4. **Contrast discipline**: on white/near-white backgrounds, NEVER leave a light gray text (e.g. `text-white/xx`, `text-slate-200`) — map per table. On white cards use `text-foreground` for primary text, `text-muted-foreground` for secondary.
5. **Do not invent new hex colors.** Use the semantic tokens: `background, foreground, card, surface, muted, muted-foreground, accent, popover, primary, secondary, success, warning, destructive, border, ring` (+ `/opacity` modifiers, which work: `bg-primary/10`, `border-border/70`).
6. **Status colors**: emerald (live/success), amber (warning), destructive/red (danger), sky (info) — Tailwind palette classes are fine for these (`text-emerald-600` etc.).
7. **Code blocks / terminals / API examples** may legitimately stay dark (a dark editor inside a light page is a deliberate design pattern — e.g. the landing demo window keeps `bg-[#0a0a0f]`-style dark window). If a dark panel is clearly a "code sample / terminal / chat demo mock", KEEP its dark interior, but restyle its chrome (borders, labels around it) to light tokens. When in doubt, keep the code block dark with `bg-slate-950` + `text-slate-100`-ish Tailwind classes instead of `white/xx` opacity classes.
8. **Scrollbar/selection**: leave global CSS alone.
9. **Buttons**: prefer existing shadcn `Button` variants where already used; for hand-rolled `bg-indigo-600 text-white` CTAs use `bg-primary text-primary-foreground hover:bg-primary/90`.
10. If a file in your list has NO dark patterns, skip it and note "already light".
11. **Never delete test files or their assertions** (*.test.ts/tsx). If a test asserts on a class string you must change, update the assertion to the new class.

## VERIFICATION (per agent, at the end)

Run from `/home/z/my-project/Clara-AI-Platform`:
```bash
npx tsc --noEmit -p tsconfig.typecheck.json
npx eslint <your touched files> --max-warnings 999
```
Both must be clean (warnings allowed, errors not). Fix what you broke.

## WORKLOG

Append your entry to `/home/z/my-project/worklog.md` (template in that file) with your Task ID.
