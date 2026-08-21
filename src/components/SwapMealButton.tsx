"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** "Swap this meal" backlog feature (see DECISIONS.md) - regenerates just
 * this one meal in place and re-aggregates the week's shopping list, without
 * touching the rest of the week. Not rendered at all for a batch-cook source
 * meal (see `MealCard.tsx`) - the server would reject it anyway (other days
 * rely on it as leftovers), so there's no point offering a button that
 * always 409s. */
export function SwapMealButton({ mealId }: { mealId: string }) {
  const router = useRouter();
  const [swapping, setSwapping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSwap() {
    setSwapping(true);
    setError(null);
    const res = await fetch(`/api/meals/${mealId}/swap`, { method: "POST" });
    setSwapping(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't swap this meal.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-2">
      <button type="button" className="btn-secondary w-full" onClick={onSwap} disabled={swapping}>
        {swapping ? "Finding a replacement..." : "Swap this meal"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
