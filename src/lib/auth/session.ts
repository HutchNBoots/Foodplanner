// HMAC-signed session token, verified using Web Crypto (SubtleCrypto) so it
// works identically in Next.js middleware (Edge runtime) and API routes
// (Node runtime) - see DECISIONS.md for why this is a single-password gate
// rather than full auth (superseded by the sign-up journey - see
// DECISIONS.md's "Sign-up journey" entry - but the Edge-compatibility
// constraint still applies, hence still no `next/headers`/DB import here
// except in `getSessionHouseholdId`, which is Node-only and never touched
// by proxy.ts).
//
// The token now carries which household it belongs to
// (`householdId.expiresAt.signature`, HMAC-signed over `householdId.
// expiresAt`) instead of being a bare "someone logged in" flag - every
// household is its own account since the sign-up journey.

import { toBase64Url } from "./encoding";

export const SESSION_COOKIE = "fp_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.APP_PASSWORD;
  if (!secret) {
    throw new Error("Missing AUTH_SECRET/APP_PASSWORD environment variable.");
  }
  return secret;
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSessionToken(householdId: string): Promise<string> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${householdId}.${expiresAt}`;
  const key = await hmacKey(getSecret());
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${toBase64Url(signature)}`;
}

/** Returns the session's `householdId` if the token is present, correctly
 * signed, and not expired - `null` otherwise. Callers that only need a
 * yes/no gate (proxy.ts) can just check truthiness. */
export async function verifySessionToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const [householdId, expiresAtRaw, signature] = token.split(".");
  if (!householdId || !expiresAtRaw || !signature) return null;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;

  const key = await hmacKey(getSecret());
  const expected = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${householdId}.${expiresAtRaw}`),
  );
  return toBase64Url(expected) === signature ? householdId : null;
}

/** Node-only convenience for pages/API routes (uses `next/headers`, not
 * available on the Edge runtime) - reads the session cookie from the
 * current request and resolves it to a householdId. proxy.ts reads the
 * cookie itself instead (it only needs the boolean gate). */
export async function getSessionHouseholdId(): Promise<string | null> {
  const { cookies } = await import("next/headers");
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
