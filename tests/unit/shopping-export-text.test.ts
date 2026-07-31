import { describe, expect, it } from "vitest";
import { shoppingListAsPlainText } from "@/lib/shopping/exportText";

function item(productName: string, displayQuantity: string) {
  return { productName, displayQuantity };
}

// MVP 2 (see DECISIONS.md's "MVP 2 scope correction" entry): the plain-text
// export is for pasting into Claude in Chrome to search-and-add each item -
// one flat line per item, no aisle-grouped headers, which only make sense
// for a human physically walking a store.
describe("shoppingListAsPlainText", () => {
  it("renders one line per item as 'name - quantity'", () => {
    const text = shoppingListAsPlainText([item("chicken breast", "700g")]);
    expect(text).toBe("chicken breast - 700g");
  });

  it("has no aisle headers or bullet prefixes", () => {
    const text = shoppingListAsPlainText([
      item("chicken breast", "700g"),
      item("olive oil", "2 tbsp"),
    ]);
    expect(text).not.toContain("Meat & fish");
    expect(text).not.toContain("- chicken"); // no leading bullet dash before the name
  });

  it("sorts items alphabetically by product name for a stable, scannable order", () => {
    const text = shoppingListAsPlainText([
      item("yoghurt", "1 tub"),
      item("apples", "6"),
      item("mixed vegetables", "300g"),
    ]);
    expect(text.split("\n")).toEqual(["apples - 6", "mixed vegetables - 300g", "yoghurt - 1 tub"]);
  });

  it("returns an empty string for no items", () => {
    expect(shoppingListAsPlainText([])).toBe("");
  });
});
