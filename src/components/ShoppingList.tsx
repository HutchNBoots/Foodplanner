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

export function ShoppingList({ items }: { items: ShoppingItem[] }) {
  const [copied, setCopied] = useState(false);
  const groups = groupByAisle(items);

  async function copy() {
    await navigator.clipboard.writeText(asPlainText(items));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-neutral-800">{item.productName}</span>
                  <span className="shrink-0 text-sm text-neutral-500">{item.displayQuantity}</span>
                </div>
                <p className="mt-0.5 text-xs text-neutral-400">
                  Used in: {item.usedInJson.map((u) => `${u.day} ${u.title}`).join(", ")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
