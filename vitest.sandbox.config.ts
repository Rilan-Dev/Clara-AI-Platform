/**
 * SANDBOX-ONLY vitest config (untracked — never committed).
 *
 * The worktree's node_modules lacks @tailwindcss/postcss, so Vite's eager
 * postcss.config.js load dies before any test runs. An inline empty postcss
 * object makes Vite skip config-file discovery entirely; tests here are
 * node-environment and never process CSS.
 */
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    env: {
      AUTH_SECRET: "vitest-only-auth-secret-000000000000000000",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  css: { postcss: {} },
});
