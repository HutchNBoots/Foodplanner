"use client";

import { useState } from "react";
import type { shoppingItems } from "@/lib/db/schema";
import { buildChromeHandoffPrompt } from "@/lib/shopping/exportText";
import { reconcile, type CategorySummary } from "@/lib/shopping/reconcile";

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

export function ShoppingList({ items: initialItems }: { items: ShoppingItem[] }) {
  const [copied, setCopied] = useState(false);
  // Ticking off items while shopping (MVP 1.1 "must-ship" CX item, see
  // DECISIONS.md) - persisted server-side via PATCH, with optimistic local
  // state so a tap feels instant instead of waiting on the round trip.
  const [items, setItems] = useState(initialItems);
  const groups = groupByAisle(items);

  // Paste-back reconciliation (see DECISIONS.md's "Paste-back
  // reconciliation: category summary + spend" entry) - deliberately
  // session-only, not persisted to the database. The reported price is
  // Claude's honest best-effort read of a product page, not a verified
  // figure, and this is a one-time "review right after shopping" action -
  // `checked` (the one piece of state worth keeping) already persists via
  // the same PATCH the manual checkboxes above use.
  const [summaryText, setSummaryText] = useState("");
  const [reconciliation, setReconciliation] = useState<CategorySummary[] | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileError, setReconcileError] = useState<string | null>(null);

  async function copy() {
    await navigator.clipboard.writeText(buildChromeHandoffPrompt(items));
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

  async function processReconciliation() {
    setReconciling(true);
    setReconcileError(null);

    const summary = reconcile(items, summaryText);
    setReconciliation(summary);

    const boughtIds = summary.flatMap((cat) =>
      cat.items.filter((e) => e.status === "bought").map((e) => e.item.id),
    );
    setItems((prev) => prev.map((i) => (boughtIds.includes(i.id) ? { ...i, checked: true } : i)));

    const results = await Promise.all(
      boughtIds.map((id) =>
        fetch(`/api/shopping-items/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checked: true }),
        }),
      ),
    );
    if (results.some((r) => !r.ok)) {
      setReconcileError("Marked items as bought here, but some didn't save - refresh and check before relying on it.");
    }
    setReconciling(false);
  }

  if (items.length === 0) {
    return <p className="text-sm text-ink-500">No shopping items yet.</p>;
  }

  const boughtCount = reconciliation?.flatMap((c) => c.items).filter((e) => e.status === "bought").length ?? 0;
  const skippedCount = reconciliation?.flatMap((c) => c.items).filter((e) => e.status === "skipped").length ?? 0;
  const unreportedCount =
    reconciliation?.flatMap((c) => c.items).filter((e) => e.status === "unreported").length ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <button type="button" onClick={copy} className="btn-secondary w-full">
          {copied ? "Copied!" : "Copy shopping prompt"}
        </button>
        <p className="mt-2 text-xs text-ink-500">
          Tip: open Claude in Chrome on Sainsbury&apos;s site and paste this in. It&apos;ll ask before
          adding anything you likely already have (honey, spices, oils...), and stops before payment
          so you review and pay yourself.
        </p>
      </div>

      {Array.from(groups.entries()).map(([aisle, list]) => (
        <section key={aisle} className="card p-4">
          <h3 className="section-title text-base">{aisle}</h3>
          <ul className="mt-2 divide-y divide-ink-100">
            {list.map((item) => (
              <li key={item.id} className="py-1">
                <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 shrink-0 rounded border-ink-300 text-sage-600 focus-visible:ring-2 focus-visible:ring-ink-800 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                    checked={item.checked}
                    onChange={() => toggle(item)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={`font-medium ${item.checked ? "text-ink-400 line-through" : "text-ink-800"}`}
                      >
                        {item.productName}
                      </span>
                      <span className="data-figure shrink-0 text-sm text-ink-500">{item.displayQuantity}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-400">
                      Used in: {item.usedInJson.map((u) => `${u.day} ${u.title}`).join(", ")}
                    </p>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <details className="card group p-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-semibold text-ink-800 [&::-webkit-details-marker]:hidden">
          Reconcile after shopping
          <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-ink-400 transition group-open:rotate-180">
            <path d="M5 7l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        <div className="mt-4 space-y-3">
          <p className="text-xs text-ink-500">
            Paste Claude&apos;s summary from your Chrome session here to tick off what was bought and
            see a spend breakdown by category.
          </p>
          <textarea
            className="input min-h-32 font-mono text-xs"
            placeholder={"BOUGHT [1] £4.50\nSKIPPED [3] - already had honey"}
            value={summaryText}
            onChange={(e) => setSummaryText(e.target.value)}
          />
          <button
            type="button"
            onClick={processReconciliation}
            disabled={reconciling || !summaryText.trim()}
            className="btn-secondary w-full disabled:opacity-50"
          >
            {reconciling ? "Processing..." : "Process summary"}
          </button>
          {reconcileError && <p className="text-sm text-red-600">{reconcileError}</p>}

          {reconciliation && (
            <div className="space-y-4 border-t border-ink-100 pt-3">
              {reconciliation.map((cat) => (
                <div key={cat.category}>
                  <div className="flex items-baseline justify-between">
                    <h4 className="font-semibold text-ink-800">{cat.category}</h4>
                    <span className="data-figure text-sm text-ink-600">£{cat.total.toFixed(2)}</span>
                  </div>
                  <ul className="mt-1 space-y-1 text-sm text-ink-600">
                    {cat.items.map((entry) => (
                      <li key={entry.item.id}>
                        {entry.status === "bought" && (
                          <span>
                            ✓ {entry.item.productName} - {entry.item.displayQuantity}
                            {entry.price != null ? ` - £${entry.price.toFixed(2)}` : ""}
                          </span>
                        )}
                        {entry.status === "skipped" && (
                          <span className="text-ink-400">
                            ⊘ {entry.item.productName}
                            {entry.reason ? ` (${entry.reason})` : ""}
                          </span>
                        )}
                        {entry.status === "unreported" && (
                          <span className="text-amber-600">
                            ? {entry.item.productName} - not in the summary, check manually
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="border-t border-ink-100 pt-2 text-xs text-ink-500">
                {boughtCount} bought · {skippedCount} skipped
                {unreportedCount > 0 ? ` · ${unreportedCount} not reported` : ""}
              </p>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
