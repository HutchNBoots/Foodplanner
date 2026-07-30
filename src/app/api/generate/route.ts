import { NextResponse, after } from "next/server";
import { meals as mealsTable } from "@/lib/db/schema";
import {
  createWeek,
  finalizeWeek,
  getOrCreateHousehold,
  getRecentFeedback,
  getRecentMealTitles,
  setWeekError,
} from "@/lib/db/queries";
import { weekIntakeSchema } from "@/lib/intake";
import { generateWeekPlan, GenerationError } from "@/lib/claude/generate";
import { aggregateShoppingList, type MealForAggregation } from "@/lib/shopping/aggregate";
import { resolveAndCacheMealImage } from "@/lib/images/resolve";
import type { WeekPlan } from "@/lib/claude/schema";

export const maxDuration = 300;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = weekIntakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const intake = parsed.data;

  const household = await getOrCreateHousehold();
  const week = await createWeek(household.id, intake.weekStartDate, intake);

  // The Claude call + per-meal image lookups can comfortably take longer
  // than is pleasant to hold a request open for on a phone connection.
  // Respond immediately with the week id; the client polls /api/weeks/[id]
  // for status while this continues in the background (PROJECT.md §4 step 2
  // explicitly calls for a loading state here).
  after(async () => {
    try {
      const [recentTitles, recentFeedback] = await Promise.all([
        getRecentMealTitles(household.id),
        getRecentFeedback(household.id),
      ]);

      const plan = await generateWeekPlan({
        household,
        weekStartDate: intake.weekStartDate,
        intake,
        recentTitles,
        recentFeedback,
      });

      await persistPlan(week.id, plan);
    } catch (err) {
      console.error("Generation failed:", err);
      const message = err instanceof GenerationError ? err.message : "Generation failed unexpectedly.";
      await setWeekError(week.id, message);
    }
  });

  return NextResponse.json({ weekId: week.id }, { status: 202 });
}

async function persistPlan(weekId: string, plan: WeekPlan) {
  const mealRows: (typeof mealsTable.$inferInsert)[] = [];

  for (const day of plan.days) {
    for (const meal of day.meals) {
      mealRows.push({
        weekId,
        dayDate: day.date,
        dayOfWeek: day.day,
        slot: meal.slot,
        title: meal.title,
        servingsAdults: meal.servingsAdults,
        servingsKids: meal.servingsKids,
        ingredientsJson: meal.ingredients,
        methodJson: meal.method,
        kcal: meal.macrosPerAdultPortion.kcal,
        proteinG: meal.macrosPerAdultPortion.proteinG,
        carbsG: meal.macrosPerAdultPortion.carbsG,
        fatG: meal.macrosPerAdultPortion.fatG,
        fibreG: meal.macrosPerAdultPortion.fibreG,
        batchMakes: meal.batchCook?.makes ?? null,
        leftoverForJson: meal.batchCook?.leftoverFor ?? null,
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
