import { describe, expect, it } from "vitest";
import { reconcile } from "@/lib/shopping/reconcile";

function item(id: string, productName: string, displayQuantity: string, aisle: string) {
  return { id, productName, displayQuantity, aisle };
}

// Paste-back reconciliation (see DECISIONS.md's "Paste-back reconciliation:
// category summary + spend" entry) - combines parseChromeHandoffSummary +
// categorizeItem + the same groupedByAisle ordering buildChromeHandoffPrompt
// uses, so [N] in a pasted summary maps back to the right item.
describe("reconcile", () => {
  const items = [
    item("1", "chicken breast fillets", "700g", "Meat & fish"),
    item("2", "salmon fillet", "2 fillets", "Meat & fish"),
    item("3", "honey", "1 tsp", "Store cupboard"),
    item("4", "apples", "6", "Fruit & veg"),
  ];

  it("groups bought items by category with a spend total", () => {
    const summary = reconcile(items, "BOUGHT [1] £4.50\nBOUGHT [2] £6.00\nBOUGHT [4] £2.00\nSKIPPED [3] - already had it");

    const protein = summary.find((c) => c.category === "Protein");
    expect(protein?.total).toBe(10.5);
    expect(protein?.items.map((e) => e.item.id)).toEqual(["1", "2"]);

    const vegFruit = summary.find((c) => c.category === "Veg & Fruit");
    expect(vegFruit?.total).toBe(2);

    const staples = summary.find((c) => c.category === "Staples");
    expect(staples?.total).toBe(0);
    expect(staples?.items[0]).toMatchObject({ status: "skipped", reason: "already had it" });
  });

  it("marks an item the summary never mentions as unreported, not bought or skipped", () => {
    const summary = reconcile(items, "BOUGHT [1] £4.50");
    const allItems = summary.flatMap((c) => c.items);
    const unreported = allItems.filter((e) => e.status === "unreported");
    expect(unreported.map((e) => e.item.id).sort()).toEqual(["2", "3", "4"]);
  });

  it("only counts bought items toward a category's total, not skipped or unreported ones", () => {
    const summary = reconcile(items, "SKIPPED [1] - not needed");
    const protein = summary.find((c) => c.category === "Protein");
    expect(protein?.total).toBe(0);
  });

  it("treats a bought item with no reported price as contributing £0 to the total, not throwing", () => {
    const summary = reconcile(items, "BOUGHT [1]");
    const protein = summary.find((c) => c.category === "Protein");
    expect(protein?.total).toBe(0);
    expect(protein?.items.find((e) => e.item.id === "1")).toMatchObject({ status: "bought", price: null });
  });
});
