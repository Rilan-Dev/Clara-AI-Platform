/**
 * src/modules/auth/core/password.ts
 * Password hashing and verification using Node.js built-in crypto (scrypt).
 * No external dependencies — scrypt is OWASP-recommended for password hashing.
 */

import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

// scrypt parameters — deliberately high cost to resist brute-force
const KEY_LEN    = 64;   // output hash length in bytes
const SALT_LEN   = 16;   // random salt length in bytes

/**
 * Hash a plain-text password.
 * Returns a storable string in the format: `<hex-salt>:<hex-hash>`
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  const salt = randomBytes(SALT_LEN).toString("hex");
  const hash = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

/**
 * Verify a plain-text password against a stored hash.
 * Uses constant-time comparison to prevent timing attacks.
 */
export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [salt, storedHash] = stored.split(":");
  if (!salt || !storedHash) return false;
  try {
    const storedBuffer  = Buffer.from(storedHash, "hex");
    const derivedBuffer = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
    if (storedBuffer.length !== derivedBuffer.length) return false;
    return timingSafeEqual(storedBuffer, derivedBuffer);
  } catch {
    return false;
  }
}
