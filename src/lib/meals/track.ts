import type { meals } from "@/lib/db/schema";

type Meal = typeof meals.$inferSelect;

export type MealTrack = "adult" | "kids" | "family";

/** Whose meal this is (MVP 1.2, see DECISIONS.md) - powers the Parents/Kids/
 * Family recipe-view tabs and scopes the week nutrition summary to
 * adult+family only. Legacy pre-MVP1.2 rows (`slot: "sunday_special"`)
 * predate the `track` column and default to "adult" at the DB level, but
 * were actually the one family occasion that existed then - classified back
 * to "family" here, at render/filter time, rather than rewriting historical
 * rows (see DECISIONS.md's "Data model" entry). */
export function trackForMeal(meal: Pick<Meal, "slot" | "track">): MealTrack {
  if (meal.slot === "sunday_special") return "family";
  return meal.track as MealTrack;
}
