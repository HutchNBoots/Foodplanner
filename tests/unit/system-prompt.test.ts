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
    lowerCholesterol: false,
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
    });

    expect(prompt).toContain("Proteins to use this week: none specified, use reasonable judgement.");
  });
});
