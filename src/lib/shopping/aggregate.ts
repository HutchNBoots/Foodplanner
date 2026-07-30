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

/** Normalises a name/unit pair to a de-dupe key: lowercased, trimmed, unit
 * normalised for a handful of common equivalents so "400g" and "0.4kg" merge. */
function normaliseKey(name: string, unit: string | null): string {
  return `${name.trim().toLowerCase()}|${normaliseUnit(unit)}`;
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
 * shopping list: dedupes by name+unit, sums quantities where units are
 * summable, and keeps a used-in cross-reference per item. See DECISIONS.md
 * for why this is server-side arithmetic rather than something we ask
 * Claude to compute. */
export function aggregateShoppingList(mealsList: MealForAggregation[]): AggregatedShoppingItem[] {
  const byKey = new Map<
    string,
    { productName: string; unit: string | null; aisle: string; quantity: number | null; usedIn: UsedInRef[]; unsummable: string[] }
  >();

  for (const meal of mealsList) {
    for (const ingredient of meal.ingredients) {
      const unit = normaliseUnit(ingredient.unit);
      const key = normaliseKey(ingredient.name, unit);
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
