import { describe, expect, it } from "vitest";
import { daysForIntake, todayISO } from "@/lib/intake";

describe("todayISO", () => {
  it("formats a given date as an ISO yyyy-mm-dd string", () => {
    expect(todayISO(new Date("2026-08-06T09:00:00"))).toBe("2026-08-06");
  });
});

describe("daysForIntake", () => {
  it("expands to numDays consecutive days starting from weekStartDate", () => {
    const days = daysForIntake({ weekStartDate: "2026-08-03", numDays: 7 });
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ date: "2026-08-03", dayOfWeek: "Monday" });
    expect(days[6]).toEqual({ date: "2026-08-09", dayOfWeek: "Sunday" });
  });

  it("works from a non-Monday start date (delivery day, not a fixed week)", () => {
    const days = daysForIntake({ weekStartDate: "2026-08-05", numDays: 5 });
    expect(days).toHaveLength(5);
    expect(days[0]).toEqual({ date: "2026-08-05", dayOfWeek: "Wednesday" });
    expect(days.at(-1)).toEqual({ date: "2026-08-09", dayOfWeek: "Sunday" });
  });

  it("expands to a single day when numDays is 1", () => {
    const days = daysForIntake({ weekStartDate: "2026-08-03", numDays: 1 });
    expect(days).toEqual([{ date: "2026-08-03", dayOfWeek: "Monday" }]);
  });

  it("spans more than a week (e.g. a fortnightly shop) covering two Saturdays", () => {
    const days = daysForIntake({ weekStartDate: "2026-08-03", numDays: 14 });
    expect(days).toHaveLength(14);
    const saturdays = days.filter((d) => d.dayOfWeek === "Saturday");
    expect(saturdays).toHaveLength(2);
  });
});
