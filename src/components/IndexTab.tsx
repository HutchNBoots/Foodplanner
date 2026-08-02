import { TRACK_COLOR_CLASSES, type TrackColor } from "@/lib/design/tracks";

/** The milestone's signature element (see DECISIONS.md's "MVP 1.3" entry) -
 * a recipe-box divider tab in the track color, fused to a card/section's
 * top-left corner. Deliberately non-interactive (a `<span>`, no hover/active
 * state, `cursor-default`) so it reads as a label, not another tappable
 * control sitting above genuinely tappable ones. */
export function IndexTab({ color, label }: { color: TrackColor; label: string }) {
  const classes = TRACK_COLOR_CLASSES[color];
  return (
    <span
      className={`absolute -top-3 left-3 z-10 inline-block cursor-default select-none rounded-t-md rounded-br-md px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-wide ${classes.tab}`}
    >
      {label}
    </span>
  );
}

/** A `.card` with an `IndexTab` fused to its top-left corner - the standard
 * wrapper for every track-scoped cluster/section in the app. */
export function TrackSection({
  color,
  label,
  children,
  className = "",
}: {
  color: TrackColor;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`relative mt-5 ${className}`}>
      <IndexTab color={color} label={label} />
      <div className="card space-y-4 rounded-tl-none p-4 pt-5">{children}</div>
    </section>
  );
}

/** A `TrackSection` that starts collapsed to a one-line summary (see
 * DECISIONS.md's "MVP 1.3" entry, UX/interaction pressure-test): for
 * clusters that already have a real household default wired in, showing the
 * full control set on every visit costs vertical space a returning user
 * rarely needs - tap the summary row to expand and edit. */
export function CollapsibleTrackSection({
  color,
  label,
  summary,
  children,
  defaultOpen = false,
}: {
  color: TrackColor;
  label: string;
  summary: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    // A native <details> only ever renders its <summary> child while closed
    // - everything else (including a sibling IndexTab) gets hidden by the
    // browser. The IndexTab has to live *inside* <summary> to stay visible
    // in the collapsed state (caught in the mobile screenshot pass, see
    // DECISIONS.md's "MVP 1.3" entry).
    <details className="group relative mt-5" open={defaultOpen}>
      <summary className="card flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-tl-none p-4 pt-5 [&::-webkit-details-marker]:hidden">
        <IndexTab color={color} label={label} />
        <span className="min-w-0 text-sm leading-snug text-ink-600 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
          {summary}
        </span>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="h-4 w-4 shrink-0 text-ink-400 transition group-open:rotate-180"
        >
          <path
            d="M5 7l5 5 5-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>
      <div className="card mt-2 space-y-4 p-4">{children}</div>
    </details>
  );
}
