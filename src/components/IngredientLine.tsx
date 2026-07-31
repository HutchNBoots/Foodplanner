import type { Ingredient } from "@/lib/db/schema";
import { formatIngredientAmount } from "@/lib/ingredients/format";

/** Renders one recipe ingredient as bold amount+unit, a consistent space,
 * then the ingredient name (MVP 1.1 requirement, and the fix for the
 * "4whole eggs" / "1tbsp olive oil" missing-space bug - see DECISIONS.md). */
export function IngredientLine({ ingredient }: { ingredient: Ingredient }) {
  const amount = formatIngredientAmount(ingredient);
  return (
    <>
      {amount && <strong className="font-semibold text-neutral-800">{amount}</strong>}
      {amount ? " " : ""}
      {ingredient.name}
    </>
  );
}
