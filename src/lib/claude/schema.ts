import { z } from "zod";

export const AISLES = [
  "Fresh produce",
  "Meat & fish",
  "Chilled & dairy",
  "Store cupboard",
  "Frozen",
  "Bakery",
  "Other",
] as const;

export const ingredientSchema = z.object({
  name: z.string().describe("Clean, searchable product name, e.g. 'chicken breast', not a sentence."),
  quantity: z.number().nullable().describe("Numeric quantity for this meal, e.g. 400. Null if not quantifiable (e.g. 'salt, to taste')."),
  unit: z.string().nullable().describe("Unit for the quantity, e.g. 'g', 'ml', 'tin', 'clove'. Null if quantity is null."),
  aisle: z.enum(AISLES).describe("Supermarket aisle this ingredient is found in."),
});

export const macrosSchema = z.object({
  kcal: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  fibreG: z.number(),
});

export const leftoverForSchema = z.object({
  day: z.string().describe("Day name this leftover is eaten on, e.g. 'Wednesday'."),
  slot: z.enum(["breakfast", "lunch", "dinner"]),
});

export const mealSchema = z.object({
  slot: z.enum(["breakfast", "lunch", "dinner"]),
  /** Whose meal this is (MVP 1.2, see DECISIONS.md) - "adult" for the
   * standing adult plan, "kids" for the separate Mon-Sat kids track, "family"
   * for the three shared family occasions (Saturday breakfast/evening,
   * Sunday lunch). Powers the Parents/Kids/Family recipe-view tabs. */
  track: z.enum(["adult", "kids", "family"]),
  title: z.string(),
  servingsAdults: z.number().int().min(0),
  servingsKids: z.number().int().min(0),
  ingredients: z.array(ingredientSchema).min(1),
  method: z.array(z.string()).min(1).describe("Numbered method steps, one instruction per array entry."),
  macrosPerAdultPortion: macrosSchema.describe(
    "Per-portion macro estimate for whoever eats this meal - an adult portion for 'adult'/'family' meals, a kid portion for 'kids' meals (kids meals should reflect balanced age-appropriate nutrition, not the adult deficit/high-protein framing).",
  ),
  photoQuery: z.string().describe("2-4 word food-photo search query representing this dish, e.g. 'grilled chicken tray bake'."),
  batchCook: z
    .object({
      makes: z.number().int().min(1).describe("Total portions this recipe makes - size ingredient quantities to cover this many portions, including any being frozen (see freezerPortions)."),
      leftoverFor: z
        .array(leftoverForSchema)
        .describe("Same-week day/slots that eat this batch's leftovers instead of a freshly-cooked meal. Counts toward the household's weekly leftover cap (max 2 across the whole plan) - do not exceed it."),
      freezerPortions: z
        .number()
        .int()
        .min(0)
        .nullable()
        .describe("Portions of this batch being frozen for a future week (not eaten this week, not in leftoverFor). Null/0 if nothing is being frozen."),
    })
    .nullable()
    .describe("Set when this meal is cooked in bulk and reused later in the week and/or frozen; otherwise null."),
});

export const dayPlanSchema = z.object({
  day: z.string().describe("e.g. 'Monday'"),
  date: z.string().describe("ISO date yyyy-mm-dd"),
  meals: z.array(mealSchema).min(1),
});

export const weekPlanSchema = z.object({
  summary: z.string().describe("1-2 sentence summary of this week's plan/theme for the user."),
  days: z.array(dayPlanSchema).min(1),
});

export type Ingredient = z.infer<typeof ingredientSchema>;
export type Macros = z.infer<typeof macrosSchema>;
export type MealPlanItem = z.infer<typeof mealSchema>;
export type DayPlan = z.infer<typeof dayPlanSchema>;
export type WeekPlan = z.infer<typeof weekPlanSchema>;

/** JSON Schema for the Claude tool-use call, derived from the same Zod schema
 * used to validate the response - single source of truth (see DECISIONS.md). */
export function weekPlanToolInputSchema() {
  const schema = z.toJSONSchema(weekPlanSchema, { target: "draft-7" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

export const MAX_LEFTOVER_SLOTS = 2;

/** Counts leftover meal-slots across the whole plan (adult + kids + family
 * tracks combined, per the requirement) - MVP 1.2's weekly leftover cap, see
 * DECISIONS.md for why `batchCook.leftoverFor.length` is exactly the right
 * thing to count. */
export function countLeftoverSlots(plan: WeekPlan): number {
  return plan.days.reduce(
    (sum, day) => sum + day.meals.reduce((s, meal) => s + (meal.batchCook?.leftoverFor.length ?? 0), 0),
    0,
  );
}
