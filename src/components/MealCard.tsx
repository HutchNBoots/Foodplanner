import type { meals } from "@/lib/db/schema";
import { RecipePhoto } from "./RecipePhoto";
import { FeedbackControls } from "./FeedbackControls";
import { IngredientLine } from "./IngredientLine";

type Meal = typeof meals.$inferSelect;

const SLOT_LABEL: Record<string, string> = {
  lunch: "Lunch",
  dinner: "Dinner",
  sunday_special: "Sunday",
};

export function MealCard({ meal, feedbackRating }: { meal: Meal; feedbackRating: string | null }) {
  return (
    <article className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
          {SLOT_LABEL[meal.slot] ?? meal.slot}
        </span>
        {meal.batchMakes && (
          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
            Makes {meal.batchMakes}
            {meal.leftoverForJson?.length
              ? ` · saved for ${meal.leftoverForJson.map((l) => `${l.day} ${SLOT_LABEL[l.slot] ?? l.slot}`).join(", ")}`
              : ""}
          </span>
        )}
      </div>

      <h3 className="mt-2 text-lg font-semibold">{meal.title}</h3>
      <p className="text-sm text-neutral-500">
        {meal.servingsAdults} adult{meal.servingsAdults === 1 ? "" : "s"}
        {meal.servingsKids ? ` · ${meal.servingsKids} kid${meal.servingsKids === 1 ? "" : "s"}` : ""}
      </p>

      <div className="mt-3">
        <RecipePhoto
          src={meal.imageUrl}
          alt={meal.title}
          source={meal.imageSource}
          credit={meal.imageCreditJson}
        />
      </div>

      <MacrosRow meal={meal} />

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium text-neutral-700">
          Ingredients ({meal.ingredientsJson.length})
        </summary>
        <ul className="mt-2 space-y-1 text-neutral-600">
          {meal.ingredientsJson.map((ing, i) => (
            <li key={i}>
              <IngredientLine ingredient={ing} />
            </li>
          ))}
        </ul>
      </details>

      <details className="mt-2 text-sm">
        <summary className="cursor-pointer font-medium text-neutral-700">Method</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-neutral-600">
          {meal.methodJson.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </details>

      <FeedbackControls
        mealId={meal.id}
        weekId={meal.weekId}
        initialRating={feedbackRating as never}
      />
    </article>
  );
}

function MacrosRow({ meal }: { meal: Meal }) {
  const stats = [
    { label: "kcal", value: Math.round(meal.kcal) },
    { label: "protein", value: `${Math.round(meal.proteinG)}g` },
    { label: "carbs", value: `${Math.round(meal.carbsG)}g` },
    { label: "fat", value: `${Math.round(meal.fatG)}g` },
    { label: "fibre", value: `${Math.round(meal.fibreG)}g` },
  ];

  return (
    <div className="mt-3 grid grid-cols-5 gap-1 rounded-lg bg-neutral-50 p-2 text-center">
      {stats.map((s) => (
        <div key={s.label}>
          <div className="text-sm font-semibold text-neutral-800">{s.value}</div>
          <div className="text-[10px] uppercase tracking-wide text-neutral-400">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
