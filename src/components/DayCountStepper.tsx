"use client";

/** A tappable −/+ stepper for "how many days should this order cover" (see
 * DECISIONS.md's "Calendar-based days selection" entry) - replaces the old
 * 3-preset tab strip (full week/weekdays/Mon-Sat) now that the day count is
 * driven by how long a shop needs to last, not a fixed calendar-week shape.
 * Clamped to 1-14 days by the caller (matching `weekIntakeSchema`) - beyond
 * ~2 weeks a single shop realistically won't still be covering fresh
 * ingredients. */
export function DayCountStepper({
  value,
  onChange,
  min = 1,
  max = 14,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="Fewer days"
        className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-ink-300 bg-paper-raised text-lg font-semibold text-ink-700 transition hover:border-ink-400 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-800 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      >
        −
      </button>
      <span className="data-figure w-16 text-center text-lg font-semibold text-ink-800">
        {value} day{value === 1 ? "" : "s"}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="More days"
        className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-ink-300 bg-paper-raised text-lg font-semibold text-ink-700 transition hover:border-ink-400 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-800 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      >
        +
      </button>
    </div>
  );
}
