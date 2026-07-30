import Link from "next/link";
import { getOrCreateHousehold, listWeeks } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  ready: "Ready",
  generating: "Generating...",
  error: "Failed",
};

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
                <span className="font-medium">Week of {week.weekStartDate}</span>
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
