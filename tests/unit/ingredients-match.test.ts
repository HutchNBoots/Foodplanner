import { describe, expect, it } from "vitest";
import { findBestMatch, ingredientSimilarity, normaliseIngredientName } from "@/lib/ingredients/match";

describe("normaliseIngredientName", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normaliseIngredientName("  Cherry   Tomatoes ")).toBe("cherry tomatoes");
  });
});

describe("ingredientSimilarity", () => {
  it("scores identical names as a perfect match", () => {
    expect(ingredientSimilarity("Chicken Breast", "chicken breast")).toBe(1);
  });

  it("scores simple plural/singular variants as a near-perfect match", () => {
    expect(ingredientSimilarity("cherry tomato", "cherry tomatoes")).toBeGreaterThanOrEqual(0.99);
    expect(ingredientSimilarity("onion", "onions")).toBeGreaterThanOrEqual(0.99);
    expect(ingredientSimilarity("blueberry", "blueberries")).toBeGreaterThanOrEqual(0.99);
  });

  it("scores word-order variants as a near-perfect match", () => {
    expect(ingredientSimilarity("red onion", "onion red")).toBeGreaterThanOrEqual(0.99);
  });

  it("keeps genuinely different ingredients well below the match threshold", () => {
    expect(ingredientSimilarity("chicken breast", "chicken thigh")).toBeLessThan(0.85);
    expect(ingredientSimilarity("olive oil", "sesame oil")).toBeLessThan(0.85);
  });
});

describe("findBestMatch", () => {
  const candidates = [
    { id: "1", name: "cherry tomatoes", aisle: "Fresh produce" },
    { id: "2", name: "chicken breast", aisle: "Meat & fish" },
    { id: "3", name: "olive oil", aisle: "Store cupboard" },
  ];

  it("matches a near-duplicate name to the existing canonical row", () => {
    const match = findBestMatch("cherry tomato", candidates);
    expect(match?.id).toBe("1");
  });

  it("returns null when nothing is close enough, so a new row gets created", () => {
    expect(findBestMatch("chicken thigh", candidates)).toBeNull();
    expect(findBestMatch("sesame oil", candidates)).toBeNull();
  });

  it("returns null for an empty candidate list", () => {
    expect(findBestMatch("anything", [])).toBeNull();
  });
});
