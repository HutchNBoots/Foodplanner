import { getCurrentHousehold, getRecentMealTitles } from "@/lib/db/queries";
import { PROTEIN_TYPES, upcomingMonday } from "@/lib/intake";
import { deemphasisedStyles, DISH_STYLES } from "@/lib/season";

export const dynamic = "force-dynamic";
import { IntakeForm } from "@/components/IntakeForm";

export default async function NewWeekPage() {
  const household = await getCurrentHousehold();
  const recentTitles = await getRecentMealTitles(household.id, 3);

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="section-title text-2xl">Plan the week</h1>
      <p className="mt-1 text-sm text-ink-500">
        A few quick questions, then Claude generates the full week.
      </p>
      <IntakeForm
        defaultWeekStartDate={upcomingMonday()}
        defaultSatBreakfastMode={household.satBreakfastDefaultMode as "sit_down" | "skip"}
        defaultSatEveningMode={household.satEveningDefaultMode as "sit_down" | "bbq" | "skip"}
        defaultSunLunchMode={household.sunLunchDefaultMode as "sit_down" | "bbq" | "skip"}
        defaultBudget={household.budgetDefault ?? ""}
        defaultProteins={household.favoriteProteins}
        defaultEnergyDirection={household.energyDirection}
        defaultFocuses={household.focuses}
        recentTitles={recentTitles.slice(0, 8)}
        dishStyles={[...DISH_STYLES]}
        deemphasised={deemphasisedStyles()}
        proteinTypes={[...PROTEIN_TYPES]}
      />
    </div>
  );
}
