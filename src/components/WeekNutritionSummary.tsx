import type { meals } from "@/lib/db/schema";
import { computeNutritionSummary } from "@/lib/nutrition/summary";

type Meal = typeof meals.$inferSelect;

const DATE_LABEL = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** Week-level "am I on track" summary (MVP 1.1 "must-ship" CX item, see
 * DECISIONS.md) - per-adult daily average plus a per-day breakdown, so the
 * household can tell at a glance whether the week is roughly hitting the
 * calorie-deficit/protein goal (PROJECT.md §3) without adding up every meal
 * card by hand.
 *
 * MVP 1.3 (see DECISIONS.md): closed by default rather than `open` - the
 * headline average already lives in the `<summary>` line, so nothing
 * informational is lost by collapsing, and it stops pushing the meal tabs
 * down on every single visit. Each day also gets a small relative bar
 * (length relative to the week's highest day) instead of requiring the
 * reader to compare seven rows of plain digits by eye. */
export function WeekNutritionSummary({ meals: weekMeals }: { meals: Meal[] }) {
  const summary = computeNutritionSummary(weekMeals);
  if (summary.byDay.length === 0) return null;

  const maxKcal = Math.max(...summary.byDay.map((d) => d.kcal), 1);

  return (
    <details className="card group p-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-semibold text-ink-800 [&::-webkit-details-marker]:hidden">
        <span>
          Week nutrition (per adult) - <span className="data-figure">{Math.round(summary.dailyAverage.kcal)}</span>{" "}
          kcal · <span className="data-figure">{Math.round(summary.dailyAverage.proteinG)}g</span> protein / day avg
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
      <ul className="mt-3 space-y-2.5">
        {summary.byDay.map((day) => (
          <li key={day.dayDate} className="text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-ink-600">{DATE_LABEL.format(new Date(`${day.dayDate}T00:00:00`))}</span>
              <span className="data-figure text-ink-800">
                {Math.round(day.kcal)} kcal · {Math.round(day.proteinG)}g protein
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
              <div
                className="h-full rounded-full bg-sage-500"
                style={{ width: `${Math.min(100, Math.round((day.kcal / maxKcal) * 100))}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-ink-100 pt-2 text-xs text-ink-500">
        Week total: <span className="data-figure">{Math.round(summary.weekTotal.kcal)}</span> kcal ·{" "}
        <span className="data-figure">{Math.round(summary.weekTotal.proteinG)}g</span> protein
      </p>
    </details>
  );
}
