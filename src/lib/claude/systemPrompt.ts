import type { households } from "@/lib/db/schema";
import type { WeekIntake } from "@/lib/db/schema";
import { isWarmMonth } from "@/lib/season";
import { PROTEIN_TYPES } from "@/lib/intake";

type Household = typeof households.$inferSelect;

const SUNDAY_MODE_LABEL: Record<string, string> = {
  sit_down: "a sit-down lunch",
  bbq: "a BBQ",
  skip: "no special Sunday meal - treat it like any other day",
};

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

Household context (always apply):
- ${household.adults} adults on the plan, ${household.kidsCount} kids who eat separately Monday-Saturday.
- Sunday: by default this household does ${SUNDAY_MODE_LABEL[household.sundayDefaultMode] ?? household.sundayDefaultMode} with ${household.sundayAdults} adults and ${household.sundayKids} kids, unless the week's request overrides it.
- Supermarket: ${household.store} (UK) - use ingredients realistically stocked there, including their High Protein and Small But Mighty ranges as convenient options, not as the backbone of every meal.
- Nutrition goals: moderate calorie deficit, high protein (~25-35g per adult on the main meal), high fibre, minimal ultra-processed food. Sustainable, everyday food - not a crash diet.
- Batch-cook proteins/bases and reuse across 2-3 meals in the week where sensible (e.g. a big batch of a protein on Monday, reused as a different meal or explicit leftovers later in the week). Make batch-cook and leftover relationships explicit and correct (the "leftoverFor" days/slots must be real days later in the same week).
- Vary meals week to week - avoid repeating dinners from the "recently served" list given in the user message unless the user explicitly asked to keep something.
- Season: it is currently ${isWarmMonth() ? "a warm month" : "a cooler month"} - ${isWarmMonth() ? "avoid heavy hot dishes like soups and stews; prefer salads, bowls, tray bakes, and wraps" : "hearty warming dishes like soups, stews and tray bakes are welcome"}.

For every meal, provide:
- A clean ingredient list with realistic quantities *for the number of portions specified for that meal*, a unit, and which supermarket aisle it's found in.
- A numbered method - keep each step to one brief, practical sentence, not a paragraph.
- Reasonable per-adult-portion estimates for kcal, protein (g), carbs (g), fat (g), fibre (g) - precision to the gram isn't the goal, a sensible estimate is.
- A short food-photo search query capturing the dish visually.

A full week is a lot of meals to specify in one response - favour concise, economical wording throughout (short method steps, no restated context, no flowery description) so the whole week fits comfortably. Do not sacrifice completeness for brevity - every field for every meal must still be filled in properly - just don't pad it with extra words.

Only plan "lunch" and "dinner" slots (plus "sunday_special" for the Sunday meal if applicable) - breakfast is out of scope. Weekday lunches are frequently a reused batch-cook leftover rather than a newly cooked meal - that's encouraged, not a fallback.

Respond only by calling the emit_week_plan tool with the complete plan - do not include any other commentary.`;
}

export function buildUserPrompt(params: {
  weekStartDate: string;
  intake: WeekIntake;
  recentTitles: string[];
  recentFeedback: { rating: string; note: string | null; title: string }[];
}): string {
  const { weekStartDate, intake, recentTitles, recentFeedback } = params;

  const feedbackLines = recentFeedback.length
    ? recentFeedback
        .map((f) => `- "${f.title}": ${f.rating}${f.note ? ` (${f.note})` : ""}`)
        .join("\n")
    : "- No feedback logged yet.";

  const excludedProteins = PROTEIN_TYPES.filter((p) => !intake.proteins.includes(p));

  return `Plan the week starting ${weekStartDate}.

Days needed: ${DAYS_MODE_LABEL[intake.daysMode]}.
Sunday: ${SUNDAY_MODE_LABEL[intake.sundayMode] ?? intake.sundayMode}.
Preferred dish styles this week: ${intake.dishStyles.length ? intake.dishStyles.join(", ") : "no preference"}.
Proteins to use this week: ${intake.proteins.length ? intake.proteins.join(", ") : "none specified, use reasonable judgement"}.${excludedProteins.length ? ` Do NOT use these at all this week: ${excludedProteins.join(", ")}.` : ""}
Effort level: ${EFFORT_LABEL[intake.effort]}.
Budget for the week: ${intake.budget || "not specified, use reasonable judgement"}.
${intake.notes ? `Additional notes from the user: ${intake.notes}` : ""}

Recently served (avoid repeating these dinners unless asked to keep one):
${recentTitles.length ? recentTitles.map((t) => `- ${t}`).join("\n") : "- No recent history yet."}

Explicitly asked to avoid repeating: ${intake.avoidRepeating.length ? intake.avoidRepeating.join(", ") : "none specified beyond the recent list above"}.

Feedback from recent weeks (steer toward loved meals periodically, away from disliked ones, respect effort feedback):
${feedbackLines}

Call emit_week_plan with the full week's plan now.`;
}
