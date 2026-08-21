import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "./client";
import {
  feedback,
  freezerInventory,
  households,
  meals,
  shoppingItems,
  weeks,
  type FeedbackRating,
  type Ingredient,
  type LeftoverRef,
  type UsedInRef,
  type WeekIntake,
} from "./schema";

/** `noUncheckedIndexedAccess` can't know that `INSERT/UPDATE ... RETURNING`
 * for a single row always yields exactly one row - this documents that
 * invariant at the one place it's asserted instead of `!` scattered around. */
function firstOrThrow<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("Expected at least one row back from the database.");
  return row;
}

/** v1 is single-household; this fetches that row, creating sensible defaults
 * (§3) on first run so the app works before anyone visits /settings. */
export async function getOrCreateHousehold() {
  const existing = await db.select().from(households).limit(1);
  if (existing[0]) return existing[0];

  const created = await db.insert(households).values({}).returning();
  return firstOrThrow(created);
}

export async function updateHousehold(
  id: string,
  patch: Partial<{
    name: string;
    adults: number;
    kidsCount: number;
    satBreakfastDefaultMode: string;
    satEveningDefaultMode: string;
    sunLunchDefaultMode: string;
    familyAdults: number;
    familyKids: number;
    store: string;
    budgetDefault: string | null;
    favoriteProteins: string[];
  }>,
) {
  const updated = await db
    .update(households)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(households.id, id))
    .returning();
  return firstOrThrow(updated);
}

/** Recent dinner/lunch titles across the last `weeksBack` weeks, used both to
 * pre-fill "avoid repeating" suggestions in the intake form and to steer the
 * generation prompt away from repeats (PROJECT.md §3, §4). Adult + family
 * track only (MVP 1.2, see DECISIONS.md) - kids meals are expected/allowed
 * to repeat and shouldn't count against variety here. Legacy pre-MVP1.2
 * rows all default to `track: "adult"` (or are the old `sunday_special`
 * slot, also effectively family/adult), so they're naturally included. */
export async function getRecentMealTitles(householdId: string, weeksBack = 3) {
  const recentWeeks = await db
    .select({ id: weeks.id })
    .from(weeks)
    .where(and(eq(weeks.householdId, householdId), eq(weeks.status, "ready")))
    .orderBy(desc(weeks.weekStartDate), desc(weeks.createdAt))
    .limit(weeksBack);

  if (recentWeeks.length === 0) return [];

  const weekIds = recentWeeks.map((w) => w.id);
  const rows = await db
    .select({ title: meals.title, slot: meals.slot, dayDate: meals.dayDate, track: meals.track })
    .from(meals)
    .where(and(inArray(meals.weekId, weekIds), inArray(meals.track, ["adult", "family"])));

  // De-dupe titles, most recent first.
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const row of rows.sort((a, b) => (a.dayDate < b.dayDate ? 1 : -1))) {
    if (!seen.has(row.title)) {
      seen.add(row.title);
      titles.push(row.title);
    }
  }
  return titles;
}

/** Feedback history used to steer future generations (PROJECT.md §4 step 4). */
export async function getRecentFeedback(householdId: string, limit = 25) {
  const rows = await db
    .select({
      rating: feedback.rating,
      note: feedback.note,
      title: meals.title,
      createdAt: feedback.createdAt,
    })
    .from(feedback)
    .innerJoin(meals, eq(feedback.mealId, meals.id))
    .innerJoin(weeks, eq(feedback.weekId, weeks.id))
    .where(eq(weeks.householdId, householdId))
    .orderBy(desc(feedback.createdAt))
    .limit(limit);
  return rows;
}

export async function createWeek(householdId: string, weekStartDate: string, intake: WeekIntake) {
  const inserted = await db
    .insert(weeks)
    .values({ householdId, weekStartDate, intakeJson: intake, status: "generating" })
    .returning();
  return firstOrThrow(inserted);
}

export async function setWeekError(weekId: string, message: string) {
  await db.update(weeks).set({ status: "error", errorMessage: message }).where(eq(weeks.id, weekId));
}

export async function getWeekById(weekId: string) {
  const [week] = await db.select().from(weeks).where(eq(weeks.id, weekId));
  return week ?? null;
}

/** Resets a failed week back to "generating" so it can be retried in place
 * (MVP 1.1 bug fix - see DECISIONS.md's "Retry design") - reuses the
 * existing week row/id instead of creating a new one, so a retry doesn't
 * also add another same-date row to History. Also clears any meals/shopping
 * items that might exist from a partially-persisted prior attempt (normally
 * none, since a failed generation throws before any meal rows are inserted -
 * but cheap defensive cleanup against a partial-write edge case, given the
 * Neon HTTP driver doesn't support transactions, see DECISIONS.md). */
export async function resetWeekForRetry(weekId: string) {
  await db.delete(meals).where(eq(meals.weekId, weekId));
  await db.delete(shoppingItems).where(eq(shoppingItems.weekId, weekId));
  await db.update(weeks).set({ status: "generating", errorMessage: null }).where(eq(weeks.id, weekId));
}

export async function finalizeWeek(
  weekId: string,
  planJson: unknown,
  mealRows: (typeof meals.$inferInsert)[],
  buildShoppingItems: (
    insertedMeals: (typeof meals.$inferSelect)[],
  ) => (typeof shoppingItems.$inferInsert)[],
) {
  const insertedMeals = mealRows.length
    ? await db.insert(meals).values(mealRows).returning()
    : [];

  const items = buildShoppingItems(insertedMeals);
  if (items.length) {
    await db.insert(shoppingItems).values(items);
  }

  await db.update(weeks).set({ status: "ready", planJson }).where(eq(weeks.id, weekId));
}

export async function getWeekDetail(weekId: string) {
  const [week] = await db.select().from(weeks).where(eq(weeks.id, weekId));
  if (!week) return null;

  const weekMeals = await db
    .select()
    .from(meals)
    .where(eq(meals.weekId, weekId))
    .orderBy(meals.dayDate);

  const items = await db
    .select()
    .from(shoppingItems)
    .where(eq(shoppingItems.weekId, weekId))
    .orderBy(shoppingItems.aisle, shoppingItems.productName);

  const mealFeedback = weekMeals.length
    ? await db
        .select()
        .from(feedback)
        .where(inArray(feedback.mealId, weekMeals.map((m) => m.id)))
    : [];

  return { week, meals: weekMeals, shoppingItems: items, feedback: mealFeedback };
}

// Every list/latest query below orders by `weekStartDate` first (so History
// reads chronologically) with `createdAt` as a tiebreaker (see DECISIONS.md's
// "History page / duplicate-date bug: root cause") - two attempts at the
// same week (a retry, or just not editing the date field) share a
// `weekStartDate`, and without a tiebreaker the DB can return same-date rows
// in an arbitrary order instead of true recency.

export async function listWeeks(householdId: string, limit = 12) {
  return db
    .select()
    .from(weeks)
    .where(eq(weeks.householdId, householdId))
    .orderBy(desc(weeks.weekStartDate), desc(weeks.createdAt))
    .limit(limit);
}

export async function getLatestReadyWeek(householdId: string) {
  const [week] = await db
    .select()
    .from(weeks)
    .where(and(eq(weeks.householdId, householdId), eq(weeks.status, "ready")))
    .orderBy(desc(weeks.weekStartDate), desc(weeks.createdAt))
    .limit(1);
  return week ?? null;
}

export async function getLatestWeek(householdId: string) {
  const [week] = await db
    .select()
    .from(weeks)
    .where(eq(weeks.householdId, householdId))
    .orderBy(desc(weeks.weekStartDate), desc(weeks.createdAt))
    .limit(1);
  return week ?? null;
}

export async function addFeedback(mealId: string, weekId: string, rating: FeedbackRating, note?: string) {
  const inserted = await db.insert(feedback).values({ mealId, weekId, rating, note }).returning();
  return firstOrThrow(inserted);
}

export async function getMeal(mealId: string) {
  const [meal] = await db.select().from(meals).where(eq(meals.id, mealId));
  return meal ?? null;
}

/** All other meals in the same week as `mealId` - used by "swap this meal"
 * (see DECISIONS.md) to tell the generation prompt what not to duplicate. */
export async function getOtherMealsInWeek(weekId: string, excludeMealId: string) {
  return db
    .select()
    .from(meals)
    .where(and(eq(meals.weekId, weekId), ne(meals.id, excludeMealId)));
}

/** Every meal currently in a week - used to re-aggregate the shopping list
 * after "swap this meal" changes one meal's ingredients (see DECISIONS.md). */
export async function getMealsForWeek(weekId: string) {
  return db.select().from(meals).where(eq(meals.weekId, weekId));
}

/** "Swap this meal" (see DECISIONS.md) - replaces one meal's content in
 * place (same row/id, so feedback history stays attached to the same meal
 * the household is now looking at) rather than deleting and re-inserting. */
export async function replaceMealContent(
  mealId: string,
  patch: {
    title: string;
    servingsAdults: number;
    servingsKids: number;
    ingredientsJson: Ingredient[];
    methodJson: string[];
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fibreG: number;
  },
) {
  const updated = await db
    .update(meals)
    .set({
      ...patch,
      // A swapped-in meal never carries over the old meal's batch/leftover
      // relationship or cached photo - both describe the *old* dish (see
      // DECISIONS.md's "Swap this meal" entry on why batch-cook meals can't
      // be swapped at all, and the swap route re-resolves a fresh photo).
      batchMakes: null,
      leftoverForJson: null,
      freezerPortions: null,
      imageUrl: null,
      imageSource: null,
      imageCreditJson: null,
    })
    .where(eq(meals.id, mealId))
    .returning();
  return firstOrThrow(updated);
}

/** Replaces a week's whole shopping-list snapshot (see DECISIONS.md's "Swap
 * this meal" entry) - re-aggregated server-side from that week's current
 * meals after one meal's ingredients changed, same deterministic aggregation
 * `finalizeWeek` uses for a fresh generation, just re-run for one week
 * in place instead of as part of first persisting it. */
export async function replaceShoppingItemsForWeek(
  weekId: string,
  items: (typeof shoppingItems.$inferInsert)[],
) {
  await db.delete(shoppingItems).where(eq(shoppingItems.weekId, weekId));
  if (items.length) {
    await db.insert(shoppingItems).values(items);
  }
}

export async function setMealImage(
  mealId: string,
  image: { url: string; source: "unsplash" | "illustration"; credit?: { photographerName: string; photographerUrl: string; unsplashUrl: string } },
) {
  await db
    .update(meals)
    .set({ imageUrl: image.url, imageSource: image.source, imageCreditJson: image.credit ?? null })
    .where(eq(meals.id, mealId));
}

/** Ticking items off while shopping (MVP 1.1 "must-ship" CX item, see
 * DECISIONS.md) - persisted server-side so it survives a phone/laptop
 * switch mid-shop, not just client-only state. */
export async function setShoppingItemChecked(itemId: string, checked: boolean) {
  const updated = await db
    .update(shoppingItems)
    .set({ checked })
    .where(eq(shoppingItems.id, itemId))
    .returning();
  return updated[0] ?? null;
}

// --- Freezer inventory (backlog item, see DECISIONS.md) ---

/** Current freezer inventory for a household, newest-frozen first - what a
 * generation call sees, and what Settings shows. */
export async function getFreezerInventory(householdId: string) {
  return db
    .select()
    .from(freezerInventory)
    .where(eq(freezerInventory.householdId, householdId))
    .orderBy(desc(freezerInventory.createdAt));
}

/** Stocks the freezer from a meal's `batchCook.freezerPortions` at
 * generation-persist time (see `persistPlan`/`swapMealInPlace`). */
export async function addFreezerItem(
  householdId: string,
  itemName: string,
  portions: number,
  frozenFromWeekId: string | null = null,
) {
  const inserted = await db
    .insert(freezerInventory)
    .values({ householdId, itemName, portions, frozenFromWeekId })
    .returning();
  return firstOrThrow(inserted);
}

/** Looks up a freezer-inventory row by its exact name, for matching a
 * generation's `meal.usesFreezerItem` (given the exact name in the prompt)
 * back to the row to consume - see DECISIONS.md. */
export async function findFreezerItemByName(householdId: string, itemName: string) {
  const [row] = await db
    .select()
    .from(freezerInventory)
    .where(and(eq(freezerInventory.householdId, householdId), eq(freezerInventory.itemName, itemName)));
  return row ?? null;
}

/** Consumes `portions` from a freezer-inventory row when a generation uses
 * it (`meal.usesFreezerItem`) - deletes the row outright once it hits zero
 * rather than leaving a stale zero-portion row around. */
export async function consumeFreezerItem(id: string, portionsUsed: number) {
  const [row] = await db.select().from(freezerInventory).where(eq(freezerInventory.id, id));
  if (!row) return;

  const remaining = row.portions - portionsUsed;
  if (remaining <= 0) {
    await db.delete(freezerInventory).where(eq(freezerInventory.id, id));
  } else {
    await db.update(freezerInventory).set({ portions: remaining }).where(eq(freezerInventory.id, id));
  }
}

/** Manual "we ate/binned this" removal (Settings) - a household member
 * clearing an item without waiting for a future generation to consume it. */
export async function removeFreezerItem(id: string) {
  await db.delete(freezerInventory).where(eq(freezerInventory.id, id));
}

export type { Ingredient, LeftoverRef, UsedInRef };
