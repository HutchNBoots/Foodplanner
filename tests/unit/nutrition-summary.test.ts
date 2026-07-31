import { describe, expect, it } from "vitest";
import { computeNutritionSummary } from "@/lib/nutrition/summary";

describe("computeNutritionSummary", () => {
  it("sums kcal/protein per day and across the week", () => {
    const summary = computeNutritionSummary([
      { dayDate: "2026-08-03", kcal: 500, proteinG: 30 },
      { dayDate: "2026-08-03", kcal: 400, proteinG: 20 },
      { dayDate: "2026-08-04", kcal: 600, proteinG: 40 },
    ]);

    expect(summary.byDay).toEqual([
      { dayDate: "2026-08-03", kcal: 900, proteinG: 50 },
      { dayDate: "2026-08-04", kcal: 600, proteinG: 40 },
    ]);
    expect(summary.weekTotal).toEqual({ kcal: 1500, proteinG: 90 });
  });

  it("averages per planned day, not divided by 7", () => {
    const summary = computeNutritionSummary([
      { dayDate: "2026-08-03", kcal: 1000, proteinG: 100 },
      { dayDate: "2026-08-04", kcal: 2000, proteinG: 200 },
    ]);

    expect(summary.dailyAverage).toEqual({ kcal: 1500, proteinG: 150 });
  });

  it("sorts days chronologically regardless of input order", () => {
    const summary = computeNutritionSummary([
      { dayDate: "2026-08-05", kcal: 100, proteinG: 10 },
      { dayDate: "2026-08-03", kcal: 100, proteinG: 10 },
      { dayDate: "2026-08-04", kcal: 100, proteinG: 10 },
    ]);

    expect(summary.byDay.map((d) => d.dayDate)).toEqual(["2026-08-03", "2026-08-04", "2026-08-05"]);
  });

  it("returns zeroed totals for no meals, without dividing by zero", () => {
    const summary = computeNutritionSummary([]);
    expect(summary.byDay).toEqual([]);
    expect(summary.weekTotal).toEqual({ kcal: 0, proteinG: 0 });
    expect(summary.dailyAverage).toEqual({ kcal: 0, proteinG: 0 });
  });
});
