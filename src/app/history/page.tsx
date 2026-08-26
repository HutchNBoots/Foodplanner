import Link from "next/link";
import { getCurrentHousehold, listWeeks } from "@/lib/db/queries";
import { DeleteWeekButton } from "@/components/DeleteWeekButton";
import type { WeekIntake } from "@/lib/db/schema";

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

const DAYS_MODE_LABEL: Record<WeekIntake["daysMode"], string> = {
  full_week: "Full week",
  weekdays_only: "Weekdays",
  mon_to_sat: "Mon-Sat",
};

const DIRECTION_LABEL: Record<WeekIntake["energyDirection"], string> = {
  lose_weight: "Lose weight",
  balanced: "Balanced",
  build_muscle: "Build muscle",
};

const FOCUS_LABEL: Record<WeekIntake["focuses"][number], string> = {
  increase_protein: "Increase protein",
  reduce_cholesterol: "Reduce cholesterol",
};

/** Formatted one-line summary of what was actually asked for that week -
 * days needed plus the nutrition goal - so a History row says something
 * useful at a glance instead of just a bare date (see DECISIONS.md's
 * "History page: formatted per-week summary + delete" entry).
 *
 * `intakeJson` is stored verbatim at generation time and never rewritten by
 * later migrations (see DECISIONS.md's "Goals selector: two-axis redesign"
 * entry), so a week generated before that field existed has
 * `energyDirection`/`focuses` genuinely `undefined` at runtime even though
 * `WeekIntake` types them as required - guard against that here rather than
 * trusting the type for historical data. */
function goalSummary(intake: WeekIntake): string | null {
  if (!intake.energyDirection) return null;
  const parts = [DIRECTION_LABEL[intake.energyDirection], ...(intake.focuses ?? []).map((f) => FOCUS_LABEL[f])];
  return parts.join(" + ");
}

export default async function HistoryPage() {
  const household = await getCurrentHousehold();
  const weeks = await listWeeks(household.id);

  return (
    <div>
      <h1 className="section-title mb-4 text-2xl">History</h1>
      {weeks.length === 0 ? (
        <p className="text-sm text-ink-500">No weeks planned yet.</p>
      ) : (
        <ul className="space-y-2">
          {weeks.map((week) => {
            const intake = week.intakeJson;
            const hasNotes = Boolean(intake.notes?.trim().length);
            const hasAvoid = Boolean(intake.avoidRepeating?.length);
            const daysLabel = DAYS_MODE_LABEL[intake.daysMode] ?? null;
            const goal = goalSummary(intake);

            return (
              <li key={week.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/plan/${week.id}`}
                    className="min-w-0 flex-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-800 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                  >
                    <span className="font-medium text-ink-800">Week of {week.weekStartDate}</span>
                    <p className="data-figure text-xs text-ink-400">
                      Generated {GENERATED_AT_FORMAT.format(new Date(week.createdAt))}
                    </p>
                    {(daysLabel || goal) && (
                      <p className="mt-1.5 text-xs text-ink-500">
                        {[daysLabel, goal].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {hasNotes && (
                      <p className="mt-1.5 text-xs text-ink-600 italic [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                        &ldquo;{intake.notes}&rdquo;
                      </p>
                    )}
                    {hasAvoid && (
                      <p className="mt-1 text-xs text-ink-500">
                        <span className="font-medium text-ink-600">Avoiding:</span>{" "}
                        {intake.avoidRepeating.join(", ")}
                      </p>
                    )}
                  </Link>
                  <div className="flex shrink-0 flex-col items-end gap-2">
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
                    <DeleteWeekButton weekId={week.id} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
