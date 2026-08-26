// Shared base64url helpers for the auth layer (session tokens, password
// hashes) - plain Web Crypto/`btoa`/`atob`, so this stays usable from both
// the Edge-runtime middleware and Node API routes (see session.ts).

export function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const bin = String.fromCharCode(...arr);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const withPadding = padded + "=".repeat((4 - (padded.length % 4)) % 4);
  const bin = atob(withPadding);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
