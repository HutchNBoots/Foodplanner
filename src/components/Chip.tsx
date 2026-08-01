/** Checkbox-style chip - replaces the generic rounded pill for "pick any"
 * choices (dish styles, proteins, avoid-repeat, meal-times-needed). The
 * checkbox glyph is decorative only; the whole chip is the tap target
 * (`min-h-11 min-w-11`, see DECISIONS.md's "MVP 1.3" entry on why the old
 * `px-3.5 py-1.5` pill sizing was below the 44px floor). */
export function Chip({
  label,
  active,
  muted,
  onClick,
}: {
  label: string;
  active: boolean;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-11 min-w-11 items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-800 focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
        active
          ? "border-ink-800 bg-ink-800 text-paper"
          : muted
            ? "border-ink-100 text-ink-300 hover:bg-ink-50"
            : "border-ink-300 text-ink-700 hover:bg-ink-50"
      }`}
    >
      <span
        aria-hidden
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border ${
          active ? "border-paper" : "border-ink-400"
        }`}
      >
        {active && (
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 fill-none stroke-paper stroke-2">
            <path d="M2 6l2.5 2.5L10 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {label}
    </button>
  );
}
