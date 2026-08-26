import { isPantryStaple } from "./pantryStaples";

/** Category taxonomy for the paste-back reconciliation summary (see
 * DECISIONS.md's "Paste-back reconciliation: category summary + spend"
 * entry) - deliberately NOT the same thing as `shoppingItems.aisle`.
 * `aisle` is free text Claude generates at generation time (no fixed
 * enum), so its exact wording/granularity varies week to week ("Meat &
 * fish" vs. "Fresh meat" vs. "Poultry"), and doesn't match the coarse
 * protein/veg/staples language useful in a reconciliation summary anyway.
 * This is a small, fixed, purpose-built list instead, derived from `aisle`
 * (and `pantryStaple`) via a keyword heuristic. */
export const CATEGORIES = [
  "Protein",
  "Veg & Fruit",
  "Dairy",
  "Bakery",
  "Frozen",
  "Store Cupboard",
  "Staples",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Keyword match against `aisle` text, case-insensitive substring - same
 * "reasonable, not perfect" approximation as `pantryStaples.ts`. `Staples`
 * and `Other` aren't matched here: `Staples` takes priority via
 * `isPantryStaple` before this table is even consulted, and `Other` is the
 * fallback when nothing else matches. */
const AISLE_KEYWORDS: Partial<Record<Category, string[]>> = {
  Protein: ["meat", "fish", "poultry", "deli"],
  "Veg & Fruit": ["fruit", "veg", "salad", "produce"],
  Dairy: ["dairy", "chilled", "egg", "cheese"],
  Bakery: ["bakery", "bread"],
  Frozen: ["frozen"],
  "Store Cupboard": ["cupboard", "tin", "pasta", "rice", "dry goods", "grocery", "groceries"],
};

/** `pantryStaple` items land in Staples regardless of their `aisle` - a jar
 * of honey being nominally "Store cupboard" doesn't make it useful to lump
 * in with real store-cupboard weekly-shop items like tinned tomatoes or
 * pasta, which is why Store Cupboard exists as its own category distinct
 * from Staples. */
export function categorizeItem(productName: string, aisle: string): Category {
  if (isPantryStaple(productName)) return "Staples";

  const lowerAisle = aisle.toLowerCase();
  for (const category of CATEGORIES) {
    const keywords = AISLE_KEYWORDS[category];
    if (keywords?.some((k) => lowerAisle.includes(k))) return category;
  }
  return "Other";
}
