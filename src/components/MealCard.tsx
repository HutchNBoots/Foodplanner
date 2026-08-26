import type { meals } from "@/lib/db/schema";
import { RecipePhoto } from "./RecipePhoto";
import { FeedbackControls } from "./FeedbackControls";
import { IngredientLine } from "./IngredientLine";
import { IndexTab } from "./IndexTab";
import { SwapMealButton } from "./SwapMealButton";
import { DeleteMealButton } from "./DeleteMealButton";
import { TRACK_COLOR_CLASSES, TRACK_META } from "@/lib/design/tracks";
import { trackForMeal } from "@/lib/meals/track";

type Meal = typeof meals.$inferSelect;

const SLOT_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  // Legacy value from before MVP 1.2 - old weeks still hold this literal
  // string in the `slot` column (see DECISIONS.md), kept renderable here.
  sunday_special: "Sunday",
};

export function MealCard({ meal, feedbackRating }: { meal: Meal; feedbackRating: string | null }) {
  const track = TRACK_META[trackForMeal(meal)];

  return (
    <article className="relative">
      <IndexTab color={track.color} label={track.label} />
      <div className="card rounded-tl-none p-4 pt-5">
        <div className="flex items-center justify-between gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TRACK_COLOR_CLASSES[track.color].soft} ${TRACK_COLOR_CLASSES[track.color].softText}`}>
            {SLOT_LABEL[meal.slot] ?? meal.slot}
          </span>
          {meal.batchMakes && (
            <span className="rounded-full bg-kids-50 px-2.5 py-0.5 text-xs font-medium text-kids-700">
              Makes {meal.batchMakes}
              {meal.leftoverForJson?.length
                ? ` · saved for ${meal.leftoverForJson.map((l) => `${l.day} ${SLOT_LABEL[l.slot] ?? l.slot}`).join(", ")}`
                : ""}
              {meal.freezerPortions ? ` · ${meal.freezerPortions} frozen for later` : ""}
            </span>
          )}
          {/* Freezer inventory tracking (backlog item, see DECISIONS.md) -
              mutually exclusive with batchMakes above (a meal either makes a
              new batch or reheats an old one, never both). */}
          {meal.usesFreezerItem && (
            <span className="rounded-full bg-sage-50 px-2.5 py-0.5 text-xs font-medium text-sage-700">
              From the freezer
            </span>
          )}
        </div>

        <h3 className="section-title mt-2">{meal.title}</h3>
        <p className="text-sm text-ink-500">
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
          <summary className="min-h-11 cursor-pointer py-1 font-medium text-ink-700">
            Ingredients ({meal.ingredientsJson.length})
          </summary>
          <ul className="mt-2 space-y-1 text-ink-600">
            {meal.ingredientsJson.map((ing, i) => (
              <li key={i}>
                <IngredientLine ingredient={ing} />
              </li>
            ))}
          </ul>
        </details>

        <details className="mt-1 text-sm">
          <summary className="min-h-11 cursor-pointer py-1 font-medium text-ink-700">Method</summary>
          <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-ink-600">
            {meal.methodJson.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </details>

        {/* Batch-cook meals aren't offered a swap or delete - other days
            rely on them as leftovers, and the server would reject either
            anyway (see DECISIONS.md's "Swap this meal" and "Delete this
            meal" entries). */}
        {!meal.batchMakes && (
          <div className="mt-2 flex gap-2">
            <SwapMealButton mealId={meal.id} />
            <DeleteMealButton mealId={meal.id} />
          </div>
        )}

        <FeedbackControls
          mealId={meal.id}
          weekId={meal.weekId}
          initialRating={feedbackRating as never}
        />
      </div>
    </article>
  );
}

/** Two-tier macro layout (MVP 1.3, see DECISIONS.md): kcal/protein - the two
 * figures §3's calorie-deficit/high-protein goal actually tracks - get
 * visual priority over carbs/fat/fibre, and every figure uses the `data`
 * (monospace, tabular) face rather than the body face. */
function MacrosRow({ meal }: { meal: Meal }) {
  const primary = [
    { label: "kcal", value: Math.round(meal.kcal) },
    { label: "protein", value: `${Math.round(meal.proteinG)}g` },
  ];
  const secondary = [
    { label: "carbs", value: `${Math.round(meal.carbsG)}g` },
    { label: "fat", value: `${Math.round(meal.fatG)}g` },
    { label: "fibre", value: `${Math.round(meal.fibreG)}g` },
  ];

  return (
    <div className="mt-3 rounded-lg bg-ink-50 p-2.5">
      <div className="grid grid-cols-2 gap-2 text-center">
        {primary.map((s) => (
          <div key={s.label}>
            <div className="data-figure text-lg font-semibold text-ink-800">{s.value}</div>
            <div className="text-[10px] tracking-wide text-ink-400 uppercase">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 border-t border-ink-100 pt-2 text-center">
        {secondary.map((s) => (
          <div key={s.label}>
            <div className="data-figure text-sm font-medium text-ink-600">{s.value}</div>
            <div className="text-[10px] tracking-wide text-ink-400 uppercase">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
