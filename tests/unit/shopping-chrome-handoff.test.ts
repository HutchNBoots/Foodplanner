import { describe, expect, it } from "vitest";
import { buildChromeHandoffPrompt } from "@/lib/shopping/exportText";

function item(productName: string, displayQuantity: string, aisle: string) {
  return { productName, displayQuantity, aisle };
}

// Pantry-staple-aware Claude-in-Chrome shopping handoff (see DECISIONS.md's
// "Pantry-staple-aware Claude-in-Chrome shopping handoff" entry).
describe("buildChromeHandoffPrompt", () => {
  it("returns an empty string for no items", () => {
    expect(buildChromeHandoffPrompt([])).toBe("");
  });

  it("numbers every item with a stable [N] reference", () => {
    const text = buildChromeHandoffPrompt([
      item("chicken breast", "700g", "Meat & fish"),
      item("milk", "2 pints", "Dairy"),
    ]);
    expect(text).toContain("[1]");
    expect(text).toContain("[2]");
  });

  it("flags a pantry staple with [CHECK] and leaves an ordinary item unflagged", () => {
    const text = buildChromeHandoffPrompt([
      item("honey", "1 tsp", "Store cupboard"),
      item("chicken breast", "700g", "Meat & fish"),
    ]);
    const honeyLine = text.split("\n").find((l) => l.includes("honey"));
    const chickenLine = text.split("\n").find((l) => l.includes("chicken breast"));
    expect(honeyLine).toContain("[CHECK]");
    expect(chickenLine).not.toContain("[CHECK]");
  });

  it("groups items by aisle rather than flat-alphabetical, so same-category items are adjacent", () => {
    const text = buildChromeHandoffPrompt([
      item("yoghurt", "1 tub", "Dairy"),
      item("apples", "6", "Fruit & veg"),
      item("milk", "2 pints", "Dairy"),
      item("carrots", "1kg", "Fruit & veg"),
    ]);
    const lines = text.split("\n").filter((l) => /^\[\d+\]/.test(l));
    // Both Dairy items should be adjacent, and both Fruit & veg items should
    // be adjacent - not interleaved the way pure alphabetical order
    // (apples, carrots, milk, yoghurt) would put them.
    const names = lines.map((l) => l.split(" - ")[0]);
    const dairyIndices = names
      .map((n, i) => (n?.includes("yoghurt") || n?.includes("milk") ? i : -1))
      .filter((i) => i >= 0);
    expect(dairyIndices[1]! - dairyIndices[0]!).toBe(1);
  });

  it("includes instructions for adding to the basket, checking staples first, verification strategy, and the summary format", () => {
    const text = buildChromeHandoffPrompt([item("chicken breast", "700g", "Meat & fish")]);
    expect(text).toContain("Sainsbury's basket");
    expect(text).toContain("pause and ask me first");
    expect(text).toContain("BOUGHT [N] £X.XX");
    expect(text).toContain("SKIPPED [N]");
    // Verification-strategy guidance from real operator feedback on a live
    // session (see DECISIONS.md) - batching for single-quantity items,
    // one-at-a-time for multi-unit items, periodic rather than per-item
    // full-basket checks.
    expect(text.toLowerCase()).toContain("batch");
    expect(text).toContain("15-20 items");
  });
});
