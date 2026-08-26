import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Integration test (real PGlite DB) for the sign-up journey's data layer
// (see DECISIONS.md's "Sign-up journey" entry): sequential username
// generation, account creation, and login resolution - including the
// transparent-upgrade path for a household that predates this feature
// (passwordHash null, backfilled username, migrated via APP_PASSWORD).
const dataDir = mkdtempSync(path.join(tmpdir(), "foodplanner-pglite-auth-"));
process.env.PGLITE_DATA_DIR = dataDir;
process.env.APP_PASSWORD = "the-shared-invite-code";
process.env.AUTH_SECRET = "test-auth-secret";

describe("sign-up journey: username generation, accounts, login", () => {
  let db: (typeof import("@/lib/db/client"))["db"];
  let households: (typeof import("@/lib/db/schema"))["households"];
  let queries: typeof import("@/lib/db/queries");
  let login: typeof import("@/lib/auth/login");
  let password: typeof import("@/lib/auth/password");

  beforeAll(async () => {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    ({ db } = await import("@/lib/db/client"));
    ({ households } = await import("@/lib/db/schema"));
    queries = await import("@/lib/db/queries");
    login = await import("@/lib/auth/login");
    password = await import("@/lib/auth/password");

    await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder: "./src/db/migrations" });
  });

  afterAll(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("generates sequential usernames, family1 first", async () => {
    expect(await queries.generateUniqueUsername()).toBe("family1");

    const hash = await password.hashPassword("first-account-password");
    await queries.createHouseholdAccount({ username: "family1", passwordHash: hash });

    expect(await queries.generateUniqueUsername()).toBe("family2");
  });

  it("logs a new account in with its real password and rejects the wrong one", async () => {
    const hash = await password.hashPassword("second-account-password");
    const household = await queries.createHouseholdAccount({ username: "family2", passwordHash: hash });

    expect(await login.resolveLogin("family2", "second-account-password")).toBe(household.id);
    expect(await login.resolveLogin("family2", "wrong-password")).toBeNull();
  });

  it("rejects an unknown username", async () => {
    expect(await login.resolveLogin("family999", "anything")).toBeNull();
  });

  it("transparently upgrades a legacy household (null passwordHash) on first correct login with the shared invite code", async () => {
    // Inserted directly (not via getOrCreateHousehold, which would just
    // return an already-existing row from an earlier test in this shared
    // DB) - `passwordHash` has no default, so leaving it unset here is
    // exactly what a household migrated from before the sign-up journey
    // looks like (see migration 0007).
    const [legacy] = await db.insert(households).values({ username: "family-legacy" }).returning();
    expect(legacy?.passwordHash).toBeNull();
    if (!legacy) throw new Error("Insert didn't return a row.");

    // Wrong password against a legacy row still fails.
    expect(await login.resolveLogin("family-legacy", "not-the-invite-code")).toBeNull();

    // Correct shared invite code succeeds and upgrades the row.
    const householdId = await login.resolveLogin("family-legacy", "the-shared-invite-code");
    expect(householdId).toBe(legacy.id);

    const upgraded = await queries.getHouseholdById(legacy.id);
    expect(upgraded?.passwordHash).not.toBeNull();

    // The invite code still works a second time too - it's a real password
    // now, verified the normal way rather than via the legacy fallback.
    expect(await login.resolveLogin("family-legacy", "the-shared-invite-code")).toBe(legacy.id);
  });
});
