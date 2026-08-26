"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** History page "delete this week" - a two-tap confirm (not a native
 * `confirm()` dialog, to stay in the app's own visual language) since this
 * permanently removes the week's meals, shopping list, and feedback, not
 * just a single easily-replaced item like a freezer entry. */
export function DeleteWeekButton({ weekId }: { weekId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function onConfirm() {
    setDeleting(true);
    await fetch(`/api/weeks/${weekId}`, { method: "DELETE" });
    router.refresh();
  }

  if (deleting) {
    return <span className="text-xs text-ink-400">Deleting...</span>;
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onConfirm}
          className="min-h-9 rounded-lg border border-red-300 bg-red-50 px-2.5 text-xs font-medium text-red-700 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          Delete?
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="min-h-9 rounded-lg border border-ink-300 px-2.5 text-xs font-medium text-ink-600 transition hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-800 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      aria-label="Delete this week"
      className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-ink-400 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-800 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
    >
      <svg aria-hidden viewBox="0 0 20 20" className="h-4.5 w-4.5">
        <path
          d="M4 6h12M8 6V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V6m-7 0 .6 9.4a1 1 0 0 0 1 .94h5.8a1 1 0 0 0 1-.94L15 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
