import Link from "next/link";
import { notFound } from "next/navigation";
import { getWeekDetail } from "@/lib/db/queries";
import { GeneratingStatus } from "@/components/GeneratingStatus";
import { WeekTabs } from "@/components/WeekTabs";
import { MealTrackTabs } from "@/components/MealTrackTabs";
import { RetryGenerationButton } from "@/components/RetryGenerationButton";
import { WeekNutritionSummary } from "@/components/WeekNutritionSummary";
import { trackForMeal } from "@/lib/meals/track";

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

  const latestFeedbackByMeal = new Map<string, string>();
  for (const fb of feedback) {
    latestFeedbackByMeal.set(fb.mealId, fb.rating);
  }

  // Week nutrition (MVP 1.1) is scoped to adult+family meals only (MVP 1.2) -
  // kids-track macros reflect balanced kid-portion nutrition, not the adult
  // deficit/high-protein framing, so mixing them into one "week nutrition"
  // total would misrepresent both (see DECISIONS.md).
  const nutritionMeals = meals.filter((meal) => trackForMeal(meal) !== "kids");

  return (
    <div>
      <WeekTabs weekId={weekId} active="recipes" />
      <h1 className="section-title text-xl">Week of {week.weekStartDate}</h1>

      <div className="mt-4">
        <WeekNutritionSummary meals={nutritionMeals} />
      </div>

      <div className="mt-4">
        <MealTrackTabs meals={meals} feedbackByMeal={latestFeedbackByMeal} />
      </div>
    </div>
  );
}
