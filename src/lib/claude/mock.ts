import { daysForIntake } from "@/lib/intake";
import type { WeekIntake } from "@/lib/db/schema";
import type { WeekPlan } from "./schema";

/** Deterministic stand-in for a real Claude call, used when `MOCK_GENERATION=1`
 * (set by the e2e smoke test - see DECISIONS.md on why generation is mocked
 * there rather than hitting a live API). Shape matches `weekPlanSchema`
 * exactly so it exercises the same persistence/aggregation/image-resolution
 * code a real response would. */
export function buildMockWeekPlan(params: {
  weekStartDate: string;
  daysMode: WeekIntake["daysMode"];
}): WeekPlan {
  const days = daysForIntake(params);

  return {
    summary: "A mocked week of meals for testing - no live Claude call was made.",
    days: days.map(({ date, dayOfWeek }, i) => ({
      day: dayOfWeek,
      date,
      meals: [
        {
          slot: "dinner",
          title: i === 0 ? "Batch-cooked chicken tray bake" : `Test dinner ${i + 1}`,
          servingsAdults: 2,
          servingsKids: 0,
          ingredients: [
            { name: "chicken breast", quantity: 400, unit: "g", aisle: "Meat & fish" },
            { name: "mixed vegetables", quantity: 300, unit: "g", aisle: "Fresh produce" },
          ],
          method: ["Preheat the oven.", "Roast everything together.", "Serve."],
          macrosPerAdultPortion: { kcal: 520, proteinG: 38, carbsG: 40, fatG: 18, fibreG: 8 },
          photoQuery: "chicken tray bake",
          batchCook:
            i === 0
              ? { makes: 4, leftoverFor: [{ day: days[2]?.dayOfWeek ?? dayOfWeek, slot: "lunch" }] }
              : null,
        },
      ],
    })),
  };
}
