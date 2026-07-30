import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./client";
import {
  feedback,
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

/** v1 is single-household; this fetches that row, creating sensible defaults
 * (§3) on first run so the app works before anyone visits /settings. */
export async function getOrCreateHousehold() {
  const existing = await db.select().from(households).limit(1);
  if (existing[0]) return existing[0];

  const [created] = await db.insert(households).values({}).returning();
  return created;
}

export async function updateHousehold(
  id: string,
  patch: Partial<{
    name: string;
    adults: number;
    kidsCount: number;
    sundayDefaultMode: string;
    sundayAdults: number;
    sundayKids: number;
    store: string;
    budgetDefault: string | null;
  }>,
) {
  const [updated] = await db
    .update(households)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(households.id, id))
    .returning();
  return updated;
}

/** Recent dinner/lunch titles across the last `weeksBack` weeks, used both to
 * pre-fill "avoid repeating" suggestions in the intake form and to steer the
 * generation prompt away from repeats (PROJECT.md §3, §4). */
export async function getRecentMealTitles(householdId: string, weeksBack = 3) {
  const recentWeeks = await db
    .select({ id: weeks.id })
    .from(weeks)
    .where(and(eq(weeks.householdId, householdId), eq(weeks.status, "ready")))
    .orderBy(desc(weeks.weekStartDate))
    .limit(weeksBack);

  if (recentWeeks.length === 0) return [];

  const weekIds = recentWeeks.map((w) => w.id);
  const rows = await db
    .select({ title: meals.title, slot: meals.slot, dayDate: meals.dayDate })
    .from(meals)
    .where(inArray(meals.weekId, weekIds));

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
  const [week] = await db
    .insert(weeks)
    .values({ householdId, weekStartDate, intakeJson: intake, status: "generating" })
    .returning();
  return week;
}

export async function setWeekError(weekId: string, message: string) {
  await db.update(weeks).set({ status: "error", errorMessage: message }).where(eq(weeks.id, weekId));
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

export async function listWeeks(householdId: string, limit = 12) {
  return db
    .select()
    .from(weeks)
    .where(eq(weeks.householdId, householdId))
    .orderBy(desc(weeks.weekStartDate))
    .limit(limit);
}

export async function getLatestReadyWeek(householdId: string) {
  const [week] = await db
    .select()
    .from(weeks)
    .where(and(eq(weeks.householdId, householdId), eq(weeks.status, "ready")))
    .orderBy(desc(weeks.weekStartDate))
    .limit(1);
  return week ?? null;
}

export async function getLatestWeek(householdId: string) {
  const [week] = await db
    .select()
    .from(weeks)
    .where(eq(weeks.householdId, householdId))
    .orderBy(desc(weeks.weekStartDate))
    .limit(1);
  return week ?? null;
}

export async function addFeedback(mealId: string, weekId: string, rating: FeedbackRating, note?: string) {
  const [row] = await db.insert(feedback).values({ mealId, weekId, rating, note }).returning();
  return row;
}

export async function getMeal(mealId: string) {
  const [meal] = await db.select().from(meals).where(eq(meals.id, mealId));
  return meal ?? null;
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

export type { Ingredient, LeftoverRef, UsedInRef };
