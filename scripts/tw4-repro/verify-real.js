// Verify the hotfix using the REAL project files:
//   - src/real-globals.css  = copy of src/app/globals.css at HEAD 2c61afdc
//   - tailwind.config.js    = PATCHED config (spacing block removed)
// The @config "../../tailwind.config.js" directive inside real-globals.css
// resolves relative to src/ -> repro root -> patched config. This mirrors the
// production pipeline exactly (same versions: tailwindcss 4.3.3 + @tailwindcss/postcss 4.3.3).

const path = require("path");
const postcss = require("postcss");
const fs = require("fs");
const tailwind = require("@tailwindcss/postcss");

async function build() {
  const inputPath = path.join(__dirname, "src", "app", "real-globals.css");
  const css = fs.readFileSync(inputPath, "utf8");
  const result = await postcss([tailwind()]).process(css, { from: inputPath });
  fs.writeFileSync(path.join(__dirname, "out-real-fixed.css"), result.css);

  const out = result.css;
  const checks = [];

  const rule = (name) => {
    const m = out.match(new RegExp(`\\.${name.replace(/[-]/g, "\\-")}(?![a-z0-9\\-])[^{,]*\\{[^}]*\\}`));
    return m ? m[0] : null;
  };

  // PRIMARY: broken utilities must resolve to the container scale now
  for (const u of ["max-w-xs", "max-w-sm", "max-w-md", "max-w-lg", "max-w-xl", "max-w-2xl", "max-w-3xl"]) {
    const r = rule(u);
    checks.push({
      name: `.${u}`,
      expected: "var(--container-",
      rule: r,
      pass: r ? r.includes("var(--container-") : false,
    });
  }
  // Correct before-and-after utilities must be untouched
  for (const u of ["max-w-4xl", "max-w-5xl"]) {
    const r = rule(u);
    checks.push({ name: `.${u}`, expected: "var(--container-", rule: r, pass: r ? r.includes("var(--container-") : false });
  }
  // Secondary: named spacing utilities must NOT be generated (dead config)
  for (const u of ["p-sm", "gap-md", "m-lg"]) {
    const r = rule(u);
    checks.push({ name: `.${u}`, expected: "NOT generated", rule: r, pass: r === null });
  }
  // Secondary: base border color rule must survive (compat layer)
  const baseBorder = /border-color:\s*hsl\(var\(--border\)\)/.test(out);
  checks.push({ name: "* border-color base rule", expected: "present", rule: null, pass: baseBorder });
  // Secondary: shadcn tokens still resolve
  const bg = rule("bg-background");
  checks.push({ name: ".bg-background", expected: "hsl(var(--background))", rule: bg, pass: bg ? bg.includes("hsl(var(--background))") : false });
  const txt = rule("text-foreground");
  checks.push({ name: ".text-foreground", expected: "hsl(var(--foreground))", rule: txt, pass: txt ? txt.includes("hsl(var(--foreground))") : false });
  // Secondary: container utility still emits width/max-width (v4 native nesting)
  const cont = rule("container");
  checks.push({ name: ".container", expected: "width: 100%", rule: cont, pass: cont ? /width:\s*100%/.test(cont) : false });
  // Secondary: standard spacing scale still numeric
  const p4 = rule("p-4");
  checks.push({ name: ".p-4", expected: "calc(var(--spacing)*4)", rule: p4, pass: p4 ? /spacing\)\s*\*\s*4/.test(p4) : false });

  let failed = 0;
  console.log("=== VERIFICATION: patched real config + real globals.css ===\n");
  for (const c of checks) {
    const status = c.pass ? "PASS" : "FAIL";
    if (!c.pass) failed++;
    console.log(`[${status}] ${c.name}  ->  ${c.rule ? c.rule.replace(/\s+/g, " ").slice(0, 90) : (c.pass ? "not generated (correct)" : "MISSING")}`);
  }
  console.log(`\n${failed === 0 ? "ALL CHECKS PASSED" : failed + " CHECK(S) FAILED"}`);
  console.log(`output size: ${(out.length / 1024).toFixed(1)} KB -> out-real-fixed.css`);

  // Show the money rule
  const sm = rule("max-w-sm");
  console.log("\n--- THE MONEY RULE ---");
  console.log(sm);
  process.exit(failed === 0 ? 0 : 1);
}

build().catch((e) => {
  console.error("BUILD FAILED:", e.message);
  process.exit(2);
});
