import type { shoppingItems } from "@/lib/db/schema";
import { isPantryStaple } from "./pantryStaples";

type ShoppingItem = Pick<typeof shoppingItems.$inferSelect, "productName" | "displayQuantity">;
type ShoppingItemWithAisle = ShoppingItem & Pick<typeof shoppingItems.$inferSelect, "aisle">;

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

/** Groups by `aisle` (insertion order of first appearance), alphabetical by
 * product name within each group - deterministic, so `buildChromeHandoffPrompt`
 * and the (future) paste-back parser can both derive the same `[N]`
 * reference from the same underlying item list independently. */
function groupedByAisle<T extends ShoppingItemWithAisle>(items: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const list = groups.get(item.aisle) ?? [];
    list.push(item);
    groups.set(item.aisle, list);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.productName.localeCompare(b.productName));
  }
  return Array.from(groups.values()).flat();
}

/** Richer Claude-in-Chrome shopping handoff (see DECISIONS.md's
 * "Pantry-staple-aware Claude-in-Chrome shopping handoff" entry). Grouped
 * by `aisle` rather than flat-alphabetical, per real operator feedback from
 * a live 78-item session: searching similar items back-to-back (produce,
 * then meat, then store-cupboard...) cut down on page loads/re-orientation
 * versus bouncing between unrelated categories in alphabetical order - a
 * different reason than the on-screen view's aisle grouping (that one's for
 * a human walking a physical store), but the same underlying `aisle` field
 * serves both. Tags each line with a stable `[N]` reference number, and
 * flags likely-already-owned pantry staples with `[CHECK]` so Claude pauses
 * and asks about those specifically instead of silently adding a whole jar
 * for a teaspoon's worth of use. Works on any week's stored items, past or
 * present - staple detection (`isPantryStaple`) runs on `productName` at
 * call time, it isn't a field Claude sets at generation time.
 *
 * The verification-strategy paragraph is also grounded in that same
 * feedback: Sainsbury's product cards don't reliably register every
 * click, so the original session screenshot-verified after nearly every
 * add, which was most of its ~52-minute runtime for 78 items. The
 * instructions below trade a little of that safety margin for speed -
 * batched adds with periodic spot-checks rather than one-by-one - on the
 * basis that the household reviews the whole basket before paying anyway
 * (Claude already stops before payment), so a missed item is caught there,
 * cheaply, rather than needing to be caught live. */
export function buildChromeHandoffPrompt(items: ShoppingItemWithAisle[]): string {
  if (items.length === 0) return "";

  const ordered = groupedByAisle(items);
  const lines = ordered.map((item, i) => {
    const n = i + 1;
    const staple = isPantryStaple(item.productName) ? " [CHECK]" : "";
    return `[${n}] ${item.productName} - ${item.displayQuantity}${staple}`;
  });

  return `Add everything in the list below to my Sainsbury's basket, using the [N] number to keep track of each item. The list is grouped by category - work through it in order rather than jumping around, so you're not bouncing between unrelated searches.

For any item marked [CHECK], pause and ask me first before adding it - I might already have some at home, or only need a small amount for one recipe, so it may not be worth buying a whole pack.

How to verify as you go (Sainsbury's product cards don't always register a click first time, so some checking is worth it, but not after every single add):
- For a single-quantity item, add it and move on - batch a handful of straightforward single-quantity items together, then do one screenshot or cart-total check at the end of that batch rather than after each one.
- For an item needing more than one unit, add one at a time with a brief pause between clicks and confirm each one registered before continuing - multi-click sequences are the ones most likely to silently drop a click.
- Cross-check the full basket every 15-20 items or whenever something looks off, rather than on every item.
- Only zoom in on a screenshot when a result is genuinely ambiguous - the on-page count is usually readable at normal resolution.

Once you're done (or if I ask you to stop), reply with a summary in exactly this format, one line per item, in any order:
BOUGHT [N]
SKIPPED [N] - brief reason

Shopping list:
${lines.join("\n")}`;
}
