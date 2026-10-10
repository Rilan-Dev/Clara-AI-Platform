// Minimal reproduction of the Clara AI Platform Tailwind v4 regression.
// Mirrors the production pipeline: globals.css (@import "tailwindcss" + @config)
// + tailwind.config.js with the custom named spacing scale (xs..3xl).

const path = require("path");
const postcss = require("postcss");
const fs = require("fs");
const tailwind = require("@tailwindcss/postcss");

const variant = process.argv[2] || "with-spacing"; // with-spacing | no-spacing

const configWithSpacing = `
module.exports = {
  content: ["./src/**/*.{html,js,tsx}"],
  theme: {
    extend: {
      spacing: {
        xs: "var(--spacing-xs)",
        sm: "var(--spacing-sm)",
        md: "var(--spacing-md)",
        lg: "var(--spacing-lg)",
        xl: "var(--spacing-xl)",
        "2xl": "var(--spacing-2xl)",
        "3xl": "var(--spacing-3xl)",
      },
    },
  },
};
`;

const configNoSpacing = `
module.exports = {
  content: ["./src/**/*.{html,js,tsx}"],
  theme: {
    extend: {},
  },
};
`;

fs.writeFileSync(
  path.join(__dirname, "tailwind.config.js"),
  variant === "with-spacing" ? configWithSpacing : configNoSpacing
);

const inputCss = `
@import "tailwindcss";
@config "../tailwind.config.js";

@layer base {
  :root {
    --spacing-xs: 0.25rem;
    --spacing-sm: 0.5rem;
    --spacing-md: 1rem;
    --spacing-lg: 1.5rem;
    --spacing-xl: 2rem;
    --spacing-2xl: 3rem;
    --spacing-3xl: 4rem;
  }
}
`;

async function build() {
  const result = await postcss([tailwind()]).process(inputCss, {
    from: path.join(__dirname, "src", "input.css"),
    to: path.join(__dirname, `out-${variant}.css`),
  });
  fs.writeFileSync(path.join(__dirname, `out-${variant}.css`), result.css);
  const css = result.css;

  const extract = (name) => {
    const m = css.match(new RegExp(`\\.${name.replace(/-/g, "\\-")}(?![a-z0-9\\-])[^{]*\\{[^}]*\\}`));
    return m ? m[0] : "(not generated)";
  };

  console.log(`\n=== VARIANT: ${variant} ===`);
  for (const u of ["max-w-xs", "max-w-sm", "max-w-md", "max-w-lg", "max-w-xl", "max-w-2xl", "max-w-3xl", "max-w-5xl"]) {
    console.log(`  .${u}  ->  ${extract(u)}`);
  }
  const smMatch = css.match(/--spacing-sm:[^;]*;/);
  console.log(`  theme var --spacing-sm: ${smMatch ? smMatch[0] : "(absent)"}`);
}

build().catch((e) => {
  console.error("BUILD FAILED:", e.message);
  process.exit(1);
});
