"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Manual "we ate/binned this" removal (freezer inventory backlog feature,
 * see DECISIONS.md) - a household member clearing an item without waiting
 * for a future generation to consume it. */
export function RemoveFreezerItemButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);

  async function onRemove() {
    setRemoving(true);
    await fetch(`/api/freezer-items/${itemId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onRemove}
      disabled={removing}
      className="min-h-11 shrink-0 rounded-lg border border-ink-300 px-3 text-xs font-medium text-ink-600 transition hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-800 focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-50"
    >
      {removing ? "Removing..." : "Used it"}
    </button>
  );
}
