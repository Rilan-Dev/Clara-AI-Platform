import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Session hashing needs a secret at call time. Tests get a fixed,
    // non-production value; suites that exercise the secret override it.
    env: {
      AUTH_SECRET: "vitest-only-auth-secret-000000000000000000",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
