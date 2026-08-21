import type { Ingredient } from "@/lib/db/schema";
import { formatIngredientAmount } from "@/lib/ingredients/format";

/** Renders one recipe ingredient as bold amount+unit, a consistent space,
 * then the ingredient name (MVP 1.1 requirement, and the fix for the
 * "4whole eggs" / "1tbsp olive oil" missing-space bug - see DECISIONS.md).
 * Ingredients with recognised cholesterol-lowering properties (the
 * cholesterol-lowering intake toggle, see DECISIONS.md) get a small heart
 * marker - `cholesterolLowering` is set by Claude on every ingredient
 * regardless of whether that week asked for the focus, so this can render
 * on any week, not just ones with the toggle on. */
export function IngredientLine({ ingredient }: { ingredient: Ingredient }) {
  const amount = formatIngredientAmount(ingredient);
  return (
    <>
      {amount && <strong className="font-semibold text-ink-800">{amount}</strong>}
      {amount ? " " : ""}
      {ingredient.name}
      {ingredient.cholesterolLowering && (
        <span
          className="ml-1 text-sage-600"
          title="Has cholesterol-lowering properties"
          aria-label="Has cholesterol-lowering properties"
        >
          ♥
        </span>
      )}
    </>
  );
}
