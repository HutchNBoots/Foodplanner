import { meals as mealsTable, type households, type WeekIntake } from "@/lib/db/schema";
import {
  addFreezerItem,
  consumeFreezerItem,
  deleteMeal,
  finalizeWeek,
  findFreezerItemByName,
  getFreezerInventory,
  getHouseholdById,
  getMeal,
  getMealsForWeek,
  getOtherMealsInWeek,
  getRecentFeedback,
  getRecentMealTitles,
  getWeekById,
  replaceMealContent,
  replaceShoppingItemsForWeek,
  setWeekError,
} from "@/lib/db/queries";
import { generateSwapMeal, generateWeekPlan, GenerationError } from "@/lib/claude/generate";
import { aggregateShoppingList, type MealForAggregation } from "@/lib/shopping/aggregate";
import { resolveAndCacheMealImage } from "@/lib/images/resolve";
import { resolveCanonicalIngredients } from "@/lib/ingredients/resolve";
import type { WeekPlan } from "@/lib/claude/schema";

type Household = typeof households.$inferSelect;

/** Distinct from `GenerationError` (a failed Claude call) - these are
 * "this request doesn't make sense" cases caught before any generation is
 * attempted, so the API route can return 409 rather than 500/502. */
export class SwapNotAllowedError extends Error {}

/** Same "request doesn't make sense" 409 pattern as `SwapNotAllowedError`,
 * kept as its own class rather than reused - `deleteMealInPlace` never
 * calls generation at all, so naming it after "swap" would be misleading
 * even though the failure conditions largely overlap (both reject a
 * batch-cook source, for the same leftover-stranding reason). */
export class DeleteNotAllowedError extends Error {}

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
    const [recentTitles, recentFeedback, freezerInventory] = await Promise.all([
      getRecentMealTitles(household.id),
      getRecentFeedback(household.id),
      getFreezerInventory(household.id),
    ]);

    const plan = await generateWeekPlan({
      household,
      weekStartDate,
      intake,
      recentTitles,
      recentFeedback,
      freezerInventory: freezerInventory.map((f) => ({ itemName: f.itemName, portions: f.portions })),
    });

    await persistPlan(weekId, household.id, plan);
  } catch (err) {
    console.error("Generation failed:", err);
    const message = err instanceof GenerationError ? err.message : "Generation failed unexpectedly.";
    await setWeekError(weekId, message);
  }
}

async function persistPlan(weekId: string, householdId: string, plan: WeekPlan) {
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
        usesFreezerItem: meal.usesFreezerItem ?? null,
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

  // Freezer inventory tracking (backlog item, see DECISIONS.md) - stock new
  // batches this generation froze, and consume whatever it chose to reheat
  // from what was already in the freezer. Sequential per-meal awaits (not
  // Promise.all) since a meal that both stocks and later gets referenced
  // isn't possible within one generation, but consuming needs to read the
  // current row before writing it, and there's no transaction support here
  // (Neon HTTP driver, see DECISIONS.md) to make concurrent read-then-write
  // safe against itself.
  for (const meal of insertedMealsRef) {
    if (meal.freezerPortions) {
      await addFreezerItem(householdId, meal.title, meal.freezerPortions, weekId);
    }
    if (meal.usesFreezerItem) {
      const match = await findFreezerItemByName(householdId, meal.usesFreezerItem);
      if (match) {
        await consumeFreezerItem(match.id, meal.servingsAdults + meal.servingsKids);
      }
    }
  }
}

/** "Swap this meal" backlog feature (see DECISIONS.md) - regenerates one
 * meal in an already-`ready` week and re-aggregates the whole week's
 * shopping list from its (now-changed) meals, without touching any other
 * meal or the week's own status/planJson. Runs synchronously in the request
 * (unlike full-week generation's `after()` background call) since a
 * single-meal call is small/fast enough not to need the same treatment -
 * see the API route for why. */
export async function swapMealInPlace(mealId: string) {
  const meal = await getMeal(mealId);
  if (!meal) throw new SwapNotAllowedError("Meal not found.");

  // A batch-cook source's leftovers are described only on *this* row
  // (`leftoverForJson`) - other days' meal rows don't reference it back, so
  // swapping it away would silently strand whatever those days' rows say
  // about "using Monday's batch" with no batch left to describe. Simplest
  // safe rule: don't allow it, rather than trying to keep a swapped-in
  // meal's batch/leftover shape in exact sync with rows this call doesn't
  // touch (see DECISIONS.md for the fuller reasoning).
  if (meal.batchMakes) {
    throw new SwapNotAllowedError(
      "This meal is a batch-cook that other days rely on as leftovers - swap one of those meals instead, or regenerate the whole week.",
    );
  }

  const week = await getWeekById(meal.weekId);
  if (!week || week.status !== "ready") {
    throw new SwapNotAllowedError("This week isn't ready to swap meals in yet.");
  }

  const household = await getHouseholdById(week.householdId);
  if (!household) {
    throw new SwapNotAllowedError("This week's household no longer exists.");
  }
  const [otherMeals, recentTitles] = await Promise.all([
    getOtherMealsInWeek(week.id, mealId),
    getRecentMealTitles(household.id),
  ]);

  const newMeal = await generateSwapMeal({
    household,
    intake: week.intakeJson,
    currentMeal: {
      slot: meal.slot,
      track: meal.track,
      title: meal.title,
      servingsAdults: meal.servingsAdults,
      servingsKids: meal.servingsKids,
    },
    otherTitlesThisWeek: otherMeals.map((m) => m.title),
    recentTitles,
  });

  const resolved = await resolveCanonicalIngredients(
    newMeal.ingredients.map((ing) => ({ name: ing.name, aisle: ing.aisle })),
  );
  const canonicalIngredients = newMeal.ingredients.map((ing) => {
    const match = resolved.get(ing.name);
    return match
      ? { ...ing, name: match.name, aisle: match.aisle, canonicalIngredientId: match.canonicalIngredientId }
      : ing;
  });

  await replaceMealContent(mealId, {
    title: newMeal.title,
    servingsAdults: newMeal.servingsAdults,
    servingsKids: newMeal.servingsKids,
    ingredientsJson: canonicalIngredients,
    methodJson: newMeal.method,
    kcal: newMeal.macrosPerAdultPortion.kcal,
    proteinG: newMeal.macrosPerAdultPortion.proteinG,
    carbsG: newMeal.macrosPerAdultPortion.carbsG,
    fatG: newMeal.macrosPerAdultPortion.fatG,
    fibreG: newMeal.macrosPerAdultPortion.fibreG,
  });

  await resolveAndCacheMealImage(mealId, newMeal.photoQuery, newMeal.title);

  // Re-aggregate the whole week's shopping list now that one meal's
  // ingredients changed - same deterministic aggregation a fresh generation
  // uses, just re-run in place for one week (see DECISIONS.md).
  await reaggregateShoppingList(week.id);
}

/** Shared by `swapMealInPlace` and `deleteMealInPlace` - re-derives the
 * whole week's shopping list from whatever meals currently exist for it
 * (same deterministic aggregation a fresh generation uses) and replaces
 * `shopping_items` with the result. Called after any change to a week's
 * meals that could affect ingredient totals. */
async function reaggregateShoppingList(weekId: string) {
  const allWeekMeals = await getMealsForWeek(weekId);
  const forAggregation: MealForAggregation[] = allWeekMeals.map((m) => ({
    id: m.id,
    title: m.title,
    dayDate: m.dayDate,
    dayOfWeek: m.dayOfWeek,
    slot: m.slot,
    ingredients: m.ingredientsJson,
  }));
  const items = aggregateShoppingList(forAggregation);
  await replaceShoppingItemsForWeek(
    weekId,
    items.map((item) => ({
      weekId,
      productName: item.productName,
      quantity: item.quantity,
      unit: item.unit,
      displayQuantity: item.displayQuantity,
      aisle: item.aisle,
      usedInJson: item.usedIn,
    })),
  );
}

/** "Delete this meal" backlog feature (see DECISIONS.md) - removes a single
 * meal from an already-`ready` week and re-aggregates the shopping list
 * from whatever's left, without touching any other meal or the week's own
 * status/planJson. Same batch-cook restriction as `swapMealInPlace`, same
 * reasoning: a batch-cook source's leftovers are described only on *this*
 * row, so deleting it would silently strand whatever other days' rows say
 * about "using this batch." `feedback` rows for the deleted meal cascade
 * via FK, no separate cleanup needed. */
export async function deleteMealInPlace(mealId: string) {
  const meal = await getMeal(mealId);
  if (!meal) throw new DeleteNotAllowedError("Meal not found.");

  if (meal.batchMakes) {
    throw new DeleteNotAllowedError(
      "This meal is a batch-cook that other days rely on as leftovers - deleting it would strand those days. Swap it for something else instead, or regenerate the whole week.",
    );
  }

  const week = await getWeekById(meal.weekId);
  if (!week || week.status !== "ready") {
    throw new DeleteNotAllowedError("This week isn't ready to delete meals from yet.");
  }

  await deleteMeal(mealId);
  await reaggregateShoppingList(week.id);
}
