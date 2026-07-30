import { describe, expect, it } from "vitest";
import { daysForIntake, upcomingMonday } from "@/lib/intake";

describe("upcomingMonday", () => {
  it("returns the same date when today is already Monday", () => {
    // 2026-08-03 is a Monday.
    expect(upcomingMonday(new Date("2026-08-03T09:00:00"))).toBe("2026-08-03");
  });

  it("rolls forward to next Monday when today is later in the week", () => {
    // 2026-08-06 is a Thursday -> next Monday is 2026-08-10.
    expect(upcomingMonday(new Date("2026-08-06T09:00:00"))).toBe("2026-08-10");
  });

  it("rolls forward from Sunday to the next day (Monday)", () => {
    // 2026-08-09 is a Sunday -> next Monday is 2026-08-10.
    expect(upcomingMonday(new Date("2026-08-09T09:00:00"))).toBe("2026-08-10");
  });
});

describe("daysForIntake", () => {
  it("expands to 7 consecutive days for full_week starting on the given Monday", () => {
    const days = daysForIntake({ weekStartDate: "2026-08-03", daysMode: "full_week" });
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ date: "2026-08-03", dayOfWeek: "Monday" });
    expect(days[6]).toEqual({ date: "2026-08-09", dayOfWeek: "Sunday" });
  });

  it("expands to 5 days for weekdays_only", () => {
    const days = daysForIntake({ weekStartDate: "2026-08-03", daysMode: "weekdays_only" });
    expect(days).toHaveLength(5);
    expect(days.at(-1)).toEqual({ date: "2026-08-07", dayOfWeek: "Friday" });
  });

  it("expands to 6 days for mon_to_sat", () => {
    const days = daysForIntake({ weekStartDate: "2026-08-03", daysMode: "mon_to_sat" });
    expect(days).toHaveLength(6);
    expect(days.at(-1)).toEqual({ date: "2026-08-08", dayOfWeek: "Saturday" });
  });
});
