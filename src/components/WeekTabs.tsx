import Link from "next/link";

/** The Recipes/Shopping-list switch - the "recipe box" framing calls for
 * something more specific than a generic rounded pill (see DECISIONS.md's
 * "MVP 1.3" entry): a joined tab-strip with a flat bottom edge, read as the
 * two tabs of a recipe box rather than a pill toggle. */
export function WeekTabs({ weekId, active }: { weekId: string; active: "recipes" | "shopping" }) {
  const tabs = [
    { href: `/plan/${weekId}`, key: "recipes", label: "Recipes" },
    { href: `/plan/${weekId}/shopping`, key: "shopping", label: "Shopping list" },
  ] as const;

  return (
    // These are real page navigations (a different URL per tab), not an
    // in-page ARIA tab/tabpanel pair, so links keep their native "link"
    // role/semantics (`aria-current`, not `role="tab"`/`aria-selected`) even
    // though they're styled as a joined tab-strip - see DECISIONS.md's
    // "MVP 1.3" entry.
    <nav aria-label="Week view" className="mb-4 flex gap-1 rounded-xl bg-ink-100 p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={active === tab.key ? "page" : undefined}
          className={`flex min-h-11 flex-1 items-center justify-center rounded-lg text-center text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-800 focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
            active === tab.key ? "bg-paper-raised text-ink-800 shadow-sm" : "text-ink-500 hover:text-ink-700"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
