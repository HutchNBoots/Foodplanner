import { describe, expect, it } from "vitest";
import { formatIngredientAmount, formatQuantity } from "@/lib/ingredients/format";

describe("formatIngredientAmount", () => {
  // Regression test for the MVP1 bug: ingredient text rendered with no space
  // between amount/unit and name ("4whole eggs", "1tbsp olive oil") - see
  // REQUIREMENTS.md and DECISIONS.md.
  it("puts a space between the quantity and a unit", () => {
    expect(formatIngredientAmount({ quantity: 1, unit: "tbsp" })).toBe("1 tbsp");
  });

  it("has no trailing space when there's no unit", () => {
    expect(formatIngredientAmount({ quantity: 4, unit: null })).toBe("4");
  });

  it("returns null when quantity is not set (e.g. 'salt, to taste')", () => {
    expect(formatIngredientAmount({ quantity: null, unit: null })).toBeNull();
  });

  it("formats non-integer quantities without a trailing .0", () => {
    expect(formatIngredientAmount({ quantity: 0.5, unit: "tsp" })).toBe("0.5 tsp");
    expect(formatQuantity(2)).toBe("2");
    expect(formatQuantity(2.5)).toBe("2.5");
  });
});
