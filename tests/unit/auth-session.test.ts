import { beforeEach, describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken, constantTimeEquals } from "@/lib/auth/session";

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-for-unit-tests";
});

describe("session tokens", () => {
  it("round-trips: a freshly created token verifies as valid", async () => {
    const token = await createSessionToken();
    expect(await verifySessionToken(token)).toBe(true);
  });

  it("rejects a tampered signature", async () => {
    const token = await createSessionToken();
    const [expiry] = token.split(".");
    const tampered = `${expiry}.notarealsignature`;
    expect(await verifySessionToken(tampered)).toBe(false);
  });

  it("rejects an expired token", async () => {
    const expiredExpiry = Date.now() - 1000;
    const token = await createSessionToken();
    const [, signature] = token.split(".");
    const expiredToken = `${expiredExpiry}.${signature}`;
    expect(await verifySessionToken(expiredToken)).toBe(false);
  });

  it("rejects undefined/empty tokens", async () => {
    expect(await verifySessionToken(undefined)).toBe(false);
    expect(await verifySessionToken("")).toBe(false);
    expect(await verifySessionToken("not-even-two-parts")).toBe(false);
  });
});

describe("constantTimeEquals", () => {
  it("returns true for equal strings", () => {
    expect(constantTimeEquals("abc123", "abc123")).toBe(true);
  });

  it("returns false for different strings, including different lengths", () => {
    expect(constantTimeEquals("abc123", "abc124")).toBe(false);
    expect(constantTimeEquals("short", "muchlonger")).toBe(false);
  });
});
