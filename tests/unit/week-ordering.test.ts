import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Regression test for the History-page duplicate-date bug (see
// DECISIONS.md's "History page / duplicate-date bug: root cause"): several
// weeks can legitimately share the same `weekStartDate` (a retry, or the
// intake form's date field just wasn't changed), and every list/latest query
// needs `createdAt` as a tiebreaker so ties resolve to true recency instead
// of arbitrary DB order. Exercises the real PGlite-backed `db` singleton
// against a throwaway data directory, isolated from local dev's own
// `./local-pgdata`.
const dataDir = mkdtempSync(path.join(tmpdir(), "foodplanner-pglite-test-"));
process.env.PGLITE_DATA_DIR = dataDir;
delete process.env.DATABASE_URL;

const sampleIntake = {
  weekStartDate: "2026-08-03",
  daysMode: "full_week" as const,
  familyMeals: { satBreakfast: "sit_down", satEvening: "sit_down", sunLunch: "sit_down" } as const,
  dishStyles: [],
  proteins: [],
  avoidRepeating: [],
  budget: "",
  effort: "mixed" as const,
  notes: "",
};

describe("week ordering when weekStartDate is duplicated", () => {
  let db: (typeof import("@/lib/db/client"))["db"];
  let schema: typeof import("@/lib/db/schema");
  let queries: typeof import("@/lib/db/queries");
  let householdId: string;

  beforeAll(async () => {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    ({ db } = await import("@/lib/db/client"));
    schema = await import("@/lib/db/schema");
    queries = await import("@/lib/db/queries");

    await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder: "./src/db/migrations" });

    const household = await queries.getOrCreateHousehold();
    householdId = household.id;

    // Two weeks, same weekStartDate, inserted with explicit createdAt
    // timestamps so ordering is deterministic regardless of how fast the
    // inserts actually run.
    await db.insert(schema.weeks).values({
      householdId,
      weekStartDate: "2026-08-03",
      status: "ready",
      intakeJson: sampleIntake,
      createdAt: "2026-08-03T09:00:00.000Z",
    });
    await db.insert(schema.weeks).values({
      householdId,
      weekStartDate: "2026-08-03",
      status: "ready",
      intakeJson: sampleIntake,
      createdAt: "2026-08-03T15:30:00.000Z",
    });
  });

  afterAll(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("listWeeks resolves same-date ties by newest createdAt first", async () => {
    const result = await queries.listWeeks(householdId);
    expect(result).toHaveLength(2);
    expect(result[0]?.createdAt).toBe("2026-08-03T15:30:00.000Z");
    expect(result[1]?.createdAt).toBe("2026-08-03T09:00:00.000Z");
  });

  it("getLatestWeek and getLatestReadyWeek pick the newest createdAt, not an arbitrary same-date row", async () => {
    const latest = await queries.getLatestWeek(householdId);
    const latestReady = await queries.getLatestReadyWeek(householdId);
    expect(latest?.createdAt).toBe("2026-08-03T15:30:00.000Z");
    expect(latestReady?.createdAt).toBe("2026-08-03T15:30:00.000Z");
  });
});
