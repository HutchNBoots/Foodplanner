import Link from "next/link";
import { getLatestWeek, getOrCreateHousehold } from "@/lib/db/queries";
import { APP_VERSION } from "@/lib/version";

// Always reflects the latest household/week state - must not be statically
// prerendered at build time (see DECISIONS.md).
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const household = await getOrCreateHousehold();
  const latestWeek = await getLatestWeek(household.id);

  return (
    <div className="flex flex-col items-center gap-6 py-10 text-center">
      <div className="text-5xl">🥗</div>
      <div>
        <h1 className="text-2xl font-semibold">{household.name}</h1>
        <p className="mt-1 text-neutral-500">Ask → generate → optimise → order.</p>
        <p className="mt-1 text-xs text-neutral-300">v{APP_VERSION}</p>
      </div>

      {latestWeek && (
        <Link href={`/plan/${latestWeek.id}`} className="card w-full max-w-sm p-4 text-left">
          <p className="text-sm text-neutral-500">Most recent</p>
          <p className="font-medium">
            Week of {latestWeek.weekStartDate} ·{" "}
            {latestWeek.status === "ready"
              ? "Ready"
              : latestWeek.status === "generating"
                ? "Generating..."
                : "Failed"}
          </p>
        </Link>
      )}

      <Link href="/plan/new" className="btn-primary">
        Plan a new week
      </Link>
    </div>
  );
}
