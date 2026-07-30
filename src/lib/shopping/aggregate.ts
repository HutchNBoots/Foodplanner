import type { Ingredient, UsedInRef } from "@/lib/db/schema";

export type MealForAggregation = {
  id: string;
  title: string;
  dayDate: string;
  dayOfWeek: string;
  slot: string;
  ingredients: Ingredient[];
};

export type AggregatedShoppingItem = {
  productName: string;
  quantity: number | null;
  unit: string | null;
  displayQuantity: string;
  aisle: string;
  usedIn: UsedInRef[];
};

/** De-dupe key is the product name alone (lowercased/trimmed) - ingredients
 * are grouped by name regardless of unit, since the same product can show up
 * with different units across meals (e.g. "0.4kg" vs "400g" chicken, or a
 * quantified vs "to taste" instance of the same herb). Whether two units are
 * actually summable is decided separately, below. */
function normaliseKey(name: string): string {
  return name.trim().toLowerCase();
}

const UNIT_ALIASES: Record<string, string> = {
  gram: "g",
  grams: "g",
  gs: "g",
  kilogram: "kg",
  kilograms: "kg",
  millilitre: "ml",
  millilitres: "ml",
  milliliter: "ml",
  milliliters: "ml",
  litre: "l",
  litres: "l",
  liter: "l",
  liters: "l",
};

function normaliseUnit(unit: string | null): string | null {
  if (!unit) return null;
  const lower = unit.trim().toLowerCase();
  return UNIT_ALIASES[lower] ?? lower;
}

/** kg->g and l->ml so totals across a week end up in one consistent unit. */
function toBaseUnit(quantity: number, unit: string): { quantity: number; unit: string } {
  if (unit === "kg") return { quantity: quantity * 1000, unit: "g" };
  if (unit === "l") return { quantity: quantity * 1000, unit: "ml" };
  return { quantity, unit };
}

function formatQuantity(quantity: number): string {
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(1).replace(/\.0$/, "");
}

/** Deterministically aggregates ingredients across a week's meals into a
 * shopping list: dedupes by product name, sums quantities where units are
 * compatible/summable (falling back to listing incompatible quantities
 * side-by-side rather than dropping them), and keeps a used-in
 * cross-reference per item. See DECISIONS.md for why this is server-side
 * arithmetic rather than something we ask Claude to compute. */
export function aggregateShoppingList(mealsList: MealForAggregation[]): AggregatedShoppingItem[] {
  const byKey = new Map<
    string,
    { productName: string; unit: string | null; aisle: string; quantity: number | null; usedIn: UsedInRef[]; unsummable: string[] }
  >();

  for (const meal of mealsList) {
    for (const ingredient of meal.ingredients) {
      const unit = normaliseUnit(ingredient.unit);
      const key = normaliseKey(ingredient.name);
      const usedInRef: UsedInRef = {
        mealId: meal.id,
        title: meal.title,
        day: meal.dayOfWeek,
        slot: meal.slot,
      };

      const existing = byKey.get(key);
      if (!existing) {
        const base = ingredient.quantity != null && unit ? toBaseUnit(ingredient.quantity, unit) : null;
        byKey.set(key, {
          productName: ingredient.name,
          unit: base?.unit ?? unit,
          aisle: ingredient.aisle,
          quantity: base?.quantity ?? ingredient.quantity,
          usedIn: [usedInRef],
          unsummable: [],
        });
        continue;
      }

      existing.usedIn.push(usedInRef);

      if (ingredient.quantity == null) {
        existing.unsummable.push("as needed");
      } else if (existing.quantity == null) {
        existing.unsummable.push(`${ingredient.quantity}${ingredient.unit ?? ""}`);
      } else {
        const base = toBaseUnit(ingredient.quantity, unit ?? "");
        if (base.unit === existing.unit) {
          existing.quantity += base.quantity;
        } else {
          existing.unsummable.push(`${ingredient.quantity}${ingredient.unit ?? ""}`);
        }
      }
    }
  }

  return Array.from(byKey.values())
    .map((item) => {
      const parts: string[] = [];
      if (item.quantity != null) parts.push(`${formatQuantity(item.quantity)}${item.unit ?? ""}`);
      parts.push(...item.unsummable);

      return {
        productName: item.productName,
        quantity: item.quantity,
        unit: item.unit,
        displayQuantity: parts.length ? parts.join(" + ") : "as needed",
        aisle: item.aisle,
        usedIn: item.usedIn,
      };
    })
    .sort((a, b) => a.aisle.localeCompare(b.aisle) || a.productName.localeCompare(b.productName));
}
