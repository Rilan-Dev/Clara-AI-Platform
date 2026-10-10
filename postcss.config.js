module.exports = {
  plugins: {
    "@tailwindcss/postcss": {},
    /* REMOVED (post-v4 cleanup, 2026-10-10): autoprefixer. Tailwind v4's
       Lightning CSS stage already emits vendor-prefixed, standards-targeted
       output, so a second autoprefixer pass only duplicates prefixes and
       inflates the stylesheet. */
  },
}
