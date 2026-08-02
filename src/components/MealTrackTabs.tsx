"use client";

import { useState } from "react";
import type { meals } from "@/lib/db/schema";
import { MealCard } from "./MealCard";
import { trackForMeal, type MealTrack } from "@/lib/meals/track";
import { TRACK_COLOR_CLASSES, TRACK_META } from "@/lib/design/tracks";

type Meal = typeof meals.$inferSelect;

const TRACK_TABS: MealTrack[] = ["adult", "kids", "family"];

/** Parents/Kids/Family recipe-view tabs (MVP 1.2, see DECISIONS.md) - a
 * client-side filter over meals already fetched for the week, not a
 * separate fetch/page per tab. The shopping list stays unified across all
 * three tracks (see the shopping page) - this is purely a recipe-browsing
 * convenience. */
export function MealTrackTabs({
  meals: allMeals,
  feedbackByMeal,
}: {
  meals: Meal[];
  feedbackByMeal: Map<string, string>;
}) {
  const [active, setActive] = useState<MealTrack>("adult");
  const filtered = allMeals.filter((meal) => trackForMeal(meal) === active);

  const byDay = new Map<string, Meal[]>();
  for (const meal of filtered) {
    const list = byDay.get(meal.dayDate) ?? [];
    list.push(meal);
    byDay.set(meal.dayDate, list);
  }

  return (
    <div>
      <div role="tablist" aria-label="Meal track" className="mb-4 flex gap-1 rounded-xl bg-ink-100 p-1">
        {TRACK_TABS.map((track) => {
          const meta = TRACK_META[track];
          const isActive = active === track;
          return (
            <button
              key={track}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(track)}
              className={`min-h-11 flex-1 rounded-lg text-center text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-800 focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
                isActive
                  ? `${TRACK_COLOR_CLASSES[meta.color].solid} ${TRACK_COLOR_CLASSES[meta.color].solidText} shadow-sm`
                  : "text-ink-500 hover:text-ink-700"
              }`}
            >
              {meta.label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-ink-500">No meals in this track for this week.</p>
      ) : (
        <div className="space-y-6">
          {Array.from(byDay.entries()).map(([date, dayMeals]) => (
            <section key={date}>
              <h2 className="mb-2 text-sm font-semibold tracking-wide text-ink-500 uppercase">
                {dayMeals[0]?.dayOfWeek} · {date}
              </h2>
              <div className="space-y-3">
                {dayMeals.map((meal) => (
                  <MealCard key={meal.id} meal={meal} feedbackRating={feedbackByMeal.get(meal.id) ?? null} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
