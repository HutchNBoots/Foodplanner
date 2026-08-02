import Link from "next/link";
import { getOrCreateHousehold, listWeeks } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  ready: "Ready",
  generating: "Generating...",
  error: "Failed",
};

// Several attempts can share the exact same `weekStartDate` (a retry, or the
// intake form's date field just wasn't changed) - showing when each attempt
// was actually generated is what makes otherwise-identical rows tell apart
// (see DECISIONS.md's "History page / duplicate-date bug" entry).
const GENERATED_AT_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function HistoryPage() {
  const household = await getOrCreateHousehold();
  const weeks = await listWeeks(household.id);

  return (
    <div>
      <h1 className="section-title mb-4 text-2xl">History</h1>
      {weeks.length === 0 ? (
        <p className="text-sm text-ink-500">No weeks planned yet.</p>
      ) : (
        <ul className="space-y-2">
          {weeks.map((week) => (
            <li key={week.id}>
              <Link
                href={`/plan/${week.id}`}
                className="card flex min-h-11 items-center justify-between p-4 transition hover:border-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-800 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
              >
                <div>
                  <span className="font-medium text-ink-800">Week of {week.weekStartDate}</span>
                  <p className="data-figure text-xs text-ink-400">
                    Generated {GENERATED_AT_FORMAT.format(new Date(week.createdAt))}
                  </p>
                </div>
                <span
                  className={`text-sm font-medium ${
                    week.status === "ready"
                      ? "text-sage-600"
                      : week.status === "error"
                        ? "text-red-600"
                        : "text-ink-500"
                  }`}
                >
                  {STATUS_LABEL[week.status] ?? week.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
