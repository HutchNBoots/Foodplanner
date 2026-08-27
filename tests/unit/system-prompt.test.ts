import { describe, expect, it } from "vitest";
import { buildUserPrompt } from "@/lib/claude/systemPrompt";
import { PROTEIN_TYPES } from "@/lib/intake";
import type { WeekIntake } from "@/lib/db/schema";

function baseIntake(overrides: Partial<WeekIntake> = {}): WeekIntake {
  return {
    numDays: 7,
    deliveryTime: "",
    familyMeals: { satBreakfast: "sit_down", satEvening: "sit_down", sunLunch: "sit_down" },
    parentMeals: { breakfast: false, lunch: true, dinner: true },
    kidsMeals: { breakfast: true, lunch: true, dinner: true },
    dishStyles: [],
    proteins: [...PROTEIN_TYPES],
    avoidRepeating: [],
    budget: "",
    effort: "mixed",
    notes: "",
    energyDirection: "lose_weight",
    focuses: [],
    ...overrides,
  };
}

describe("buildUserPrompt protein handling", () => {
  it("does not tell Claude to avoid anything when all proteins are selected", () => {
    const prompt = buildUserPrompt({
      weekStartDate: "2026-08-03",
      intake: baseIntake(),
      recentTitles: [],
      recentFeedback: [],
      freezerInventory: [],
    });

    expect(prompt).not.toContain("Do NOT use");
    expect(prompt).toContain("Proteins to use this week: Chicken, Beef,");
  });

  it("explicitly excludes deselected proteins", () => {
    const prompt = buildUserPrompt({
      weekStartDate: "2026-08-03",
      intake: baseIntake({ proteins: PROTEIN_TYPES.filter((p) => p !== "Beef") }),
      recentTitles: [],
      recentFeedback: [],
      freezerInventory: [],
    });

    expect(prompt).toContain("Do NOT use these at all this week: Beef.");
    expect(prompt.split("Proteins to use this week:")[1]).not.toContain("Beef,");
  });

  it("falls back to 'use reasonable judgement' if the list is somehow empty", () => {
    const prompt = buildUserPrompt({
      weekStartDate: "2026-08-03",
      intake: baseIntake({ proteins: [] }),
      recentTitles: [],
      recentFeedback: [],
      freezerInventory: [],
    });

    expect(prompt).toContain("Proteins to use this week: none specified, use reasonable judgement.");
  });
});

// Backlog item: Goals selector (see REQUIREMENTS.md, DECISIONS.md's "Goals
// selector: two-axis redesign" entry) - a single-select calorie direction
// plus zero-or-more stackable nutrition focuses, replacing the original
// single 4-way goal enum (which itself replaced the old lowerCholesterol
// boolean).
describe("buildUserPrompt nutrition goal framing", () => {
  it("states the lose-weight direction framing by default, with no focus", () => {
    const prompt = buildUserPrompt({
      weekStartDate: "2026-08-03",
      intake: baseIntake(),
      recentTitles: [],
      recentFeedback: [],
      freezerInventory: [],
    });

    expect(prompt).toContain("This week's nutrition goal: Lose weight.");
    expect(prompt).toContain("Moderate calorie deficit");
  });

  it("states the build-muscle framing without deficit language", () => {
    const prompt = buildUserPrompt({
      weekStartDate: "2026-08-03",
      intake: baseIntake({ energyDirection: "build_muscle" }),
      recentTitles: [],
      recentFeedback: [],
      freezerInventory: [],
    });

    expect(prompt).toContain("This week's nutrition goal: Build muscle.");
    expect(prompt).toContain("NOT a deficit");
  });

  it("states the reduce-cholesterol focus framing with cholesterol-lowering ingredients called out", () => {
    const prompt = buildUserPrompt({
      weekStartDate: "2026-08-03",
      intake: baseIntake({ focuses: ["reduce_cholesterol"] }),
      recentTitles: [],
      recentFeedback: [],
      freezerInventory: [],
    });

    expect(prompt).toContain("This week's nutrition goal: Lose weight + Reduce cholesterol.");
    expect(prompt).toContain("LDL-cholesterol-lowering properties");
  });

  it("states the increase-protein focus framing regardless of direction, and can stack with reduce-cholesterol", () => {
    const promptOnDeficit = buildUserPrompt({
      weekStartDate: "2026-08-03",
      intake: baseIntake({ energyDirection: "lose_weight", focuses: ["increase_protein"] }),
      recentTitles: [],
      recentFeedback: [],
      freezerInventory: [],
    });
    const promptOnSurplus = buildUserPrompt({
      weekStartDate: "2026-08-03",
      intake: baseIntake({ energyDirection: "build_muscle", focuses: ["increase_protein"] }),
      recentTitles: [],
      recentFeedback: [],
      freezerInventory: [],
    });

    expect(promptOnDeficit).toContain("Prioritise higher-protein choices");
    expect(promptOnSurplus).toContain("Prioritise higher-protein choices");

    const stacked = buildUserPrompt({
      weekStartDate: "2026-08-03",
      intake: baseIntake({ focuses: ["increase_protein", "reduce_cholesterol"] }),
      recentTitles: [],
      recentFeedback: [],
      freezerInventory: [],
    });

    expect(stacked).toContain("This week's nutrition goal: Lose weight + Increase protein + Reduce cholesterol.");
  });

  it("scopes direction and focuses to adult meals only, not kids or family-occasion meals", () => {
    const prompt = buildUserPrompt({
      weekStartDate: "2026-08-03",
      intake: baseIntake({ focuses: ["reduce_cholesterol"] }),
      recentTitles: [],
      recentFeedback: [],
      freezerInventory: [],
    });

    expect(prompt).toContain("NOT to the kids track");
    expect(prompt).toContain('NOT to family-occasion meals (always "Balanced" with no focuses');
  });
});
