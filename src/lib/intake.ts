import { z } from "zod";

export const PROTEIN_TYPES = [
  "Chicken",
  "Beef",
  "Pork",
  "Fish & seafood",
  "Turkey",
  "Eggs",
  "Plant-based",
] as const;

// Nutrition goal, two independent axes (see DECISIONS.md's "Goals selector:
// two-axis redesign" entry). Calorie direction is single-select...
export const ENERGY_DIRECTIONS = ["lose_weight", "balanced", "build_muscle"] as const;
// ...food-quality focuses are zero-or-more and apply regardless of
// direction - protein supports both weight loss and muscle building, and
// cholesterol-lowering has no relationship to calorie direction at all.
export const NUTRITION_FOCUSES = ["increase_protein", "reduce_cholesterol"] as const;

// The three family meal occasions (MVP 1.2, see DECISIONS.md) - Saturday
// breakfast has no "bbq" option (a BBQ breakfast doesn't make sense), the
// other two keep the full sit-down/BBQ/skip set from MVP1's Sunday mode.
export const familyMealsSchema = z.object({
  satBreakfast: z.enum(["sit_down", "skip"]),
  satEvening: z.enum(["sit_down", "bbq", "skip"]),
  sunLunch: z.enum(["sit_down", "bbq", "skip"]),
});

// Which meal-times a track needs this week (MVP 2.1, see DECISIONS.md) -
// lets adults optionally get a breakfast, and lets the kids track be
// skipped entirely by toggling all three off.
export const mealTimesNeededSchema = z.object({
  breakfast: z.boolean(),
  lunch: z.boolean(),
  dinner: z.boolean(),
});

export const weekIntakeSchema = z.object({
  // The date the household's shop/order arrives - day 1 of the plan (see
  // DECISIONS.md's "Calendar-based days selection" entry). No longer assumed
  // to be a Monday - `numDays` below covers however long that shop needs to
  // last, starting from whatever day it actually lands on.
  weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date (yyyy-mm-dd)."),
  // Replaces the old 3-preset `daysMode` ("full_week"/"weekdays_only"/
  // "mon_to_sat") - the day count now comes from how long a shop needs to
  // cover, not a fixed calendar-week shape. 14 is a generous cap - beyond
  // that a single shop realistically isn't still covering fresh ingredients.
  numDays: z.number().int().min(1).max(14),
  // Optional, display-only reminder of what time the order lands (e.g.
  // "18:00") - never affects which meals get planned (see DECISIONS.md).
  deliveryTime: z.string().default(""),
  familyMeals: familyMealsSchema,
  // Defaults match pre-MVP2.1 behaviour exactly (adults: lunch+dinner, no
  // breakfast; kids: all three) if the client ever omits these fields.
  parentMeals: mealTimesNeededSchema.default({ breakfast: false, lunch: true, dinner: true }),
  kidsMeals: mealTimesNeededSchema.default({ breakfast: true, lunch: true, dinner: true }),
  dishStyles: z.array(z.string()).default([]),
  // Proteins to actually use this week - defaults to all of them (nothing
  // excluded) if the client ever omits the field.
  proteins: z.array(z.string()).default([...PROTEIN_TYPES]),
  avoidRepeating: z.array(z.string()).default([]),
  budget: z.string().default(""),
  effort: z.enum(["quick", "mixed", "more_cooking"]),
  notes: z.string().default(""),
  // Defaults to the same framing v1's hardcoded nutrition rule always used
  // (see DECISIONS.md) if the client ever omits either field.
  energyDirection: z.enum(ENERGY_DIRECTIONS).default("lose_weight"),
  focuses: z.array(z.enum(NUTRITION_FOCUSES)).default([]),
});

export type WeekIntakeInput = z.infer<typeof weekIntakeSchema>;

/** Defaults the intake form's calendar picker to today, so starting a new
 * week is a single confirm tap unless the actual delivery date is later. */
export function todayISO(from: Date = new Date()): string {
  return from.toISOString().slice(0, 10);
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** `Date.getDay()` is provably 0-6, but its return type is plain `number` -
 * this cast is what lets tuple indexing stay non-optional under
 * `noUncheckedIndexedAccess` instead of forcing `| undefined` everywhere. */
function dayName(date: Date): string {
  return DAY_NAMES[date.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6];
}

/** Expands an intake's numDays + weekStartDate (the delivery date) into the
 * concrete list of (date, dayOfWeek) pairs the generation prompt should plan
 * for - starting from whatever day the shop actually lands on, not
 * necessarily a Monday (see DECISIONS.md's "Calendar-based days selection"
 * entry). The family-occasion (Saturday/Sunday) and kids-track (Mon-Sat)
 * logic elsewhere already keys off `dayOfWeek` rather than position, so it
 * needs no change here to keep working for an arbitrary start day/length -
 * including a >7-day span that spans two Saturdays/Sundays. */
export function daysForIntake(intake: Pick<WeekIntakeInput, "weekStartDate" | "numDays">) {
  const start = new Date(`${intake.weekStartDate}T00:00:00`);
  const count = intake.numDays;

  return Array.from({ length: count }, (_, i) => {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    return { date: date.toISOString().slice(0, 10), dayOfWeek: dayName(date) };
  });
}
