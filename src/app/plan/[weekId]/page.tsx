import Link from "next/link";
import { notFound } from "next/navigation";
import { getWeekDetail } from "@/lib/db/queries";
import { GeneratingStatus } from "@/components/GeneratingStatus";
import { WeekTabs } from "@/components/WeekTabs";
import { MealCard } from "@/components/MealCard";
import { RetryGenerationButton } from "@/components/RetryGenerationButton";
import { WeekNutritionSummary } from "@/components/WeekNutritionSummary";

export const dynamic = "force-dynamic";

export default async function WeekPlanPage({ params }: { params: Promise<{ weekId: string }> }) {
  const { weekId } = await params;
  const detail = await getWeekDetail(weekId);
  if (!detail) notFound();

  const { week, meals, feedback } = detail;

  if (week.status === "generating") {
    return <GeneratingStatus weekId={weekId} />;
  }

  if (week.status === "error") {
    return (
      <div className="py-16 text-center">
        <p className="font-medium text-red-700">Generation failed</p>
        <p className="mt-1 text-sm text-neutral-500">
          {week.errorMessage ?? "Something went wrong and no reason was recorded."}
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <RetryGenerationButton weekId={weekId} />
          <Link href="/plan/new" className="text-sm text-neutral-500 underline">
            Start a new week instead
          </Link>
        </div>
      </div>
    );
  }

  const byDay = new Map<string, typeof meals>();
  for (const meal of meals) {
    const list = byDay.get(meal.dayDate) ?? [];
    list.push(meal);
    byDay.set(meal.dayDate, list);
  }

  const latestFeedbackByMeal = new Map<string, string>();
  for (const fb of feedback) {
    latestFeedbackByMeal.set(fb.mealId, fb.rating);
  }

  return (
    <div>
      <WeekTabs weekId={weekId} active="recipes" />
      <h1 className="text-xl font-semibold">Week of {week.weekStartDate}</h1>

      <div className="mt-4">
        <WeekNutritionSummary meals={meals} />
      </div>

      <div className="mt-4 space-y-6">
        {Array.from(byDay.entries()).map(([date, dayMeals]) => (
          <section key={date}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              {dayMeals[0]?.dayOfWeek} · {date}
            </h2>
            <div className="space-y-3">
              {dayMeals.map((meal) => (
                <MealCard
                  key={meal.id}
                  meal={meal}
                  feedbackRating={latestFeedbackByMeal.get(meal.id) ?? null}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
