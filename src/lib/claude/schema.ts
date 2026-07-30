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
  slot: z.enum(["lunch", "dinner", "sunday_special"]),
});

export const mealSchema = z.object({
  slot: z.enum(["lunch", "dinner", "sunday_special"]),
  title: z.string(),
  servingsAdults: z.number().int().min(0),
  servingsKids: z.number().int().min(0),
  ingredients: z.array(ingredientSchema).min(1),
  method: z.array(z.string()).min(1).describe("Numbered method steps, one instruction per array entry."),
  macrosPerAdultPortion: macrosSchema,
  photoQuery: z.string().describe("2-4 word food-photo search query representing this dish, e.g. 'grilled chicken tray bake'."),
  batchCook: z
    .object({
      makes: z.number().int().min(1).describe("Total portions this recipe makes."),
      leftoverFor: z.array(leftoverForSchema),
    })
    .nullable()
    .describe("Set when this meal is cooked in bulk and reused later in the week; otherwise null."),
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
