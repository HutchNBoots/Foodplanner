import { daysForIntake } from "@/lib/intake";
import type { FamilyMeals, WeekIntake } from "@/lib/db/schema";
import type { MealPlanItem, WeekPlan } from "./schema";

/** Deterministic stand-in for a real Claude call, used when `MOCK_GENERATION=1`
 * (set by the e2e smoke test - see DECISIONS.md on why generation is mocked
 * there rather than hitting a live API). Shape matches `weekPlanSchema`
 * exactly so it exercises the same persistence/aggregation/image-resolution
 * code a real response would, including MVP 1.2's adult/kids/family tracks
 * and the leftover cap. */
export function buildMockWeekPlan(params: {
  weekStartDate: string;
  daysMode: WeekIntake["daysMode"];
  familyMeals: FamilyMeals;
}): WeekPlan {
  const days = daysForIntake(params);
  const { familyMeals } = params;

  return {
    summary: "A mocked week of meals for testing - no live Claude call was made.",
    days: days.map(({ date, dayOfWeek }, i) => {
      const meals: MealPlanItem[] = [];

      // Adult track: unchanged from MVP1/1.1's mock shape (a batch-cook on
      // day 0 with a leftover reused on day 2's lunch, plain dinners
      // otherwise) - kept identical so existing e2e assertions still hold.
      meals.push({
        slot: "dinner",
        track: "adult",
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
            ? { makes: 4, leftoverFor: [{ day: days[2]?.dayOfWeek ?? dayOfWeek, slot: "lunch" }], freezerPortions: null }
            : null,
      });

      const isSaturday = dayOfWeek === "Saturday";
      const isSunday = dayOfWeek === "Sunday";

      // Family track: the three occasions, only on their actual day and
      // only when not skipped (MVP 1.2, see DECISIONS.md).
      if (isSaturday && familyMeals.satBreakfast !== "skip") {
        meals.push(familyMeal("breakfast", "Family pancake breakfast"));
      }
      if (isSaturday && familyMeals.satEvening !== "skip") {
        meals.push(familyMeal("dinner", familyMeals.satEvening === "bbq" ? "Family BBQ" : "Family sit-down dinner"));
      }
      if (isSunday && familyMeals.sunLunch !== "skip") {
        meals.push(familyMeal("lunch", familyMeals.sunLunch === "bbq" ? "Sunday BBQ" : "Sunday roast"));
      }

      // Kids track: Mon-Sat only, all three meals, except a slot already
      // covered by a family occasion above (see DECISIONS.md).
      if (!isSunday) {
        const familyCoveredSlots = meals.filter((m) => m.track === "family").map((m) => m.slot);
        if (!familyCoveredSlots.includes("breakfast")) meals.push(kidsMeal("breakfast", "Porridge with berries", i));
        if (!familyCoveredSlots.includes("lunch")) meals.push(kidsMeal("lunch", "Ham & cheese wrap", i));
        if (!familyCoveredSlots.includes("dinner")) meals.push(kidsMeal("dinner", "Pasta with pesto", i));
      }

      return { day: dayOfWeek, date, meals };
    }),
  };
}

function familyMeal(slot: "breakfast" | "lunch" | "dinner", title: string): MealPlanItem {
  return {
    slot,
    track: "family",
    title,
    servingsAdults: 2,
    servingsKids: 2,
    ingredients: [
      { name: "eggs", quantity: 6, unit: null, aisle: "Chilled & dairy" },
      { name: "bread", quantity: 1, unit: "loaf", aisle: "Bakery" },
    ],
    method: ["Prepare everything together.", "Serve family-style."],
    macrosPerAdultPortion: { kcal: 600, proteinG: 30, carbsG: 55, fatG: 25, fibreG: 6 },
    photoQuery: "family meal",
    batchCook: null,
  };
}

/** A freezer-batch example lives on Monday's kids dinner (i === 0) so the
 * mock exercises `freezerPortions` without adding to the leftover cap
 * (freezer portions are explicitly not same-week leftovers - see
 * DECISIONS.md). */
function kidsMeal(slot: "breakfast" | "lunch" | "dinner", title: string, dayIndex: number): MealPlanItem {
  return {
    slot,
    track: "kids",
    title,
    servingsAdults: 0,
    servingsKids: 2,
    ingredients: [
      { name: "pasta", quantity: 150, unit: "g", aisle: "Store cupboard" },
      { name: "pesto", quantity: 2, unit: "tbsp", aisle: "Store cupboard" },
    ],
    method: ["Cook the pasta.", "Stir through the sauce.", "Serve."],
    macrosPerAdultPortion: { kcal: 350, proteinG: 12, carbsG: 45, fatG: 12, fibreG: 4 },
    photoQuery: "kids pasta",
    batchCook:
      slot === "dinner" && dayIndex === 0
        ? { makes: 8, leftoverFor: [], freezerPortions: 4 }
        : null,
  };
}
