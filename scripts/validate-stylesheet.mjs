#!/usr/bin/env node
/**
 * scripts/validate-stylesheet.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Stylesheet Token Guard — CI assertion that Tailwind container-scale
 * utilities resolve to the container namespace, never the spacing namespace.
 *
 * WHY THIS EXISTS (root cause of the 2026-10 site-wide UI collapse):
 *   The Tailwind v3→v4 migration promoted the legacy JS config's custom
 *   `theme.extend.spacing` map (xs, sm, md, lg, xl, 2xl, 3xl — each mapping
 *   to `var(--spacing-*)` :root vars of 0.25–4rem) into v4 theme tokens via
 *   the `@config` directive in src/app/globals.css. In Tailwind v4, `max-w-*`
 *   resolves against both the container scale and the spacing scale, so the
 *   promoted names shadowed the container scale: `.max-w-sm` compiled to
 *   `max-width: var(--spacing-sm)` (0.5rem = 8px) instead of
 *   `var(--container-sm)` (24rem = 384px). The login card rendered 8px wide.
 *
 * MODES
 *   • default (CI / pre-deploy): asserts the tailwind config defines no
 *     `spacing` key that shadows a container-scale name, then compiles the
 *     REAL src/app/globals.css through @tailwindcss/postcss (production
 *     parity — the `@config` directive inside globals.css resolves itself
 *     against the real config and real content tree) and asserts the emitted
 *     utilities.
 *   • --css <path> (post-build / post-deploy): audits already-built CSS —
 *     a file, or a directory scanned recursively for *.css — e.g. the
 *     stylesheet served by the deployment, or .next/static/css after build.
 *
 * INVARIANTS (violations exit 1)
 *   C1  tailwind.config.js defines no `theme[.extend].spacing` key that
 *       shadows a container-scale name (none, xs … 7xl).
 *   N1  no emitted rule sets `max-width: var(--spacing-*)` on a `.max-w-*`
 *       utility — the exact regression signature, including responsive
 *       variants (e.g. `.md\:max-w-lg`).
 *   P1  `.max-w-sm` exists and resolves to `var(--container-sm)`.
 *   P2  the `--container-sm: 24rem` theme token is emitted (this is what
 *       keeps the login card at 384px minimum).
 *   P3  `.p-4` still resolves through the spacing scale — guards against
 *       over-blocking the whole spacing namespace.
 *   P4  `.bg-background` → `hsl(var(--background))` (shadcn token compat).
 *   P5  the universal base border rule survives (v3 compat layer intact).
 *   P6  `.container` still emits `width: 100%`.
 *   S1  at least one healthy `.max-w-*` rule exists in the stylesheet
 *       (sanity for the scanned artifact — this app uses them everywhere).
 *
 *   N2 (warning, non-fatal): `max-width: var(--spacing-*)` occurrences
 *   outside recognizable `.max-w-*` rules — deliberate hand-written rules
 *   should be reviewed, not auto-failed.
 *
 * FLAGS
 *   --css <path>          audit built CSS instead of compiling
 *   --root <dir>          repo root (default: this script's parent)
 *   --tailwind-root <dir> resolve postcss / @tailwindcss/postcss from another
 *                         node_modules tree (offline validation harnesses)
 *   --json                machine-readable summary
 *   -h, --help            this help
 *
 * Exit codes: 0 = clean, 1 = violations found, 2 = usage/runtime error.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const BAR = "─".repeat(76);

/** Container-scale names that `max-w-*` must own (Tailwind v4 namespace). */
const CONTAINER_SCALE = [
  "none", "xs", "sm", "md", "lg", "xl",
  "2xl", "3xl", "4xl", "5xl", "6xl", "7xl",
];

const BOOL_FLAGS = new Set(["json", "help"]);

// ── CLI ─────────────────────────────────────────────────────────────────────
function usage() {
  console.log(`Usage: node scripts/validate-stylesheet.mjs [options]

Options:
  (default)        compile src/app/globals.css via @tailwindcss/postcss and
                   assert the token invariants (CI / pre-deploy mode)
  --css <path>     audit already-built CSS (file or directory) instead
  --root <dir>     repo root (default: parent of scripts/)
  --tailwind-root <dir>
                   alternate node_modules tree for postcss /
                   @tailwindcss/postcss (offline validation)
  --json           print a machine-readable JSON summary
  -h, --help       show this help

Exit codes: 0 = clean, 1 = violations, 2 = usage/runtime error.`);
}

const argv = { _: [] };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === "-h" || a === "--help") argv.help = true;
  else if (a.startsWith("--")) {
    const eq = a.indexOf("=");
    if (eq > 0) argv[a.slice(2, eq)] = a.slice(eq + 1);
    else if (BOOL_FLAGS.has(a.slice(2))) argv[a.slice(2)] = true;
    else argv[a.slice(2)] = process.argv[++i] ?? "";
  } else argv._.push(a);
}

// ── check registry ──────────────────────────────────────────────────────────
const checks = [];
function record(id, label, pass, detail) {
  checks.push({ id, label, pass: !!pass, detail: detail ?? null });
  return !!pass;
}
const warnings = [];

// ── CSS parsing helpers (tolerate pretty and minified output) ───────────────
/** Iterate flat `selector { body }` rules; inner rules of @media/@layer match. */
function* iterateRules(css) {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of css.matchAll(re)) yield { selector: m[1].trim(), body: m[2] };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** All rules for a base utility class (group selectors included). */
function findRules(css, className) {
  const re = new RegExp(`\\.${escapeRe(className)}(?![a-z0-9-])[^{,]*\\{[^}]*\\}`, "g");
  return [...css.matchAll(re)].map((m) => m[0]);
}

const compact = (s) => s.replace(/\s+/g, " ").trim();

/**
 * Classify every `.max-w-*` rule (including escaped responsive variants such
 * as `.md\:max-w-lg`). A rule is an OFFENDER when its body declares
 * `max-width: var(--spacing-*)` — the regression signature.
 */
function classifyMaxWidthRules(css) {
  const offenders = [];
  let healthy = 0;
  for (const { selector, body } of iterateRules(css)) {
    if (!/max-w-[a-z0-9]/.test(selector)) continue;
    if (!/max-width\s*:/.test(body)) continue;
    const bad = body.match(/max-width:\s*var\(--spacing-([a-z0-9-]+)\)/);
    if (bad) {
      const name = selector.match(/max-w-([a-z0-9-]+)/)?.[1] ?? "?";
      offenders.push({
        selector: compact(selector).slice(0, 100),
        utility: `max-w-${name}`,
        resolved: `var(--spacing-${bad[1]})`,
      });
    } else healthy++;
  }
  return { offenders, healthy };
}

/** `max-width: var(--spacing-*)` in NON-utility rules (N2 — warning only). */
function findSpacingMaxWidthLookalikes(css) {
  const hits = [];
  for (const { selector, body } of iterateRules(css)) {
    if (/max-w-[a-z0-9]/.test(selector)) continue; // utility rules are N1's domain
    const bad = body.match(/max-width:\s*var\(--spacing-([a-z0-9-]+)\)/);
    if (bad) hits.push(`${compact(selector).slice(0, 80)} → max-width: var(--spacing-${bad[1]})`);
  }
  return hits;
}

// ── reporting ───────────────────────────────────────────────────────────────
function printReport(mode, ctx, extra = {}) {
  const failed = checks.filter((c) => !c.pass);
  if (argv.json) {
    console.log(
      JSON.stringify({ mode, ...(ctx ? { context: ctx } : {}), checks, warnings, ...extra }, null, 2)
    );
    return failed.length === 0 ? 0 : 1;
  }
  console.log(BAR);
  console.log("Stylesheet Token Guard — Tailwind container-scale integrity");
  console.log(`mode: ${mode}${ctx ? ` | ${ctx}` : ""}`);
  console.log(BAR);
  for (const c of checks) {
    console.log(`[${c.pass ? "PASS" : "FAIL"}] ${c.id}  ${c.label}`);
    if (!c.pass && c.detail) {
      for (const line of [].concat(c.detail)) console.log(`        ↳ ${line}`);
    }
  }
  for (const w of warnings) console.log(`[WARN] ${w}`);
  console.log(BAR);
  console.log(
    failed.length === 0
      ? `OK — ${checks.length} checks passed.`
      : `FAILED — ${failed.length}/${checks.length} checks failed.`
  );
  if (failed.length > 0) {
    console.log(
      "::error::stylesheet-token-guard: max-w-* utilities resolve to the spacing namespace (login-card 8px regression class). See scripts/validate-stylesheet.mjs header for the root-cause history."
    );
  }
  return failed.length === 0 ? 0 : 1;
}

// ── mode: scan already-built CSS ────────────────────────────────────────────
function collectCssFiles(target) {
  const abs = path.resolve(target);
  if (!fs.existsSync(abs)) {
    console.error(`error: --css path not found: ${abs}`);
    process.exit(2);
  }
  const stat = fs.statSync(abs);
  if (stat.isFile()) return [abs];
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile() && p.endsWith(".css") && !p.endsWith(".css.map")) files.push(p);
    }
  };
  walk(abs);
  if (files.length === 0) {
    console.error(`error: no .css files under ${abs}`);
    process.exit(2);
  }
  return files.sort();
}

function runScanMode() {
  const files = collectCssFiles(argv.css);
  const allOffenders = [];
  let healthy = 0;
  for (const file of files) {
    const css = fs.readFileSync(file, "utf8");
    const { offenders, healthy: h } = classifyMaxWidthRules(css);
    allOffenders.push(...offenders.map((o) => ({ ...o, file: path.basename(file) })));
    healthy += h;
    for (const like of findSpacingMaxWidthLookalikes(css)) {
      warnings.push(`${path.basename(file)}: non-utility ${like} — review intentional?`);
    }
  }

  record(
    "N1",
    "no `.max-w-*` rule resolves `max-width` to `var(--spacing-*)`",
    allOffenders.length === 0,
    allOffenders.map(
      (o) => `${o.file}: .${o.utility} (${compact(o.selector)}) → ${o.resolved} instead of var(--container-*)`
    )
  );
  record(
    "S1",
    "at least one healthy `.max-w-*` rule present",
    healthy > 0,
    healthy === 0 ? "no .max-w-* rules with a container/literal max-width found — wrong artifact?" : null
  );
  console.error(`[guard] scanned ${files.length} css file(s), ${healthy} healthy .max-w-* rule(s)`);

  const ctx = `scanned: ${files.length === 1 ? files[0] : path.dirname(files[0]) + "/*.css"}`;
  process.exit(printReport("scan (built CSS)", ctx, { files, healthyMaxWidthRules: healthy }));
}

// ── mode: config + compile the real stylesheet ──────────────────────────────
async function runCompileMode() {
  const root = path.resolve(argv.root || path.dirname(SCRIPT_DIR));
  const twRoot = path.resolve(argv["tailwind-root"] || root);

  // C1 — config-level collision (fail fastest, before any compile)
  const configCandidates = ["tailwind.config.js", "tailwind.config.cjs", "tailwind.config.mjs", "tailwind.config.ts"];
  const configPath = configCandidates.map((f) => path.join(root, f)).find((f) => fs.existsSync(f));
  if (!configPath) {
    console.error(`error: no tailwind config found under ${root}`);
    process.exit(2);
  }
  let cfg;
  try {
    cfg = createRequire(configPath)(configPath);
  } catch (err) {
    console.error(`error: failed to load ${configPath}: ${err.message}`);
    process.exit(2);
  }
  const spacingSources = [
    ["theme.extend.spacing", cfg?.theme?.extend?.spacing],
    ["theme.spacing", cfg?.theme?.spacing],
  ].filter(([, v]) => v && typeof v === "object");
  const collisions = [];
  for (const [src, obj] of spacingSources) {
    for (const key of Object.keys(obj)) {
      if (CONTAINER_SCALE.includes(key)) collisions.push(`${src}['${key}'] = ${String(obj[key])}`);
    }
  }
  record(
    "C1",
    "config: no `spacing` key shadows the container scale (none, xs…7xl)",
    collisions.length === 0,
    collisions.length === 0
      ? null
      : [
          ...collisions,
          "these names are promoted to v4 theme tokens via @config and shadow `max-w-*`,",
          "e.g. .max-w-sm → var(--spacing-sm) (0.5rem = 8px) instead of var(--container-sm) (24rem = 384px).",
          "Fix: remove the spacing block (see patches/01-hotfix-maxw-token-collision.patch).",
        ]
  );

  // K1 — compile the real globals.css with the project's own plugin
  const globalsPath = path.join(root, "src", "app", "globals.css");
  if (!fs.existsSync(globalsPath)) {
    console.error(`error: ${globalsPath} not found`);
    process.exit(2);
  }
  if (!/@import\s+"tailwindcss"/.test(fs.readFileSync(globalsPath, "utf8"))) {
    console.error(
      `error: ${globalsPath} does not import "tailwindcss" — this guard targets the v4 pipeline (@import + @config).`
    );
    process.exit(2);
  }
  let postcss;
  let tailwindPlugin;
  try {
    const req = createRequire(path.join(twRoot, "noop.js"));
    postcss = req("postcss");
    tailwindPlugin = req("@tailwindcss/postcss");
  } catch (err) {
    console.error(
      `error: cannot resolve postcss / @tailwindcss/postcss from ${twRoot} (${err.message}).\n` +
        `       Run \`npm ci --legacy-peer-deps\` first, or pass --tailwind-root <dir> pointing at a\n` +
        `       node_modules tree that has the exact production versions.`
    );
    process.exit(2);
  }
  process.stderr.write(`[guard] compiling ${path.relative(root, globalsPath)} via @tailwindcss/postcss (root: ${root})…\n`);
  const css = fs.readFileSync(globalsPath, "utf8");
  const result = await postcss([tailwindPlugin()]).process(css, { from: globalsPath });
  const out = result.css;
  if (typeof result.warnings === "function" && result.warnings().length > 0) {
    warnings.push(`postcss emitted ${result.warnings().length} warning(s) (non-fatal)`);
  }
  console.error(`[guard] compiled ${(out.length / 1024).toFixed(1)} KB of CSS`);

  // N1 — regression signature in generated rules
  const { offenders, healthy } = classifyMaxWidthRules(out);
  record(
    "N1",
    "no generated `.max-w-*` rule (incl. responsive variants) resolves to `var(--spacing-*)`",
    offenders.length === 0,
    offenders.map((o) => `.${o.utility} (${compact(o.selector)}) → ${o.resolved}`)
  );

  // P1 — the money rule
  const smRules = findRules(out, "max-w-sm");
  const smOk = smRules.length > 0 && smRules.every((r) => /max-width:\s*var\(--container-sm\)/.test(r));
  record(
    "P1",
    "`.max-w-sm` exists and resolves to `var(--container-sm)` (login card ≥ 384px)",
    smOk,
    smRules.length === 0 ? "rule not generated — content detection or config regression?" : compact(smRules[0])
  );

  // P2 — container scale token materialized
  record(
    "P2",
    "`--container-sm: 24rem` theme token emitted",
    /--container-sm:\s*24rem/.test(out),
    "container scale missing or re-scaled — deliberate change? update this guard accordingly."
  );

  // P3 — spacing scale itself still functional (no over-blocking)
  const p4Rules = findRules(out, "p-4");
  record(
    "P3",
    "`.p-4` resolves through the spacing scale — `calc(var(--spacing) * 4)`",
    p4Rules.length > 0 && p4Rules.every((r) => /padding:\s*calc\(var\(--spacing\)\s*\*\s*4\)/.test(r)),
    p4Rules.length === 0 ? "rule not generated" : compact(p4Rules[0])
  );

  // P4 — shadcn token compat
  const bgRules = findRules(out, "bg-background");
  record(
    "P4",
    "`.bg-background` → `hsl(var(--background))` (shadcn token compat)",
    bgRules.length > 0 && bgRules.every((r) => /background-color:\s*hsl\(var\(--background\)\)/.test(r)),
    bgRules.length === 0 ? "rule not generated" : compact(bgRules[0])
  );

  // P5 — v3 compat layer: universal base border rule
  record(
    "P5",
    "universal base border rule `border-color: hsl(var(--border))` survives",
    /border-color:\s*hsl\(var\(--border\)\)/.test(out),
    "bare `.border` utilities would lose their default colour"
  );

  // P6 — container utility compat
  const containerRules = findRules(out, "container");
  record(
    "P6",
    "`.container` still emits `width: 100%`",
    containerRules.length > 0 && containerRules.some((r) => /width:\s*100%/.test(r)),
    containerRules.length === 0 ? "rule not generated" : compact(containerRules[0])
  );

  // N2 — lookalikes (warning only)
  for (const like of findSpacingMaxWidthLookalikes(out)) {
    warnings.push(`non-utility ${like} in compiled output — review intentional?`);
  }

  const code = printReport("compile (config + src/app/globals.css)", `root: ${root}`, {
    root,
    tailwindRoot: twRoot,
    healthyMaxWidthRules: healthy,
  });
  process.exit(code);
}

// ── main ────────────────────────────────────────────────────────────────────
(async () => {
  if (argv.help) {
    usage();
    process.exit(0);
  }
  try {
    if (typeof argv.css === "string" && argv.css.length > 0) {
      runScanMode();
      return;
    }
    if (argv.css !== undefined) {
      console.error("error: --css requires a path argument");
      process.exit(2);
    }
    await runCompileMode();
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exit(2);
  }
})();
