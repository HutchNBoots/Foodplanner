import type { freezerInventory } from "@/lib/db/schema";
import { TrackSection } from "./IndexTab";
import { RemoveFreezerItemButton } from "./RemoveFreezerItemButton";

type FreezerItem = typeof freezerInventory.$inferSelect;

/** Freezer inventory tracking (backlog item, see DECISIONS.md) - read-only
 * list plus a manual "Used it" removal; there's no manual "add" affordance
 * since the list is meant to stay a faithful record of what generation
 * actually froze (`meal.freezerPortions`), not a free-form household todo
 * list. */
export function FreezerInventory({ items }: { items: FreezerItem[] }) {
  return (
    <TrackSection color="ink" label="Freezer">
      <div>
        <h2 className="section-title text-base">What&apos;s in the freezer</h2>
        <p className="mt-1 text-xs text-ink-500">
          Auto-filled whenever a batch-cook meal freezes portions - future weeks are nudged to use
          these up before cooking or buying the same thing fresh.
        </p>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-ink-500">Nothing in the freezer right now.</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink-800">{item.itemName}</p>
                <p className="data-figure text-xs text-ink-400">
                  {item.portions} portion{item.portions === 1 ? "" : "s"}
                </p>
              </div>
              <RemoveFreezerItemButton itemId={item.id} />
            </li>
          ))}
        </ul>
      )}
    </TrackSection>
  );
}
