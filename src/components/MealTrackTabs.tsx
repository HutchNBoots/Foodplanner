"use client";

import { useState } from "react";
import type { meals } from "@/lib/db/schema";
import { MealCard } from "./MealCard";
import { trackForMeal, type MealTrack } from "@/lib/meals/track";

type Meal = typeof meals.$inferSelect;

const TRACK_TABS: { value: MealTrack; label: string }[] = [
  { value: "adult", label: "Parents" },
  { value: "kids", label: "Kids" },
  { value: "family", label: "Family" },
];

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
      <div className="mb-4 flex gap-1 rounded-full bg-neutral-100 p-1">
        {TRACK_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActive(tab.value)}
            className={`flex-1 rounded-full py-2 text-center text-sm font-medium transition ${
              active === tab.value ? "bg-white text-brand-700 shadow-sm" : "text-neutral-500"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-neutral-500">No meals in this track for this week.</p>
      ) : (
        <div className="space-y-6">
          {Array.from(byDay.entries()).map(([date, dayMeals]) => (
            <section key={date}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
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
