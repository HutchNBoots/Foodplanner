import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/claude/systemPrompt";
import type { households } from "@/lib/db/schema";

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
