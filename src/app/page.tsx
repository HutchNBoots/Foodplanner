import Link from "next/link";
import { getLatestWeek, getOrCreateHousehold } from "@/lib/db/queries";
import { APP_VERSION } from "@/lib/version";

// Always reflects the latest household/week state - must not be statically
// prerendered at build time (see DECISIONS.md).
export const dynamic = "force-dynamic";

/** `planJson` is stored as `unknown` (see DECISIONS.md's "hybrid blob +
 * normalized tables" entry) - this only reads the one field the home page
 * actually wants, tolerating older/malformed data instead of assuming shape. */
function planSummary(planJson: unknown): string | null {
  if (planJson && typeof planJson === "object" && "summary" in planJson) {
    const { summary } = planJson as { summary: unknown };
    return typeof summary === "string" ? summary : null;
  }
  return null;
}

export default async function HomePage() {
  const household = await getOrCreateHousehold();
  const latestWeek = await getLatestWeek(household.id);
  const summary = latestWeek?.status === "ready" ? planSummary(latestWeek.planJson) : null;

  return (
    <div className="flex flex-col items-center gap-6 py-10 text-center">
      <div className="text-5xl">🥗</div>
      <div>
        <h1 className="text-2xl font-semibold">{household.name}</h1>
        <p className="mt-1 text-neutral-500">Ask → generate → optimise → order.</p>
        <p className="mt-1 text-xs text-neutral-300">v{APP_VERSION}</p>
      </div>

      {latestWeek && (
        <div className="card w-full max-w-sm p-4 text-left">
          <p className="text-sm text-neutral-500">Most recent</p>
          <p className="font-medium">
            Week of {latestWeek.weekStartDate} ·{" "}
            {latestWeek.status === "ready"
              ? "Ready"
              : latestWeek.status === "generating"
                ? "Generating..."
                : "Failed"}
          </p>
          {summary && <p className="mt-2 text-sm text-neutral-600">{summary}</p>}
          {latestWeek.status === "ready" ? (
            <div className="mt-3 flex gap-2">
              <Link href={`/plan/${latestWeek.id}`} className="btn-secondary flex-1 text-center">
                Recipes
              </Link>
              <Link href={`/plan/${latestWeek.id}/shopping`} className="btn-secondary flex-1 text-center">
                Shopping list
              </Link>
            </div>
          ) : (
            <Link href={`/plan/${latestWeek.id}`} className="mt-3 inline-block text-sm text-brand-600 underline">
              View details
            </Link>
          )}
        </div>
      )}

      <Link href="/plan/new" className="btn-primary">
        Plan a new week
      </Link>
    </div>
  );
}
