export type MealMacros = { dayDate: string; kcal: number; proteinG: number };

export type DayNutrition = { dayDate: string; kcal: number; proteinG: number };

export type WeekNutritionSummary = {
  byDay: DayNutrition[];
  weekTotal: { kcal: number; proteinG: number };
  /** Per-day average across the days actually planned, not divided by 7 -
   * a "weekdays only" or "Mon-Sat" week should compare like-for-like against
   * the daily target, not be diluted by unplanned days. */
  dailyAverage: { kcal: number; proteinG: number };
};

/** Per-adult daily/weekly kcal+protein totals (MVP 1.1 "must-ship" CX item,
 * see DECISIONS.md) - summed from the per-adult-portion macros already
 * stored on each meal, one row per day/meal slot. Pure and DB-free so it's
 * directly unit-testable; `dayDate` grouping is a plain string key, matching
 * how `meals.dayDate` is already used elsewhere (see plan/[weekId]/page.tsx). */
export function computeNutritionSummary(meals: MealMacros[]): WeekNutritionSummary {
  const byDayMap = new Map<string, { kcal: number; proteinG: number }>();
  for (const meal of meals) {
    const entry = byDayMap.get(meal.dayDate) ?? { kcal: 0, proteinG: 0 };
    entry.kcal += meal.kcal;
    entry.proteinG += meal.proteinG;
    byDayMap.set(meal.dayDate, entry);
  }

  const byDay: DayNutrition[] = Array.from(byDayMap.entries())
    .map(([dayDate, totals]) => ({ dayDate, ...totals }))
    .sort((a, b) => (a.dayDate < b.dayDate ? -1 : a.dayDate > b.dayDate ? 1 : 0));

  const weekTotal = byDay.reduce(
    (acc, day) => ({ kcal: acc.kcal + day.kcal, proteinG: acc.proteinG + day.proteinG }),
    { kcal: 0, proteinG: 0 },
  );

  const dayCount = byDay.length || 1;
  const dailyAverage = { kcal: weekTotal.kcal / dayCount, proteinG: weekTotal.proteinG / dayCount };

  return { byDay, weekTotal, dailyAverage };
}
