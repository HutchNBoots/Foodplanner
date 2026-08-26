import { beforeEach, describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken, constantTimeEquals } from "@/lib/auth/session";

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-for-unit-tests";
});

const HOUSEHOLD_ID = "household-abc-123";

describe("session tokens", () => {
  it("round-trips: a freshly created token verifies and returns its householdId", async () => {
    const token = await createSessionToken(HOUSEHOLD_ID);
    expect(await verifySessionToken(token)).toBe(HOUSEHOLD_ID);
  });

  it("rejects a tampered signature", async () => {
    const token = await createSessionToken(HOUSEHOLD_ID);
    const [householdId, expiry] = token.split(".");
    const tampered = `${householdId}.${expiry}.notarealsignature`;
    expect(await verifySessionToken(tampered)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const expiredExpiry = Date.now() - 1000;
    const token = await createSessionToken(HOUSEHOLD_ID);
    const [, , signature] = token.split(".");
    const expiredToken = `${HOUSEHOLD_ID}.${expiredExpiry}.${signature}`;
    expect(await verifySessionToken(expiredToken)).toBeNull();
  });

  it("rejects undefined/empty/malformed tokens", async () => {
    expect(await verifySessionToken(undefined)).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
    expect(await verifySessionToken("not-even-two-parts")).toBeNull();
  });

  it("rejects a token for a different household reusing another's signature", async () => {
    const token = await createSessionToken(HOUSEHOLD_ID);
    const [, expiry, signature] = token.split(".");
    const forged = `someone-elses-household.${expiry}.${signature}`;
    expect(await verifySessionToken(forged)).toBeNull();
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
