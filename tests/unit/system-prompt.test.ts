import { describe, expect, it } from "vitest";
import { buildUserPrompt } from "@/lib/claude/systemPrompt";
import { PROTEIN_TYPES } from "@/lib/intake";
import type { WeekIntake } from "@/lib/db/schema";

function baseIntake(overrides: Partial<WeekIntake> = {}): WeekIntake {
  return {
    daysMode: "full_week",
    familyMeals: { satBreakfast: "sit_down", satEvening: "sit_down", sunLunch: "sit_down" },
    parentMeals: { breakfast: false, lunch: true, dinner: true },
    kidsMeals: { breakfast: true, lunch: true, dinner: true },
    dishStyles: [],
    proteins: [...PROTEIN_TYPES],
    avoidRepeating: [],
    budget: "",
    effort: "mixed",
    notes: "",
    goal: "lose_weight",
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
// selector" entry) - replaces the old lowerCholesterol boolean with a 4-way
// goal that drives the adult-track nutrition framing per week.
describe("buildUserPrompt nutrition goal framing", () => {
  it("states the lose-weight framing by default", () => {
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
      intake: baseIntake({ goal: "build_muscle" }),
      recentTitles: [],
      recentFeedback: [],
      freezerInventory: [],
    });

    expect(prompt).toContain("This week's nutrition goal: Build muscle.");
    expect(prompt).toContain("NOT a deficit");
  });

  it("states the reduce-cholesterol framing with cholesterol-lowering ingredients called out", () => {
    const prompt = buildUserPrompt({
      weekStartDate: "2026-08-03",
      intake: baseIntake({ goal: "reduce_cholesterol" }),
      recentTitles: [],
      recentFeedback: [],
      freezerInventory: [],
    });

    expect(prompt).toContain("This week's nutrition goal: Reduce cholesterol.");
    expect(prompt).toContain("LDL-cholesterol-lowering properties");
  });

  it("scopes the goal to adult meals only, not kids or family-occasion meals", () => {
    const prompt = buildUserPrompt({
      weekStartDate: "2026-08-03",
      intake: baseIntake({ goal: "reduce_cholesterol" }),
      recentTitles: [],
      recentFeedback: [],
      freezerInventory: [],
    });

    expect(prompt).toContain("NOT to the kids track");
    expect(prompt).toContain('NOT to family-occasion meals (always "Balanced"');
  });
});
