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
  AI_PROVIDER: "openai" | "gemini" | "sarvam";
  OPENAI_API_KEY: string;
  GEMINI_API_KEY: string | undefined;
  SARVAM_API_KEY: string | undefined;

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
  "AUTH_SECRET",
  // OpenAI is the platform bootstrap provider and is mandatory even when
  // another provider is selected at runtime by the platform admin.
  "OPENAI_API_KEY",
];

// Phase 6.2: AUTH_SECRET must be a real secret (min 32 chars), not the
// template placeholder — session-token HMACs are only as strong as it.
const AUTH_SECRET_MIN_LENGTH = 32;
const AUTH_SECRET_PLACEHOLDERS = new Set([
  "change-me-in-production",
  "insecure-default-change-me",
  "your-auth-secret",
  "changeme",
]);

function loadEnv(): Env {
  const missing: string[] = [];
  const rawProvider = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
  const provider = rawProvider === "gemini" ? "gemini" : rawProvider === "sarvam" ? "sarvam" : "openai";

  for (const key of REQUIRED) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  const providerKey =
    provider === "gemini" ? "GEMINI_API_KEY" : provider === "sarvam" ? "SARVAM_API_KEY" : "OPENAI_API_KEY";
  if (!process.env[providerKey] && providerKey !== "OPENAI_API_KEY") {
    missing.push(providerKey);
  }

  const authSecret = process.env.AUTH_SECRET ?? "";
  const authSecretWeak =
    !authSecret ||
    AUTH_SECRET_PLACEHOLDERS.has(authSecret.trim().toLowerCase()) ||
    authSecret.trim().length < AUTH_SECRET_MIN_LENGTH;

  if (authSecretWeak) {
    const msg =
      `[Clara AI] AUTH_SECRET must be at least ${AUTH_SECRET_MIN_LENGTH} characters ` +
      `and must not be a placeholder (found ${authSecret ? `${authSecret.trim().length} chars` : "empty"}).\n` +
      `Generate one with: openssl rand -hex 32`;
    if (process.env.NODE_ENV === "production") {
      missing.push(`AUTH_SECRET (weak — ${msg})`);
    } else {
      console.warn("\x1b[33m%s\x1b[0m", msg);
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
    AI_PROVIDER:             provider,
    OPENAI_API_KEY:          process.env.OPENAI_API_KEY!,
    GEMINI_API_KEY:          process.env.GEMINI_API_KEY,
    SARVAM_API_KEY:          process.env.SARVAM_API_KEY,
    AUTH_SECRET:             process.env.AUTH_SECRET ?? "change-me-in-production",
    STRIPE_SECRET_KEY:       process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET:   process.env.STRIPE_WEBHOOK_SECRET,
    NEXT_PUBLIC_APP_URL:     process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
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
