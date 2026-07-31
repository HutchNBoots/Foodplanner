"use client";

import { useState } from "react";
import type { shoppingItems } from "@/lib/db/schema";

type ShoppingItem = typeof shoppingItems.$inferSelect;

function groupByAisle(items: ShoppingItem[]) {
  const groups = new Map<string, ShoppingItem[]>();
  for (const item of items) {
    const list = groups.get(item.aisle) ?? [];
    list.push(item);
    groups.set(item.aisle, list);
  }
  return groups;
}

function asPlainText(items: ShoppingItem[]) {
  const groups = groupByAisle(items);
  return Array.from(groups.entries())
    .map(([aisle, list]) => {
      const lines = list.map((i) => `- ${i.productName} (${i.displayQuantity})`).join("\n");
      return `${aisle}\n${lines}`;
    })
    .join("\n\n");
}

export function ShoppingList({ items: initialItems }: { items: ShoppingItem[] }) {
  const [copied, setCopied] = useState(false);
  // Ticking off items while shopping (MVP 1.1 "must-ship" CX item, see
  // DECISIONS.md) - persisted server-side via PATCH, with optimistic local
  // state so a tap feels instant instead of waiting on the round trip.
  const [items, setItems] = useState(initialItems);
  const groups = groupByAisle(items);

  async function copy() {
    await navigator.clipboard.writeText(asPlainText(items));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function toggle(item: ShoppingItem) {
    const checked = !item.checked;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, checked } : i)));

    const res = await fetch(`/api/shopping-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checked }),
    });
    if (!res.ok) {
      // Roll back on failure rather than leaving the UI showing a state that
      // didn't actually persist.
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, checked: !checked } : i)));
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-neutral-500">No shopping items yet.</p>;
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={copy} className="btn-secondary w-full">
        {copied ? "Copied!" : "Copy as plain text"}
      </button>

      {Array.from(groups.entries()).map(([aisle, list]) => (
        <section key={aisle} className="card p-4">
          <h3 className="font-semibold text-neutral-800">{aisle}</h3>
          <ul className="mt-2 divide-y divide-neutral-100">
            {list.map((item) => (
              <li key={item.id} className="py-2">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 rounded border-neutral-300 text-brand-600"
                    checked={item.checked}
                    onChange={() => toggle(item)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={`font-medium ${item.checked ? "text-neutral-400 line-through" : "text-neutral-800"}`}
                      >
                        {item.productName}
                      </span>
                      <span className="shrink-0 text-sm text-neutral-500">{item.displayQuantity}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-neutral-400">
                      Used in: {item.usedInJson.map((u) => `${u.day} ${u.title}`).join(", ")}
                    </p>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
