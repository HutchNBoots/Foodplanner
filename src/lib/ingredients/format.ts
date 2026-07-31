import type { Ingredient } from "@/lib/db/schema";

export function formatQuantity(quantity: number): string {
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(1).replace(/\.0$/, "");
}

/** The "amount" chunk of an ingredient line - quantity + unit, e.g. "4" or
 * "1 tbsp" - or null when there's nothing quantifiable (e.g. "salt, to
 * taste"). Kept separate from the ingredient name so callers can render it
 * bold per MVP 1.1's "bold amount + unit, then consistent spacing, then the
 * name" requirement (see DECISIONS.md and the ingredient-spacing bug fix). */
export function formatIngredientAmount(ingredient: Pick<Ingredient, "quantity" | "unit">): string | null {
  if (ingredient.quantity == null) return null;
  const qty = formatQuantity(ingredient.quantity);
  return ingredient.unit ? `${qty} ${ingredient.unit}` : qty;
}
