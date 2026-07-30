import { describe, expect, it } from "vitest";
import { deemphasisedStyles, isWarmMonth } from "@/lib/season";

describe("isWarmMonth", () => {
  it("treats May through September as warm", () => {
    for (const month of [4, 5, 6, 7, 8]) {
      expect(isWarmMonth(new Date(2026, month, 15))).toBe(true);
    }
  });

  it("treats the rest of the year as cool", () => {
    for (const month of [0, 1, 2, 3, 9, 10, 11]) {
      expect(isWarmMonth(new Date(2026, month, 15))).toBe(false);
    }
  });
});

describe("deemphasisedStyles", () => {
  it("de-emphasises soups in warm months without removing anything else", () => {
    expect(deemphasisedStyles(new Date(2026, 6, 15))).toEqual(["soups"]);
  });

  it("de-emphasises nothing in cool months", () => {
    expect(deemphasisedStyles(new Date(2026, 11, 15))).toEqual([]);
  });
});
