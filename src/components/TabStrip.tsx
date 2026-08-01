/** Joined-segment single-select control - replaces the generic rounded pill
 * for "pick exactly one" choices (days needed, family occasion, effort). See
 * DECISIONS.md's "MVP 1.3" entry: segments are `min-h-11` (not fixed
 * padding) to hold a 44px tap target regardless of label length/wrap. */
export function TabStrip<T extends string>({
  options,
  value,
  onChange,
  name,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  name?: string;
}) {
  return (
    <div role="tablist" aria-label={name} className="flex gap-1 rounded-xl bg-ink-100 p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`min-h-11 flex-1 rounded-lg px-2 py-2 text-center text-sm leading-tight font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-800 focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
            value === opt.value
              ? "bg-paper-raised text-ink-800 shadow-sm"
              : "text-ink-500 hover:text-ink-700"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
