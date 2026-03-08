/**
 * src/lib/env.ts
 *
 * Validates all required environment variables at server startup.
 * Import this at the top of any API route or server action that needs
 * environment variables, or call it once from your Next.js instrumentation file.
 *
 * Usage:
 *   import { env } from "@/lib/env";
 *   const { DATABASE_URL, OPENAI_API_KEY } = env;
 */

type Env = {
  // Database
  DATABASE_URL: string;

  // Vector DB
  QDRANT_URL: string;
  QDRANT_API_KEY: string | undefined;

  // AI
  OPENAI_API_KEY: string;

  // Auth
  AUTH_SECRET: string;

  // Optional — Stripe
  STRIPE_SECRET_KEY:       string | undefined;
  STRIPE_WEBHOOK_SECRET:   string | undefined;

  // App
  NEXT_PUBLIC_APP_URL:     string;
  NODE_ENV:                "development" | "production" | "test";
};

// Required variables — startup will throw if any are missing in production
const REQUIRED: Array<keyof Env> = [
  "DATABASE_URL",
  "QDRANT_URL",
  "OPENAI_API_KEY",
  "AUTH_SECRET",
];

function loadEnv(): Env {
  const missing: string[] = [];

  for (const key of REQUIRED) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    const msg =
      `[Clara AI] Missing required environment variables:\n` +
      missing.map(k => `  • ${k}`).join("\n") +
      `\n\nSee .env.example for the full list of required variables.`;

    if (process.env.NODE_ENV === "production") {
      throw new Error(msg);
    } else {
      console.warn("\x1b[33m%s\x1b[0m", msg);
    }
  }

  return {
    DATABASE_URL:            process.env.DATABASE_URL!,
    QDRANT_URL:              process.env.QDRANT_URL ?? "http://localhost:6333",
    QDRANT_API_KEY:          process.env.QDRANT_API_KEY,
    OPENAI_API_KEY:          process.env.OPENAI_API_KEY!,
    AUTH_SECRET:             process.env.AUTH_SECRET ?? "change-me-in-production",
    STRIPE_SECRET_KEY:       process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET:   process.env.STRIPE_WEBHOOK_SECRET,
    NEXT_PUBLIC_APP_URL:     process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3010",
    NODE_ENV:                (process.env.NODE_ENV as Env["NODE_ENV"]) ?? "development",
  };
}

// Singleton — evaluated once per process startup
export const env = loadEnv();

/**
 * Helper: Returns true if all Stripe keys are configured.
 * Use before any Stripe API calls to give a clean error message.
 */
export function hasStripe(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
}

/**
 * Helper: Returns true if running in production.
 */
export function isProduction(): boolean {
  return env.NODE_ENV === "production";
}
