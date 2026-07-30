import Link from "next/link";

export function WeekTabs({ weekId, active }: { weekId: string; active: "recipes" | "shopping" }) {
  const tabs = [
    { href: `/plan/${weekId}`, key: "recipes", label: "Recipes" },
    { href: `/plan/${weekId}/shopping`, key: "shopping", label: "Shopping list" },
  ] as const;

  return (
    <div className="mb-4 flex gap-1 rounded-full bg-neutral-100 p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`flex-1 rounded-full py-2 text-center text-sm font-medium transition ${
            active === tab.key ? "bg-white text-brand-700 shadow-sm" : "text-neutral-500"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
