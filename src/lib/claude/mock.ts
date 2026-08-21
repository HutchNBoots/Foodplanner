import { daysForIntake } from "@/lib/intake";
import type { FamilyMeals, MealTimesNeeded, WeekIntake } from "@/lib/db/schema";
import type { MealPlanItem, WeekPlan } from "./schema";

/** Deterministic stand-in for a real Claude call, used when `MOCK_GENERATION=1`
 * (set by the e2e smoke test - see DECISIONS.md on why generation is mocked
 * there rather than hitting a live API). Shape matches `weekPlanSchema`
 * exactly so it exercises the same persistence/aggregation/image-resolution
 * code a real response would, including MVP 1.2's adult/kids/family tracks,
 * the leftover cap, and MVP 2.1's per-track meal-time toggles. */
export function buildMockWeekPlan(params: {
  weekStartDate: string;
  daysMode: WeekIntake["daysMode"];
  familyMeals: FamilyMeals;
  parentMeals: MealTimesNeeded;
  kidsMeals: MealTimesNeeded;
}): WeekPlan {
  const days = daysForIntake(params);
  const { familyMeals, parentMeals, kidsMeals } = params;

  return {
    summary: "A mocked week of meals for testing - no live Claude call was made.",
    days: days.map(({ date, dayOfWeek }, i) => {
      const meals: MealPlanItem[] = [];
      const isSaturday = dayOfWeek === "Saturday";
      const isSunday = dayOfWeek === "Sunday";

      // Family track first - a family occasion REPLACES the separate
      // adult/kids meal for that day/slot, it doesn't add to it (see
      // DECISIONS.md's MVP 1.2 "Skip semantics" entry), so the adult/kids
      // sections below need to know which slots are already covered.
      const familyBreakfast = isSaturday && familyMeals.satBreakfast !== "skip";
      const familyDinner = isSaturday && familyMeals.satEvening !== "skip";
      const familyLunch = isSunday && familyMeals.sunLunch !== "skip";

      if (familyBreakfast) meals.push(familyMeal("breakfast", "Family pancake breakfast"));
      if (familyDinner) {
        meals.push(familyMeal("dinner", familyMeals.satEvening === "bbq" ? "Family BBQ" : "Family sit-down dinner"));
      }
      if (familyLunch) {
        meals.push(familyMeal("lunch", familyMeals.sunLunch === "bbq" ? "Sunday BBQ" : "Sunday roast"));
      }

      // Adult track: per this week's requested meal-times (MVP 2.1), minus
      // whatever's family-covered today. Lunch is intentionally not modelled
      // as its own meal object here (same as pre-MVP2.1) - weekday lunches
      // are frequently just a reference to an earlier batch-cook via
      // leftoverFor, not a distinct recipe, so the lunch toggle has nothing
      // concrete to add/remove in this simplified mock.
      if (parentMeals.breakfast && !familyBreakfast) {
        meals.push(adultBreakfast(i));
      }
      if (parentMeals.dinner && !familyDinner) {
        meals.push({
          slot: "dinner",
          track: "adult",
          title: i === 0 ? "Batch-cooked chicken tray bake" : `Test dinner ${i + 1}`,
          servingsAdults: 2,
          servingsKids: 0,
          ingredients: [
            { name: "chicken breast", quantity: 400, unit: "g", aisle: "Meat & fish", cholesterolLowering: false },
            { name: "mixed vegetables", quantity: 300, unit: "g", aisle: "Fresh produce", cholesterolLowering: true },
          ],
          method: ["Preheat the oven.", "Roast everything together.", "Serve."],
          macrosPerAdultPortion: { kcal: 520, proteinG: 38, carbsG: 40, fatG: 18, fibreG: 8 },
          photoQuery: "chicken tray bake",
          batchCook:
            i === 0
              ? { makes: 4, leftoverFor: [{ day: days[2]?.dayOfWeek ?? dayOfWeek, slot: "lunch" }], freezerPortions: null }
              : null,
        });
      }

      // Kids track: Mon-Sat only, per this week's requested meal-times
      // (MVP 2.1 - can be skipped entirely by toggling all three off),
      // minus whatever's family-covered today (lunch is never
      // family-covered for kids - the only family lunch occasion is
      // Sunday, and kids don't get a separate Sunday meal at all anyway).
      if (!isSunday) {
        if (kidsMeals.breakfast && !familyBreakfast) meals.push(kidsMeal("breakfast", "Porridge with berries", i));
        if (kidsMeals.lunch) meals.push(kidsMeal("lunch", "Ham & cheese wrap", i));
        if (kidsMeals.dinner && !familyDinner) meals.push(kidsMeal("dinner", "Pasta with pesto", i));
      }

      return { day: dayOfWeek, date, meals };
    }),
  };
}

function adultBreakfast(dayIndex: number): MealPlanItem {
  return {
    slot: "breakfast",
    track: "adult",
    title: dayIndex === 0 ? "Scrambled eggs on toast" : `Adult breakfast ${dayIndex + 1}`,
    servingsAdults: 2,
    servingsKids: 0,
    ingredients: [
      { name: "eggs", quantity: 4, unit: null, aisle: "Chilled & dairy", cholesterolLowering: false },
      { name: "bread", quantity: 1, unit: "loaf", aisle: "Bakery", cholesterolLowering: false },
    ],
    method: ["Toast the bread.", "Scramble the eggs.", "Serve together."],
    macrosPerAdultPortion: { kcal: 380, proteinG: 24, carbsG: 30, fatG: 18, fibreG: 4 },
    photoQuery: "scrambled eggs toast",
    batchCook: null,
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
      { name: "eggs", quantity: 6, unit: null, aisle: "Chilled & dairy", cholesterolLowering: false },
      { name: "bread", quantity: 1, unit: "loaf", aisle: "Bakery", cholesterolLowering: false },
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
      { name: "pasta", quantity: 150, unit: "g", aisle: "Store cupboard", cholesterolLowering: false },
      { name: "pesto", quantity: 2, unit: "tbsp", aisle: "Store cupboard", cholesterolLowering: false },
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
