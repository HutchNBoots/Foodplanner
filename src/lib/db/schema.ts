import { pgTable, text, integer, real, jsonb, boolean } from "drizzle-orm/pg-core";
import { PROTEIN_TYPES } from "@/lib/intake";

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
  /** The three family meal occasions (MVP 1.2, see DECISIONS.md - supersedes
   * the MVP1 Sunday-only default). "sat_breakfast" is "sit_down" | "skip"
   * only (no BBQ); the other two keep the full "sit_down" | "bbq" | "skip"
   * set, same as MVP1's Sunday mode. All three default to "sit_down" ("on
   * but easily skippable" per the requirement), overridable per-week in intake. */
  satBreakfastDefaultMode: text("sat_breakfast_default_mode").notNull().default("sit_down"),
  satEveningDefaultMode: text("sat_evening_default_mode").notNull().default("sit_down"),
  sunLunchDefaultMode: text("sun_lunch_default_mode").notNull().default("sit_down"),
  /** Shared headcount across all three family occasions (MVP 1.2) - was
   * Sunday-only in MVP1 (`sundayAdults`/`sundayKids`); see DECISIONS.md for
   * why one shared setting rather than one per occasion. */
  familyAdults: integer("family_adults").notNull().default(2),
  familyKids: integer("family_kids").notNull().default(2),
  /** Default protein selection for the intake form's "Proteins to use this
   * week" picker (MVP 2.1, see DECISIONS.md) - defaults to everything so
   * existing households see no change in behaviour until they actually edit
   * this in Settings. Still fully overridable per week. */
  favoriteProteins: jsonb("favorite_proteins")
    .notNull()
    .$type<string[]>()
    .$defaultFn(() => [...PROTEIN_TYPES]),
  store: text("store").notNull().default("Sainsbury's"),
  budgetDefault: text("budget_default"),
  /** Household default nutrition goal (backlog item, see DECISIONS.md's
   * "Goals selector" entry) - drives adult/family-occasion meal framing,
   * fully overridable per week in the intake form (same pattern as
   * `favoriteProteins`/`budgetDefault`). Defaults to "lose_weight" so
   * existing households see no change in behaviour - that's what v1's
   * hardcoded "moderate deficit, high protein" framing already was. Never
   * applied to the kids track, and family-occasion meals always use
   * "balanced" regardless of this setting (kids eat those too). */
  goal: text("goal").notNull().default("lose_weight").$type<Goal>(),
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
  /** "breakfast" | "lunch" | "dinner" - the meal-time. Legacy rows from
   * before MVP 1.2 may still hold the old "sunday_special" value (that
   * union member was removed from what new generations can produce, but old
   * text-column values aren't rewritten - see DECISIONS.md). */
  slot: text("slot").notNull().$type<"breakfast" | "lunch" | "dinner" | "sunday_special">(),
  /** Whose meal this is (MVP 1.2, see DECISIONS.md) - orthogonal to `slot`,
   * which is just the meal-time. Powers the Parents/Kids/Family recipe-view
   * tabs. Defaults to "adult" for pre-MVP1.2 rows (all of which were either
   * the adult track or - if `slot: "sunday_special"` - the one family
   * occasion that existed then; the latter is special-cased back to
   * "family" at render/filter time rather than by rewriting this column). */
  track: text("track").notNull().default("adult").$type<"adult" | "kids" | "family">(),
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
  /** Portions of this batch being frozen for a future week, distinct from
   * `leftoverForJson` (same-week reuse) - MVP 1.2, see DECISIONS.md.
   * Null/0 means nothing from this batch is being frozen. */
  freezerPortions: integer("freezer_portions"),
  /** Freezer inventory tracking (backlog item, see DECISIONS.md) - the exact
   * `freezerInventory.itemName` this meal reheats instead of being cooked
   * fresh, or null for an ordinary freshly-cooked meal. Mutually exclusive
   * with `batchMakes` - a meal either makes a new batch or reheats an old
   * one, never both. */
  usesFreezerItem: text("uses_freezer_item"),
  createdAt: createdAt(),
});

/** Freezer inventory tracking (backlog item, see DECISIONS.md) - what's
 * already batch-frozen from a prior week's `freezerPortions`, so future
 * generations can suggest reheating it instead of cooking/buying fresh.
 * One row per batch-freezing event, not one row per household - `portions`
 * decrements (and the row is deleted at zero) as generations consume it, or
 * a household member removes it manually after eating/discarding it. */
export const freezerInventory = pgTable("freezer_inventory", {
  id: id(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  itemName: text("item_name").notNull(),
  portions: integer("portions").notNull(),
  /** Which week originally froze this batch - informational only (shown in
   * Settings), not a hard dependency; the row survives if the week is ever
   * removed some other way. */
  frozenFromWeekId: text("frozen_from_week_id").references(() => weeks.id, { onDelete: "set null" }),
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
  /** Ticked off while actually shopping (MVP 1.1) - persisted server-side, not
   * client-only, so it survives a phone/laptop switch mid-shop. */
  checked: boolean("checked").notNull().default(false),
  createdAt: createdAt(),
});

/** The "cupboard list" (MVP 1.1, see DECISIONS.md): canonical ingredient
 * names/aisles, auto-built and deduplicated from what generations actually
 * produce over time rather than seeded upfront. New ingredient names are
 * fuzzy-matched against this table before a new row is created (see
 * `src/lib/ingredients/match.ts`) so e.g. "cherry tomato" and "cherry
 * tomatoes" collapse to one entry. Global, not per-household - v1 is a
 * single household anyway, and a shared product catalogue is the right
 * shape even if multi-household support (PROJECT.md §9 backlog) ever lands. */
export const ingredientsCanonical = pgTable("ingredients_canonical", {
  id: id(),
  name: text("name").notNull(),
  aisle: text("aisle").notNull(),
  createdAt: createdAt(),
});

// --- shared JSON column shapes ---

export type Ingredient = {
  name: string;
  quantity: number | null;
  unit: string | null;
  aisle: string;
  /** Links to `ingredientsCanonical.id` once resolved at persist time (MVP 1.1).
   * Null for weeks generated before this table existed, or if resolution is
   * ever skipped - rendering never requires this field, only `name`. */
  canonicalIngredientId?: string | null;
  /** Whether this ingredient has recognised LDL-cholesterol-lowering
   * properties (cholesterol-lowering toggle, see DECISIONS.md) - set by
   * Claude on every ingredient regardless of whether that week asked for a
   * cholesterol-lowering focus. Optional since weeks generated before this
   * field existed won't have it - render code should treat missing as false. */
  cholesterolLowering?: boolean;
  /** Whether this ingredient is low in saturated fat (same toggle as
   * `cholesterolLowering` above, see DECISIONS.md's "Saturated fat" entry) -
   * a separate fact from cholesterol-lowering (e.g. low-fat yoghurt is low
   * in saturated fat but has no cholesterol-lowering property of its own),
   * so tracked and badged independently. Optional for the same
   * pre-this-field-existing reason as `cholesterolLowering`. */
  lowSaturatedFat?: boolean;
};

export type LeftoverRef = { day: string; slot: string };

export type UsedInRef = { mealId: string; title: string; day: string; slot: string };

export type ImageCredit = { photographerName: string; photographerUrl: string; unsplashUrl: string };

export type FeedbackRating = "loved" | "too_much_effort" | "too_bland" | "repeat";

/** Nutrition goal (backlog item, see DECISIONS.md's "Goals selector" entry) -
 * single-select, drives adult/family-occasion meal framing in the system
 * prompt. Folds in what used to be a separate `lowerCholesterol` toggle as
 * "reduce_cholesterol" - nutritionist review recommended one choice rather
 * than two overlapping controls. Never applied to the kids track. */
export type Goal = "lose_weight" | "build_muscle" | "balanced" | "reduce_cholesterol";

/** The three family meal occasions (MVP 1.2, see DECISIONS.md) - replaces
 * MVP1's single `sundayMode`. `satBreakfast` has no "bbq" option (see
 * DECISIONS.md's "Family-occasion mode options" entry). */
export type FamilyMeals = {
  satBreakfast: "sit_down" | "skip";
  satEvening: "sit_down" | "bbq" | "skip";
  sunLunch: "sit_down" | "bbq" | "skip";
};

/** Which meal-times a track needs this week (MVP 2.1, see DECISIONS.md) -
 * lets adults optionally get a breakfast, and lets the kids track be
 * skipped entirely (toggle all three off) rather than always-on. */
export type MealTimesNeeded = {
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
};

export type WeekIntake = {
  daysMode: "full_week" | "weekdays_only" | "mon_to_sat";
  familyMeals: FamilyMeals;
  parentMeals: MealTimesNeeded;
  kidsMeals: MealTimesNeeded;
  dishStyles: string[];
  proteins: string[];
  avoidRepeating: string[];
  budget: string;
  effort: "quick" | "mixed" | "more_cooking";
  notes: string;
  /** This week's resolved nutrition goal (see `Goal` above) - pre-filled from
   * the household default, fully overridable per week, same pattern as
   * `proteins`/`budget`. */
  goal: Goal;
};
