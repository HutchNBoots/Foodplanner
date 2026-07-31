import type { shoppingItems } from "@/lib/db/schema";

type ShoppingItem = Pick<typeof shoppingItems.$inferSelect, "productName" | "displayQuantity">;

/** Plain-text export of the shopping list (MVP 2, see DECISIONS.md's "MVP 2
 * scope correction" entry) - one line per item, canonical product name +
 * quantity, no aisle-grouped headers. The on-screen shopping list view keeps
 * aisle grouping (useful for a human physically walking a store); this
 * export is for pasting into Claude in Chrome (or similar) to search-and-add
 * each item on a retailer's site, where "which aisle" is irrelevant and a
 * flat, linear list is easier to work through one line at a time. */
export function shoppingListAsPlainText(items: ShoppingItem[]): string {
  return items
    .slice()
    .sort((a, b) => a.productName.localeCompare(b.productName))
    .map((item) => `${item.productName} - ${item.displayQuantity}`)
    .join("\n");
}
