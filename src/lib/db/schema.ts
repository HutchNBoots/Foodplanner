import { pgTable, text, integer, real, jsonb } from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString());

/** Standing household context (§3, §8). Single row for v1, but modeled as a
 * table (not env vars) since it's explicitly required to be settings-editable
 * and is the natural extension point for multi-household support (§9). */
export const households = pgTable("households", {
  id: id(),
  name: text("name").notNull().default("Our household"),
  adults: integer("adults").notNull().default(2),
  kidsCount: integer("kids_count").notNull().default(2),
  /** "sit_down" | "bbq" | "skip" - the default, overridable per-week in intake */
  sundayDefaultMode: text("sunday_default_mode").notNull().default("sit_down"),
  sundayAdults: integer("sunday_adults").notNull().default(2),
  sundayKids: integer("sunday_kids").notNull().default(2),
  store: text("store").notNull().default("Sainsbury's"),
  budgetDefault: text("budget_default"),
  createdAt: createdAt(),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

/** One row per generated week. `intakeJson` / `planJson` are the raw
 * request/response - see DECISIONS.md for why these coexist with `meals`. */
export const weeks = pgTable("weeks", {
  id: id(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  weekStartDate: text("week_start_date").notNull(),
  status: text("status").notNull().default("generating").$type<"generating" | "ready" | "error">(),
  errorMessage: text("error_message"),
  intakeJson: jsonb("intake_json").notNull().$type<WeekIntake>(),
  planJson: jsonb("plan_json").$type<unknown>(),
  createdAt: createdAt(),
});

/** Normalized meal instances - one row per meal/day, used for history,
 * repeat-avoidance queries and feedback joins (see DECISIONS.md). */
export const meals = pgTable("meals", {
  id: id(),
  weekId: text("week_id")
    .notNull()
    .references(() => weeks.id, { onDelete: "cascade" }),
  dayDate: text("day_date").notNull(),
  dayOfWeek: text("day_of_week").notNull(),
  /** "lunch" | "dinner" | "sunday_special" */
  slot: text("slot").notNull().$type<"lunch" | "dinner" | "sunday_special">(),
  title: text("title").notNull(),
  servingsAdults: integer("servings_adults").notNull(),
  servingsKids: integer("servings_kids").notNull().default(0),
  ingredientsJson: jsonb("ingredients_json").notNull().$type<Ingredient[]>(),
  methodJson: jsonb("method_json").notNull().$type<string[]>(),
  kcal: real("kcal").notNull(),
  proteinG: real("protein_g").notNull(),
  carbsG: real("carbs_g").notNull(),
  fatG: real("fat_g").notNull(),
  fibreG: real("fibre_g").notNull(),
  imageUrl: text("image_url"),
  imageCreditJson: jsonb("image_credit_json").$type<ImageCredit>(),
  imageSource: text("image_source").$type<"unsplash" | "illustration">(),
  batchMakes: integer("batch_makes"),
  leftoverForJson: jsonb("leftover_for_json").$type<LeftoverRef[]>(),
  createdAt: createdAt(),
});

export const feedback = pgTable("feedback", {
  id: id(),
  mealId: text("meal_id")
    .notNull()
    .references(() => meals.id, { onDelete: "cascade" }),
  weekId: text("week_id")
    .notNull()
    .references(() => weeks.id, { onDelete: "cascade" }),
  /** "loved" | "too_much_effort" | "too_bland" | "repeat" */
  rating: text("rating").notNull().$type<FeedbackRating>(),
  note: text("note"),
  createdAt: createdAt(),
});

/** Derived server-side at generation time from `meals.ingredientsJson`
 * (see DECISIONS.md) - not generated directly by Claude. */
export const shoppingItems = pgTable("shopping_items", {
  id: id(),
  weekId: text("week_id")
    .notNull()
    .references(() => weeks.id, { onDelete: "cascade" }),
  productName: text("product_name").notNull(),
  quantity: real("quantity"),
  unit: text("unit"),
  /** display fallback when quantities couldn't be summed across mismatched units */
  displayQuantity: text("display_quantity").notNull(),
  aisle: text("aisle").notNull(),
  usedInJson: jsonb("used_in_json").notNull().$type<UsedInRef[]>(),
  createdAt: createdAt(),
});

// --- shared JSON column shapes ---

export type Ingredient = {
  name: string;
  quantity: number | null;
  unit: string | null;
  aisle: string;
};

export type LeftoverRef = { day: string; slot: string };

export type UsedInRef = { mealId: string; title: string; day: string; slot: string };

export type ImageCredit = { photographerName: string; photographerUrl: string; unsplashUrl: string };

export type FeedbackRating = "loved" | "too_much_effort" | "too_bland" | "repeat";

export type WeekIntake = {
  daysMode: "full_week" | "weekdays_only" | "mon_to_sat";
  sundayMode: "sit_down" | "bbq" | "skip";
  dishStyles: string[];
  proteins: string[];
  avoidRepeating: string[];
  budget: string;
  effort: "quick" | "mixed" | "more_cooking";
  notes: string;
};
