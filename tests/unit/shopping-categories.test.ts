import { describe, expect, it } from "vitest";
import { categorizeItem } from "@/lib/shopping/categories";

// Reconciliation category taxonomy (see DECISIONS.md's "Paste-back
// reconciliation: category summary + spend" entry) - purpose-built, not a
// reuse of the free-text `aisle` field.
describe("categorizeItem", () => {
  it("categorizes ordinary aisle-mapped items", () => {
    expect(categorizeItem("chicken breast fillets", "Meat & fish")).toBe("Protein");
    expect(categorizeItem("apples", "Fruit & veg")).toBe("Veg & Fruit");
    expect(categorizeItem("milk", "Dairy")).toBe("Dairy");
    expect(categorizeItem("sourdough loaf", "Bakery")).toBe("Bakery");
    expect(categorizeItem("frozen peas", "Frozen")).toBe("Frozen");
  });

  it("handles the actual aisle strings this app generates (see src/lib/claude/mock.ts)", () => {
    // "Fresh produce" and "Chilled & dairy" are what generation actually
    // emits, not the more generic "Fruit & veg"/"Dairy" - caught by a live
    // manual test where "mixed vegetables" (aisle: "Fresh produce") landed
    // in Other instead of Veg & Fruit before "produce" was added as a
    // keyword.
    expect(categorizeItem("mixed vegetables", "Fresh produce")).toBe("Veg & Fruit");
    expect(categorizeItem("lemon", "Fresh produce")).toBe("Veg & Fruit");
    expect(categorizeItem("eggs", "Chilled & dairy")).toBe("Dairy");
  });

  it("puts pantry staples in Staples regardless of their aisle", () => {
    // Honey is nominally "Store cupboard" aisle, but should be pulled into
    // Staples ahead of the aisle-keyword mapping.
    expect(categorizeItem("honey", "Store cupboard")).toBe("Staples");
    expect(categorizeItem("olive oil", "Store cupboard")).toBe("Staples");
  });

  it("keeps non-staple store-cupboard items (real weekly-shop goods) distinct from Staples", () => {
    expect(categorizeItem("tinned tomatoes", "Store cupboard")).toBe("Store Cupboard");
    expect(categorizeItem("pasta", "Store cupboard")).toBe("Store Cupboard");
  });

  it("falls back to Other for an unrecognised aisle", () => {
    expect(categorizeItem("kitchen roll", "Household")).toBe("Other");
  });
});
