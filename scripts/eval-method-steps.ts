/**
 * MVP 1.1 method-step eval/spot-check (see REQUIREMENTS.md and DECISIONS.md's
 * "Method steps" entry). Generates at least 5 real recipes through the
 * actual generation pipeline (not hand-written examples) and scores each
 * meal's method steps against a short rubric:
 *
 *   1. Temperature/time stated where the dish needs one.
 *   2. At least one visual/sensory doneness cue somewhere in the method.
 *   3. No step assumes an unstated technique a home cook wouldn't know.
 *
 * Criteria 1-2 are pattern-matched automatically. Criterion 3 is a judgement
 * call no regex can make safely, so this script prints the full method text
 * for a human to read and mark - the printed table has a REVIEW column for
 * exactly that.
 *
 * Requires a real ANTHROPIC_API_KEY - this sandbox doesn't have one (see
 * DECISIONS.md), so this script has only been exercised with
 * MOCK_GENERATION=1 to prove it runs/parses/scores correctly, which is NOT
 * the required real eval (the mock's method steps are placeholder text and
 * are expected to fail the rubric). Run for real with:
 *
 *   ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/eval-method-steps.ts
 *
 * ...then paste the printed table into EVALS.md under "Results", replacing
 * the REVIEW placeholders with your own y/n read of criterion 3.
 */
import { generateWeekPlan } from "../src/lib/claude/generate";
import type { households } from "../src/lib/db/schema";
import { PROTEIN_TYPES } from "../src/lib/intake";

type Household = typeof households.$inferSelect;

const TIME_OR_TEMP = /(\d+\s?°\s?[cf])|(\d+\s?-\s?\d+\s?min)|(\d+\s?min)|(\d+\s?hour)|(gas mark\s?\d)/i;

const SENSORY_CUES = [
  "golden",
  "until set",
  "just set",
  "tender",
  "crisp",
  "crispy",
  "bubbling",
  "translucent",
  "browned",
  "softened",
  "reduced",
  "thickened",
  "cooked through",
  "firm to the touch",
  "springs back",
  "caramelised",
  "caramelized",
  "glossy",
  "fragrant",
  "sizzling",
];

function hasSensoryCue(text: string): boolean {
  const lower = text.toLowerCase();
  return SENSORY_CUES.some((cue) => lower.includes(cue));
}

const fakeHousehold: Household = {
  id: "eval",
  name: "Eval household",
  adults: 2,
  kidsCount: 2,
  satBreakfastDefaultMode: "sit_down",
  satEveningDefaultMode: "sit_down",
  sunLunchDefaultMode: "sit_down",
  familyAdults: 2,
  familyKids: 2,
  favoriteProteins: [...PROTEIN_TYPES],
  store: "Sainsbury's",
  budgetDefault: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

async function main() {
  const plan = await generateWeekPlan({
    household: fakeHousehold,
    weekStartDate: "2026-08-10",
    intake: {
      daysMode: "full_week",
      familyMeals: { satBreakfast: "sit_down", satEvening: "sit_down", sunLunch: "sit_down" },
      parentMeals: { breakfast: false, lunch: true, dinner: true },
      kidsMeals: { breakfast: true, lunch: true, dinner: true },
      dishStyles: [],
      proteins: ["Chicken", "Beef", "Pork", "Fish & seafood", "Turkey", "Eggs", "Plant-based"],
      avoidRepeating: [],
      budget: "",
      effort: "mixed",
      notes: "",
      lowerCholesterol: false,
    },
    recentTitles: [],
    recentFeedback: [],
  });

  const meals = plan.days.flatMap((day) => day.meals.map((meal) => ({ day: day.day, ...meal })));

  if (meals.length < 5) {
    console.warn(`Only ${meals.length} meals came back - the rubric asks for at least 5. Re-run if this recurs.`);
  }

  console.log(`\n# Method-step eval - ${meals.length} recipes\n`);
  console.log("| Recipe | Steps | Time/temp stated | Sensory cue present | No unstated technique (REVIEW) |");
  console.log("|---|---|---|---|---|");

  for (const meal of meals) {
    const stepsWithTimeOrTemp = meal.method.filter((s) => TIME_OR_TEMP.test(s)).length;
    const anySensoryCue = meal.method.some(hasSensoryCue);
    console.log(
      `| ${meal.day} - ${meal.title} | ${meal.method.length} | ${stepsWithTimeOrTemp}/${meal.method.length} steps | ${anySensoryCue ? "yes" : "NO"} | REVIEW |`,
    );
  }

  console.log("\n## Full method text (for the REVIEW column)\n");
  for (const meal of meals) {
    console.log(`### ${meal.day} - ${meal.title}`);
    meal.method.forEach((step, i) => console.log(`${i + 1}. ${step}`));
    console.log("");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
