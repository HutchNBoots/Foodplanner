import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/claude/systemPrompt";
import type { households } from "@/lib/db/schema";
import { PROTEIN_TYPES } from "@/lib/intake";

function baseHousehold(): typeof households.$inferSelect {
  return {
    id: "h1",
    name: "Test household",
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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

// MVP 1.1 requirement: method steps should ask for temperatures, sensory/
// visual doneness cues, and technique notes - not just terse instructions
// (see REQUIREMENTS.md and DECISIONS.md's "Method steps" entry).
describe("buildSystemPrompt method-step instructions", () => {
  it("asks for temperature/time detail", () => {
    const prompt = buildSystemPrompt(baseHousehold());
    expect(prompt.toLowerCase()).toContain("temperature");
  });

  it("asks for a visual or sensory doneness cue", () => {
    const prompt = buildSystemPrompt(baseHousehold());
    expect(prompt.toLowerCase()).toMatch(/doneness cue|sensory/);
  });

  it("asks for steps usable without the recipe title for context", () => {
    const prompt = buildSystemPrompt(baseHousehold());
    expect(prompt).toContain("without needing the recipe title for context");
  });

  it("still asks for economical wording so a full week fits", () => {
    const prompt = buildSystemPrompt(baseHousehold());
    expect(prompt.toLowerCase()).toContain("concise");
  });
});

// Regression: a real MVP 1.2 generation came back with two meals with empty
// ingredients arrays (violating the schema's ingredients.min(1)), and a
// single retry didn't fix it - see DECISIONS.md's post-MVP1.2 hotfix entry.
// The system prompt now states this as a hard rule up front rather than
// relying solely on the retry loop to catch it after the fact.
describe("buildSystemPrompt ingredients-never-empty rule", () => {
  it("states that every meal's ingredients list must have at least one entry", () => {
    const prompt = buildSystemPrompt(baseHousehold());
    expect(prompt).toContain("never emit an empty list");
  });
});
