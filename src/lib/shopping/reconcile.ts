import type { shoppingItems } from "@/lib/db/schema";
import { groupedByAisle } from "./exportText";
import { CATEGORIES, categorizeItem, type Category } from "./categories";
import { parseChromeHandoffSummary } from "./parseSummary";

type ShoppingItem = Pick<
  typeof shoppingItems.$inferSelect,
  "id" | "productName" | "displayQuantity" | "aisle"
>;

export type ReconciledItem<T extends ShoppingItem = ShoppingItem> = {
  item: T;
  status: "bought" | "skipped" | "unreported";
  price: number | null;
  reason: string | null;
};

export type CategorySummary<T extends ShoppingItem = ShoppingItem> = {
  category: Category;
  total: number;
  items: ReconciledItem<T>[];
};

/** Matches Claude's pasted `BOUGHT [N]`/`SKIPPED [N]` summary back to
 * specific shopping items by the same `[N]` ordering `buildChromeHandoffPrompt`
 * used to number them (see DECISIONS.md's "Paste-back reconciliation:
 * category summary + spend" entry), then groups the result by
 * `categorizeItem` with a spend total per category. An item the summary
 * never mentions (Claude stopped early, or just missed a line) comes back
 * as "unreported" rather than silently defaulting to bought or skipped -
 * `items` must be the exact same array (same members, any order) that was
 * passed to `buildChromeHandoffPrompt` when the prompt was generated, or
 * the `[N]` numbering won't line up. */
export function reconcile<T extends ShoppingItem>(items: T[], summaryText: string): CategorySummary<T>[] {
  const parsed = parseChromeHandoffSummary(summaryText);
  const byIndex = new Map(parsed.map((line) => [line.index, line]));
  const ordered = groupedByAisle(items);

  const reconciled: ReconciledItem<T>[] = ordered.map((item, i) => {
    const line = byIndex.get(i + 1);
    if (!line) return { item, status: "unreported", price: null, reason: null };
    if (line.status === "bought") return { item, status: "bought", price: line.price, reason: null };
    return { item, status: "skipped", price: null, reason: line.reason };
  });

  const grouped = new Map<Category, ReconciledItem<T>[]>();
  for (const entry of reconciled) {
    const category = categorizeItem(entry.item.productName, entry.item.aisle);
    const list = grouped.get(category) ?? [];
    list.push(entry);
    grouped.set(category, list);
  }

  return CATEGORIES.filter((c) => grouped.has(c)).map((category) => {
    const catItems = grouped.get(category)!;
    const total = catItems.reduce((sum, e) => sum + (e.status === "bought" ? (e.price ?? 0) : 0), 0);
    return { category, total, items: catItems };
  });
}
