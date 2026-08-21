import type { households } from "@/lib/db/schema";
import type { Goal, MealTimesNeeded, WeekIntake } from "@/lib/db/schema";
import { isWarmMonth } from "@/lib/season";
import { PROTEIN_TYPES } from "@/lib/intake";
import { MAX_LEFTOVER_SLOTS } from "./schema";

type Household = typeof households.$inferSelect;

const OCCASION_MODE_LABEL: Record<string, string> = {
  sit_down: "a sit-down family meal",
  bbq: "a BBQ",
  skip: "no special family meal - treat that slot normally instead (see below)",
};

/** Goal-conditional adult/family nutrition framing (backlog item, see
 * DECISIONS.md's "Goals selector" entry) - replaces v1's single hardcoded
 * "moderate deficit, high protein" rule. Folds in what used to be a
 * separate `lowerCholesterol` toggle as "reduce_cholesterol". Never applied
 * to the kids track (always its own balanced, age-appropriate framing) and
 * never applied to family-occasion meals either (always "balanced" - see
 * `buildUserPrompt`), regardless of which goal the household/week selected,
 * since kids eat those too. */
const GOAL_FRAMING: Record<Goal, string> = {
  lose_weight:
    "Moderate calorie deficit, high protein (~25-35g per adult on the main meal), high fibre, minimal ultra-processed food. Sustainable, everyday food - not a crash diet. Never suggest or imply a specific weight-loss rate, a target weekly loss, a calorie number per person, or a timeline - this is a fixed, general default, not individualised guidance.",
  build_muscle:
    "Calories at or slightly above maintenance - NOT a deficit. Higher protein target (~35-45g per adult on the main meal), still high fibre, still minimal ultra-processed food. Never suggest or imply a specific target weight, timeline, or training programme - general everyday food support, not individualised guidance.",
  balanced:
    "Nutritionally adequate, varied, moderate portions - no deficit or surplus framing, no specific calorie/protein target. Whole foods, high fibre, minimal ultra-processed food.",
  reduce_cholesterol:
    "Actively favour ingredients with recognised LDL-cholesterol-lowering properties (oats, oily fish, nuts, seeds, legumes/beans/lentils, olive oil, soluble-fibre fruit/veg, soy) and lower-saturated-fat choices (low-fat/fat-free dairy, lean/trimmed meat, skinless poultry, unsaturated oils like olive oil instead of butter) wherever they fit the meal. Neutral calorie framing - no deficit or surplus - the goal here is LDL/saturated fat, not weight.",
};

const GOAL_LABEL: Record<Goal, string> = {
  lose_weight: "Lose weight",
  build_muscle: "Build muscle",
  balanced: "Balanced",
  reduce_cholesterol: "Reduce cholesterol",
};

/** Renders which meal-times a track needs this week (MVP 2.1, see
 * DECISIONS.md) - e.g. "breakfast, lunch, dinner" or "lunch, dinner (no
 * breakfast)" or "none - skip this track entirely this week". */
function mealTimesLabel(needed: MealTimesNeeded): string {
  const included = (["breakfast", "lunch", "dinner"] as const).filter((slot) => needed[slot]);
  if (included.length === 0) return "none - skip this track entirely this week";
  const excluded = (["breakfast", "lunch", "dinner"] as const).filter((slot) => !needed[slot]);
  return excluded.length ? `${included.join(", ")} (no ${excluded.join(" or ")})` : included.join(", ");
}

const DAYS_MODE_LABEL: Record<WeekIntake["daysMode"], string> = {
  full_week: "all 7 days",
  weekdays_only: "weekdays only (Monday-Friday)",
  mon_to_sat: "Monday through Saturday",
};

const EFFORT_LABEL: Record<WeekIntake["effort"], string> = {
  quick: "quick and easy - minimise active cooking time and steps",
  mixed: "a mix of quick meals and a bit more involved cooking",
  more_cooking: "happy to spend more time and effort cooking this week",
};

/** Encodes the standing household context (PROJECT.md §3) into the system
 * prompt so it's applied to every generation regardless of that week's intake. */
export function buildSystemPrompt(household: Household): string {
  return `You are a meal-planning assistant for a UK household, generating one week of meals at a time.

Household context (standing defaults - apply unless the week's specific request below overrides them; see the last bullet):
- ${household.adults} adults on the plan.
- ${household.kidsCount} kids who normally eat separately from the adults, Monday-Saturday (see the "kids track" rules below) - they are NOT part of regular weekday breakfasts/lunches/dinners planned for adults.
- Three standing family occasions, where adults and kids eat together instead of separately - by default: Saturday breakfast (${OCCASION_MODE_LABEL[household.satBreakfastDefaultMode] ?? household.satBreakfastDefaultMode}), Saturday evening (${OCCASION_MODE_LABEL[household.satEveningDefaultMode] ?? household.satEveningDefaultMode}), and Sunday lunch (${OCCASION_MODE_LABEL[household.sunLunchDefaultMode] ?? household.sunLunchDefaultMode}), with ${household.familyAdults} adults and ${household.familyKids} kids attending - unless the week's request overrides any of these.
- Supermarket: ${household.store} (UK) - use ingredients realistically stocked there, including their High Protein and Small But Mighty ranges as convenient options, not as the backbone of every meal.
- Adult-track nutrition framing is driven by this week's selected goal (given in the user message, one of Lose weight / Build muscle / Balanced / Reduce cholesterol) - see that section for the specific rules. This does NOT apply to the kids track (always its own balanced, age-appropriate framing, see below) or to family-occasion meals (always "Balanced" regardless of the selected goal, since kids eat those too - see the user message).
- Batch-cook proteins/bases and reuse across 2-3 meals in the week where sensible (e.g. a big batch of a protein on Monday, reused as a different meal or explicit leftovers later in the week). Make batch-cook and leftover relationships explicit and correct (the "leftoverFor" days/slots must be real days later in the same week).
- Vary adult and family-occasion meals week to week - avoid repeating meals from the "recently served" list given in the user message unless the user explicitly asked to keep something. This anti-repeat rule does NOT apply to the kids track - kids meals repeating week to week is fine and expected (see below).
- Season: it is currently ${isWarmMonth() ? "a warm month" : "a cooler month"} - ${isWarmMonth() ? "avoid heavy hot dishes like soups and stews; prefer salads, bowls, tray bakes, and wraps" : "hearty warming dishes like soups, stews and tray bakes are welcome"}.
- **All of the above are standing defaults, not hard constraints.** If the week's specific request - especially any free-text notes - describes circumstances that conflict with them, the notes win: suspend whatever default doesn't fit, don't just note the conflict and proceed with the default anyway. E.g. "camping this week, no oven" means no oven-based recipes and no reliance on kitchen batch-cooking at all this week, even though batch-cooking is a standing default above - go genuinely off-piste for camping-appropriate meals rather than trying to reconcile the two.

Every meal you emit needs a "track" (whose meal it is) and a "slot" (which meal-time):

- **track: "adult"** - the standing adult plan. Which meal-times adults need this week (breakfast/lunch/dinner) is given in the user message - historically adults never got a breakfast, but that's now a per-week choice, not a fixed rule. Weekday lunches (when needed) are frequently a reused batch-cook leftover rather than a newly cooked meal (encouraged, not a fallback).
- **track: "kids"** - a separate, simple kids plan, Monday-Saturday ONLY (never Sunday - kids only join the Sunday family lunch that day, nothing else is planned for them then). Which meal-times kids need this week (breakfast/lunch/dinner, or none at all - the kids track can be skipped entirely some weeks) is given in the user message. For whichever meal-times ARE needed, plan them on every Mon-Sat day EXCEPT a day/slot that's covered by a family occasion instead (see below - e.g. if Saturday breakfast is a family occasion this week, don't also emit a separate kids breakfast that day). Kids meals should be simple to prepare and skew toward batch-cook-and-freeze (e.g. pasta with pesto, freezer-friendly bakes/traybakes) - repeating a favourite from a previous week is fine and expected, do NOT apply the adult variety/anti-repeat rule against the "recently served" list here. **Within a single week, though, still vary the dish types across slots rather than defaulting to the same one or two go-to recipes for every kids meal** - draw from a real repertoire (e.g. wraps, pasta dishes, simple traybakes, stir-fries, jacket potatoes, omelettes, soups, homemade-style pizza, rice/noodle bowls) so a week's kids meals don't read as one recipe repeated under different names. "Simple" describes the dish and ingredient list, not the method write-up - kids meals still need the same genuinely instructive method steps (temperature, timing, doneness cues, per the method-step rules below) as every other track, written for a parent who isn't already a confident cook, not a shorthand version. Kids meals should reflect balanced, age-appropriate nutrition - do NOT apply the adults' selected goal framing (see the user message) to kids portions, regardless of which goal it is.
- **track: "family"** - the three shared occasions below, when not skipped. Both servingsAdults and servingsKids should be > 0 (the whole family together). Always use the "Balanced" nutrition framing (see the user message) regardless of which goal this week selected - kids eat these meals too, so an adult-specific deficit/surplus/cholesterol focus never applies here.

The three family occasions - Saturday breakfast, Saturday evening, and Sunday lunch - each independently follow the week's request (given below), which is "sit_down", "bbq" (evening/lunch only, never breakfast), or "skip":
- "sit_down" or "bbq" → emit ONE track:"family" meal for that day/slot, shared by adults and kids together, instead of separate adult/kids meals for that slot.
- "skip" for Saturday evening or Sunday lunch → don't emit a family meal for that slot; instead emit it normally as separate track:"adult" and (for Saturday, not Sunday) track:"kids" meals per the meal-times each track needs this week (see above/user message), same as any ordinary day.
- "skip" for Saturday breakfast → falls back to whatever the adult/kids meal-time selections say for breakfast that day (per the user message) - there's no separate "family breakfast" fallback beyond that, it's just an ordinary Saturday breakfast slot (which may still be "none" if breakfast isn't selected for that track this week).

Weekly leftover cap: across the WHOLE plan (adult + kids + family tracks combined, not tracked separately), no more than ${MAX_LEFTOVER_SLOTS} meal-slots total may be "leftovers from an earlier batch-cook" (i.e. the total count of entries across every meal's batchCook.leftoverFor arrays must not exceed ${MAX_LEFTOVER_SLOTS}). Batch-cooking itself is still encouraged and unlimited - the limit is specifically on same-week reheated-leftover slots. If a recipe makes extra portions that are being frozen for a future week rather than eaten as a same-week leftover, use batchCook.freezerPortions for that (does not count toward this cap) instead of adding it to leftoverFor.

For every meal, provide:
- A clean ingredient list with realistic quantities *for the number of portions specified for that meal*, a unit, and which supermarket aisle it's found in. Size quantities to cover the full "makes" total when batch-cooking, including any freezerPortions. **Every meal's ingredients list must have at least one entry - never emit an empty list, even for the simplest meal.** E.g. "toast" still lists bread (and butter/spread if used) as ingredients; a bowl of cereal still lists the cereal and milk. There is no meal simple enough to skip this - a meal with an empty ingredients list is invalid and will cause the whole week's plan to be rejected.
- Each ingredient also needs two honest, evidence-based flags, set on every ingredient in every meal regardless of whether this week asked for a cholesterol-lowering focus (see below), not just when it did:
  - cholesterolLowering: true only for ingredients with recognised LDL-cholesterol-lowering properties (oats, oily fish like salmon/mackerel/sardines, nuts, seeds, legumes/beans/lentils, olive oil, soluble-fibre fruit/veg like apples/citrus/aubergine, soy).
  - lowSaturatedFat: true only for ingredients that are low in saturated fat - naturally (skinless chicken breast, egg whites, most fruit/veg, oily fish), a low-fat/reduced-fat/fat-free version of a normally higher-fat product (low-fat or fat-free yoghurt, skimmed/semi-skimmed milk, reduced-fat cheese), a lean cut with visible fat trimmed, or an unsaturated-fat swap for a higher-saturated-fat ingredient (olive oil instead of butter).
- A numbered method that's genuinely instructive, not terse - each step should be usable on its own, without needing the recipe title for context, by someone who isn't already a confident cook. Concretely, that means: state an actual temperature (oven °C, pan heat like "medium-high") or time where the dish needs one; give a visual or sensory doneness cue instead of (or alongside) a bare instruction - "fry for 4-5 minutes until golden and crisp", "simmer until the sauce coats the back of a spoon", "until the yolk is just set" - not just "fry the chicken" or "cook until done"; call out pan/oven specifics (which shelf, lid on/off, a specific pan size) and any brief technique note a less confident cook would actually need (e.g. "pat the chicken dry first so it browns instead of steaming"). One instruction per step is still the right size - this is about making each step concretely useful, not padding step count.
- A per-portion estimate for kcal, protein (g), carbs (g), fat (g), fibre (g) - for adult meals this is a per-adult-portion estimate under this week's selected goal framing (see the user message); family-occasion meals always use the "Balanced" framing's per-adult-portion estimate regardless of the week's selected goal (kids share these meals too); for kids meals it's a per-kid-portion estimate under balanced age-appropriate nutrition instead. Precision to the gram isn't the goal, a sensible estimate is.
- A short food-photo search query capturing the dish visually.
- usesFreezerItem: the exact name of a freezer inventory item (given in the user message, if any exist) if this meal reheats that previously-frozen batch instead of being cooked fresh - null otherwise. Prefer using an available freezer item for a suitable slot (especially quick weekday meals or kids meals) over cooking/buying the same thing fresh, since it's already paid for and made. A meal that uses a freezer item must have batchCook: null (reheating isn't making a new batch).

A full week is a lot of meals to specify in one response (adult + kids + family tracks together roughly doubles what a single-track week used to be) - favour concise, economical wording throughout (no restated context, no flowery description, no padding for its own sake) so the whole week fits comfortably. Do not sacrifice completeness or the method steps' instructiveness above for brevity - every field for every meal must still be filled in properly, and every method step still needs its temperature/time/doneness-cue detail - just don't waste words getting there.

Respond only by calling the emit_week_plan tool with the complete plan - do not include any other commentary.`;
}

export function buildUserPrompt(params: {
  weekStartDate: string;
  intake: WeekIntake;
  recentTitles: string[];
  recentFeedback: { rating: string; note: string | null; title: string }[];
  freezerInventory: { itemName: string; portions: number }[];
}): string {
  const { weekStartDate, intake, recentTitles, recentFeedback, freezerInventory } = params;

  const feedbackLines = recentFeedback.length
    ? recentFeedback
        .map((f) => `- "${f.title}": ${f.rating}${f.note ? ` (${f.note})` : ""}`)
        .join("\n")
    : "- No feedback logged yet.";

  const excludedProteins = PROTEIN_TYPES.filter((p) => !intake.proteins.includes(p));

  return `Plan the week starting ${weekStartDate}.

Days needed: ${DAYS_MODE_LABEL[intake.daysMode]}.
Family occasions this week: Saturday breakfast - ${OCCASION_MODE_LABEL[intake.familyMeals.satBreakfast] ?? intake.familyMeals.satBreakfast}; Saturday evening - ${OCCASION_MODE_LABEL[intake.familyMeals.satEvening] ?? intake.familyMeals.satEvening}; Sunday lunch - ${OCCASION_MODE_LABEL[intake.familyMeals.sunLunch] ?? intake.familyMeals.sunLunch}. (Only apply an occasion if that day is actually within the days needed above - e.g. if only weekdays are needed, no family occasions apply this week regardless of these settings.)
Meal-times needed this week - parents (track "adult"): ${mealTimesLabel(intake.parentMeals)}. Kids (track "kids"): ${mealTimesLabel(intake.kidsMeals)}.
Preferred dish styles this week: ${intake.dishStyles.length ? intake.dishStyles.join(", ") : "no preference"}.
Proteins to use this week: ${intake.proteins.length ? intake.proteins.join(", ") : "none specified, use reasonable judgement"}.${excludedProteins.length ? ` Do NOT use these at all this week: ${excludedProteins.join(", ")}.` : ""}
Effort level: ${EFFORT_LABEL[intake.effort]}.
Budget for the week: ${intake.budget || "not specified, use reasonable judgement"}.
This week's nutrition goal: ${GOAL_LABEL[intake.goal]}. ${GOAL_FRAMING[intake.goal]} Applies to adult meals only, without abandoning the dish styles/proteins/effort requested above - NOT to the kids track (always its own balanced framing) and NOT to family-occasion meals (always "Balanced" regardless of this goal - see the household context and track rules).
${intake.notes ? `IMPORTANT - this week's specific circumstances (these override the standing household defaults above where they conflict, per the note on that in the household context): ${intake.notes}` : ""}

Recently served (avoid repeating these adult/family meals unless asked to keep one - this does not apply to the kids track, which can repeat freely):
${recentTitles.length ? recentTitles.map((t) => `- ${t}`).join("\n") : "- No recent history yet."}

Explicitly asked to avoid repeating: ${intake.avoidRepeating.length ? intake.avoidRepeating.join(", ") : "none specified beyond the recent list above"}.

Feedback from recent weeks (steer toward loved meals periodically, away from disliked ones, respect effort feedback):
${feedbackLines}

Freezer inventory available (already batch-frozen from a previous week - see the household context above and the usesFreezerItem field instructions; prefer using one of these for a suitable slot over cooking/buying the same thing fresh):
${freezerInventory.length ? freezerInventory.map((f) => `- ${f.itemName} (${f.portions} portion(s) left)`).join("\n") : "- Freezer is empty."}

Call emit_week_plan with the full week's plan now.`;
}

const SLOT_LABEL: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", sunday_special: "Sunday" };
const TRACK_LABEL: Record<string, string> = { adult: "the adult plan", kids: "the kids plan", family: "a shared family occasion" };

/** "Swap this meal" backlog feature (see DECISIONS.md) - a single-meal
 * regeneration, not a full-week one. Reuses the household's standing system
 * prompt (`buildSystemPrompt`) and that week's own stored intake for
 * context/preferences, but asks for exactly one replacement meal via a
 * separate `emit_meal` tool call. */
export function buildSwapMealUserPrompt(params: {
  intake: WeekIntake;
  currentMeal: { slot: string; track: string; title: string; servingsAdults: number; servingsKids: number };
  otherTitlesThisWeek: string[];
  recentTitles: string[];
}): string {
  const { intake, currentMeal, otherTitlesThisWeek, recentTitles } = params;
  const excludedProteins = PROTEIN_TYPES.filter((p) => !intake.proteins.includes(p));

  return `The household wants a single meal replaced in an already-generated week - do NOT regenerate anything else.

Replace: ${SLOT_LABEL[currentMeal.slot] ?? currentMeal.slot} for ${TRACK_LABEL[currentMeal.track] ?? currentMeal.track}, currently "${currentMeal.title}". The replacement must serve exactly ${currentMeal.servingsAdults} adult(s) and ${currentMeal.servingsKids} kid(s) - do not change the serving counts.

The replacement must be a genuinely different dish, not a minor variation of "${currentMeal.title}" (different main ingredient or cooking method, not just a renamed version of the same dish).

Do not duplicate any other meal already in this week's plan:
${otherTitlesThisWeek.length ? otherTitlesThisWeek.map((t) => `- ${t}`).join("\n") : "- (no other meals this week)"}

Also avoid repeating from recent weeks: ${recentTitles.length ? recentTitles.join(", ") : "no recent history"}.

This week's other preferences still apply to the replacement (unless the meal being replaced is a family-occasion meal, which always uses "Balanced" - see below): dish styles - ${intake.dishStyles.length ? intake.dishStyles.join(", ") : "no preference"}; proteins - ${intake.proteins.length ? intake.proteins.join(", ") : "no preference"}${excludedProteins.length ? ` (do NOT use: ${excludedProteins.join(", ")})` : ""}; effort level - ${EFFORT_LABEL[intake.effort]}; nutrition goal - ${currentMeal.track === "family" ? `Balanced (${GOAL_FRAMING.balanced})` : `${GOAL_LABEL[intake.goal]} (${GOAL_FRAMING[intake.goal]})`}

Set batchCook to null and usesFreezerItem to null on the replacement - a single-meal swap must never introduce a new batch-cook/leftover relationship or consume freezer inventory, since the rest of the week's plan was already generated around the meal being replaced.

Call emit_meal with the one replacement meal now.`;
}
