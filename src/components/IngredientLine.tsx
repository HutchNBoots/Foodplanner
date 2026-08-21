import type { Ingredient } from "@/lib/db/schema";
import { formatIngredientAmount } from "@/lib/ingredients/format";

/** Outline droplet with a diagonal slash - "low in saturated fat" (see
 * DECISIONS.md's "Saturated fat" entry). Deliberately an outline shape
 * (vs. the filled ♥ heart marker below) so the two badges stay visually
 * distinct from each other at a glance, not just by tooltip text. */
function LowFatIcon() {
  return (
    <svg viewBox="0 0 14 16" className="inline-block h-3 w-3 align-[-1px]" aria-hidden focusable="false">
      <path
        d="M7 1c0 0-5.5 7-5.5 10.5a5.5 5.5 0 0 0 11 0C12.5 8 7 1 7 1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <line x1="2" y1="14" x2="12" y2="2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** Renders one recipe ingredient as bold amount+unit, a consistent space,
 * then the ingredient name (MVP 1.1 requirement, and the fix for the
 * "4whole eggs" / "1tbsp olive oil" missing-space bug - see DECISIONS.md).
 *
 * Two independent, evidence-based facts get their own small marker (see
 * DECISIONS.md's cholesterol-lowering and saturated-fat entries) - both are
 * set by Claude on every ingredient regardless of whether that week's
 * "Lower cholesterol" toggle was on, so either can render on any week:
 * - `cholesterolLowering` - actively helps lower LDL cholesterol (♥).
 * - `lowSaturatedFat` - low in saturated fat (outline droplet) - a
 *   different fact (e.g. low-fat yoghurt is low in saturated fat but has no
 *   cholesterol-lowering property of its own), so tracked separately. */
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
      {ingredient.lowSaturatedFat && (
        <span
          className="ml-1 text-sage-600"
          title="Low in saturated fat"
          aria-label="Low in saturated fat"
        >
          <LowFatIcon />
        </span>
      )}
    </>
  );
}
