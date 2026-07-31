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
      <h1 className="mb-4 text-2xl font-semibold">History</h1>
      {weeks.length === 0 ? (
        <p className="text-sm text-neutral-500">No weeks planned yet.</p>
      ) : (
        <ul className="space-y-2">
          {weeks.map((week) => (
            <li key={week.id}>
              <Link href={`/plan/${week.id}`} className="card flex items-center justify-between p-4">
                <div>
                  <span className="font-medium">Week of {week.weekStartDate}</span>
                  <p className="text-xs text-neutral-400">
                    Generated {GENERATED_AT_FORMAT.format(new Date(week.createdAt))}
                  </p>
                </div>
                <span
                  className={`text-sm ${
                    week.status === "ready"
                      ? "text-brand-600"
                      : week.status === "error"
                        ? "text-red-600"
                        : "text-neutral-500"
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
