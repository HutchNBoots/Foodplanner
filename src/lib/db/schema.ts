import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

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
export const households = sqliteTable("households", {
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
export const weeks = sqliteTable("weeks", {
  id: id(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  weekStartDate: text("week_start_date").notNull(),
  status: text("status").notNull().default("generating").$type<"generating" | "ready" | "error">(),
  errorMessage: text("error_message"),
  intakeJson: text("intake_json", { mode: "json" }).notNull().$type<WeekIntake>(),
  planJson: text("plan_json", { mode: "json" }).$type<unknown>(),
  createdAt: createdAt(),
});

/** Normalized meal instances - one row per meal/day, used for history,
 * repeat-avoidance queries and feedback joins (see DECISIONS.md). */
export const meals = sqliteTable("meals", {
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
  ingredientsJson: text("ingredients_json", { mode: "json" }).notNull().$type<Ingredient[]>(),
  methodJson: text("method_json", { mode: "json" }).notNull().$type<string[]>(),
  kcal: real("kcal").notNull(),
  proteinG: real("protein_g").notNull(),
  carbsG: real("carbs_g").notNull(),
  fatG: real("fat_g").notNull(),
  fibreG: real("fibre_g").notNull(),
  imageUrl: text("image_url"),
  imageCreditJson: text("image_credit_json", { mode: "json" }).$type<ImageCredit>(),
  imageSource: text("image_source").$type<"unsplash" | "illustration">(),
  batchMakes: integer("batch_makes"),
  leftoverForJson: text("leftover_for_json", { mode: "json" }).$type<LeftoverRef[]>(),
  createdAt: createdAt(),
});

export const feedback = sqliteTable("feedback", {
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
export const shoppingItems = sqliteTable("shopping_items", {
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
  usedInJson: text("used_in_json", { mode: "json" }).notNull().$type<UsedInRef[]>(),
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
  avoidRepeating: string[];
  budget: string;
  effort: "quick" | "mixed" | "more_cooking";
  notes: string;
};
