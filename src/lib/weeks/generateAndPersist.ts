import { meals as mealsTable, type households, type WeekIntake } from "@/lib/db/schema";
import {
  finalizeWeek,
  getRecentFeedback,
  getRecentMealTitles,
  setWeekError,
} from "@/lib/db/queries";
import { generateWeekPlan, GenerationError } from "@/lib/claude/generate";
import { aggregateShoppingList, type MealForAggregation } from "@/lib/shopping/aggregate";
import { resolveAndCacheMealImage } from "@/lib/images/resolve";
import { resolveCanonicalIngredients } from "@/lib/ingredients/resolve";
import type { WeekPlan } from "@/lib/claude/schema";

type Household = typeof households.$inferSelect;

/** Shared by `/api/generate` (new week) and `/api/weeks/[weekId]/retry` (same
 * week, re-run) - the only difference between those two callers is where the
 * week row and its intake came from, not how generation/persistence works. */
export async function runWeekGeneration(params: {
  weekId: string;
  household: Household;
  weekStartDate: string;
  intake: WeekIntake;
}) {
  const { weekId, household, weekStartDate, intake } = params;
  try {
    const [recentTitles, recentFeedback] = await Promise.all([
      getRecentMealTitles(household.id),
      getRecentFeedback(household.id),
    ]);

    const plan = await generateWeekPlan({
      household,
      weekStartDate,
      intake,
      recentTitles,
      recentFeedback,
    });

    await persistPlan(weekId, plan);
  } catch (err) {
    console.error("Generation failed:", err);
    const message = err instanceof GenerationError ? err.message : "Generation failed unexpectedly.";
    await setWeekError(weekId, message);
  }
}

async function persistPlan(weekId: string, plan: WeekPlan) {
  // Resolve every ingredient name in this week's plan against the canonical
  // ingredients table before anything is persisted (MVP 1.1, see
  // DECISIONS.md) - both the `meals` rows and the derived shopping-list
  // aggregation should see the same canonical names, so this has to happen
  // before `mealRows`/aggregation are built, not after.
  const allIngredients = plan.days.flatMap((day) =>
    day.meals.flatMap((meal) => meal.ingredients.map((ing) => ({ name: ing.name, aisle: ing.aisle }))),
  );
  const resolved = await resolveCanonicalIngredients(allIngredients);

  const mealRows: (typeof mealsTable.$inferInsert)[] = [];

  for (const day of plan.days) {
    for (const meal of day.meals) {
      const canonicalIngredients = meal.ingredients.map((ing) => {
        const match = resolved.get(ing.name);
        return match
          ? { ...ing, name: match.name, aisle: match.aisle, canonicalIngredientId: match.canonicalIngredientId }
          : ing;
      });

      mealRows.push({
        weekId,
        dayDate: day.date,
        dayOfWeek: day.day,
        slot: meal.slot,
        track: meal.track,
        title: meal.title,
        servingsAdults: meal.servingsAdults,
        servingsKids: meal.servingsKids,
        ingredientsJson: canonicalIngredients,
        methodJson: meal.method,
        kcal: meal.macrosPerAdultPortion.kcal,
        proteinG: meal.macrosPerAdultPortion.proteinG,
        carbsG: meal.macrosPerAdultPortion.carbsG,
        fatG: meal.macrosPerAdultPortion.fatG,
        fibreG: meal.macrosPerAdultPortion.fibreG,
        batchMakes: meal.batchCook?.makes ?? null,
        leftoverForJson: meal.batchCook?.leftoverFor ?? null,
        freezerPortions: meal.batchCook?.freezerPortions ?? null,
      });
    }
  }

  // photoQuery isn't a DB column - keep it aligned to mealRows by index (the
  // insert preserves array order) so images can be resolved post-insert
  // without re-deriving or re-querying anything.
  const photoQueries = plan.days.flatMap((day) => day.meals.map((meal) => meal.photoQuery));
  let insertedMealsRef: (typeof mealsTable.$inferSelect)[] = [];

  await finalizeWeek(weekId, plan, mealRows, (insertedMeals) => {
    insertedMealsRef = insertedMeals;
    const forAggregation: MealForAggregation[] = insertedMeals.map((m) => ({
      id: m.id,
      title: m.title,
      dayDate: m.dayDate,
      dayOfWeek: m.dayOfWeek,
      slot: m.slot,
      ingredients: m.ingredientsJson,
    }));

    const items = aggregateShoppingList(forAggregation);
    return items.map((item) => ({
      weekId,
      productName: item.productName,
      quantity: item.quantity,
      unit: item.unit,
      displayQuantity: item.displayQuantity,
      aisle: item.aisle,
      usedInJson: item.usedIn,
    }));
  });

  await Promise.all(
    insertedMealsRef.map((meal, i) => resolveAndCacheMealImage(meal.id, photoQueries[i] ?? meal.title, meal.title)),
  );
}
