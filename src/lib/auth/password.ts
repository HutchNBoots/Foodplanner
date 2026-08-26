// Password hashing for the sign-up journey (see DECISIONS.md's "Sign-up
// journey" entry) - PBKDF2-HMAC-SHA256 via Web Crypto, not bcrypt/scrypt,
// so this works from a plain Node API route without a native dependency
// (matches session.ts's Web-Crypto-only approach, kept consistent even
// though this file itself doesn't need to run on the Edge runtime).

import { fromBase64Url, toBase64Url } from "./encoding";
import { constantTimeEquals } from "./session";

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_LENGTH_BITS = 256;

async function deriveBits(password: string, salt: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    KEY_LENGTH_BITS,
  );
}

/** Returns `${saltB64url}.${hashB64url}` - the salt travels with the hash
 * (standard PBKDF2 practice) since it isn't a secret, just needs to be
 * unique per password. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await deriveBits(password, salt);
  return `${toBase64Url(salt)}.${toBase64Url(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltB64, hashB64] = stored.split(".");
  if (!saltB64 || !hashB64) return false;

  const salt = fromBase64Url(saltB64);
  const derived = await deriveBits(password, salt);
  return constantTimeEquals(toBase64Url(derived), hashB64);
}
