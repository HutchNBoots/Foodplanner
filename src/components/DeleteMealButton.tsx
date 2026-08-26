"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** "Delete this meal" backlog feature (see DECISIONS.md) - removes the meal
 * entirely and re-aggregates the week's shopping list from what's left. A
 * two-tap inline confirm (not a native `confirm()` dialog, matching
 * `DeleteWeekButton`'s pattern) since there's no undo. Not rendered at all
 * for a batch-cook source meal (see `MealCard.tsx`) - the server would
 * reject it anyway (other days rely on it as leftovers), same reasoning as
 * `SwapMealButton`. */
export function DeleteMealButton({ mealId }: { mealId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setDeleting(true);
    setError(null);
    const res = await fetch(`/api/meals/${mealId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't delete this meal.");
      setDeleting(false);
      setConfirming(false);
      return;
    }
    router.refresh();
  }

  if (confirming) {
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onConfirm}
          disabled={deleting}
          className="min-h-11 rounded-xl border border-red-300 bg-red-50 px-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          {deleting ? "Deleting..." : "Delete?"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={deleting}
          className="min-h-11 rounded-xl border border-ink-300 bg-paper-raised px-3 text-sm font-semibold text-ink-700 transition hover:border-ink-400 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-800 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-paper-raised px-5 py-3 text-sm font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      >
        Delete
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
