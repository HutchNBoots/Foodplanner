import type { meals } from "@/lib/db/schema";
import { computeNutritionSummary } from "@/lib/nutrition/summary";

type Meal = typeof meals.$inferSelect;

const DATE_LABEL = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** Week-level "am I on track" summary (MVP 1.1 "must-ship" CX item, see
 * DECISIONS.md) - per-adult daily average plus a per-day breakdown, so the
 * household can tell at a glance whether the week is roughly hitting the
 * calorie-deficit/protein goal (PROJECT.md §3) without adding up every meal
 * card by hand. */
export function WeekNutritionSummary({ meals: weekMeals }: { meals: Meal[] }) {
  const summary = computeNutritionSummary(weekMeals);
  if (summary.byDay.length === 0) return null;

  return (
    <details className="card p-4" open>
      <summary className="cursor-pointer font-semibold text-neutral-800">
        Week nutrition (per adult) - {Math.round(summary.dailyAverage.kcal)} kcal ·{" "}
        {Math.round(summary.dailyAverage.proteinG)}g protein / day avg
      </summary>
      <ul className="mt-3 divide-y divide-neutral-100 text-sm">
        {summary.byDay.map((day) => (
          <li key={day.dayDate} className="flex items-center justify-between py-1.5">
            <span className="text-neutral-600">{DATE_LABEL.format(new Date(`${day.dayDate}T00:00:00`))}</span>
            <span className="text-neutral-800">
              {Math.round(day.kcal)} kcal · {Math.round(day.proteinG)}g protein
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-neutral-100 pt-2 text-xs text-neutral-400">
        Week total: {Math.round(summary.weekTotal.kcal)} kcal · {Math.round(summary.weekTotal.proteinG)}g protein
      </p>
    </details>
  );
}
