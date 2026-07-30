import { describe, expect, it } from "vitest";
import { aggregateShoppingList, type MealForAggregation } from "@/lib/shopping/aggregate";

function meal(overrides: Partial<MealForAggregation>): MealForAggregation {
  return {
    id: "meal-1",
    title: "Test meal",
    dayDate: "2026-08-03",
    dayOfWeek: "Monday",
    slot: "dinner",
    ingredients: [],
    ...overrides,
  };
}

describe("aggregateShoppingList", () => {
  it("dedupes and sums matching ingredients across meals", () => {
    const items = aggregateShoppingList([
      meal({
        id: "m1",
        title: "Chicken tray bake",
        ingredients: [{ name: "chicken breast", quantity: 400, unit: "g", aisle: "Meat & fish" }],
      }),
      meal({
        id: "m2",
        title: "Chicken stir-fry",
        dayDate: "2026-08-04",
        dayOfWeek: "Tuesday",
        ingredients: [{ name: "Chicken Breast", quantity: 300, unit: "g", aisle: "Meat & fish" }],
      }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      productName: "chicken breast",
      quantity: 700,
      unit: "g",
      aisle: "Meat & fish",
    });
    expect(items[0]?.usedIn).toHaveLength(2);
  });

  it("normalises kg/g and l/ml onto a common base unit before summing", () => {
    const items = aggregateShoppingList([
      meal({ ingredients: [{ name: "rice", quantity: 0.5, unit: "kg", aisle: "Store cupboard" }] }),
      meal({
        id: "m2",
        ingredients: [{ name: "rice", quantity: 200, unit: "g", aisle: "Store cupboard" }],
      }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe(700);
    expect(items[0]?.unit).toBe("g");
  });

  it("keeps mismatched/unsummable quantities visible instead of dropping them", () => {
    const items = aggregateShoppingList([
      meal({ ingredients: [{ name: "olive oil", quantity: 2, unit: "tbsp", aisle: "Store cupboard" }] }),
      meal({
        id: "m2",
        ingredients: [{ name: "olive oil", quantity: null, unit: null, aisle: "Store cupboard" }],
      }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]?.displayQuantity).toContain("2tbsp");
    expect(items[0]?.displayQuantity).toContain("as needed");
  });

  it("sorts by aisle then product name", () => {
    const items = aggregateShoppingList([
      meal({ ingredients: [{ name: "yoghurt", quantity: 1, unit: "tub", aisle: "Chilled & dairy" }] }),
      meal({
        id: "m2",
        ingredients: [{ name: "apples", quantity: 6, unit: null, aisle: "Fresh produce" }],
      }),
    ]);

    expect(items.map((i) => i.aisle)).toEqual(["Chilled & dairy", "Fresh produce"]);
  });

  it("returns an empty list for no meals", () => {
    expect(aggregateShoppingList([])).toEqual([]);
  });
});
