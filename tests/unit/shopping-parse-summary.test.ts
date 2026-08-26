import { describe, expect, it } from "vitest";
import { parseChromeHandoffSummary } from "@/lib/shopping/parseSummary";

// Paste-back reconciliation parser (see DECISIONS.md's "Paste-back
// reconciliation: category summary + spend" entry) - matches by [N]
// reference number, not fuzzy product-name text.
describe("parseChromeHandoffSummary", () => {
  it("parses a bought line with a price", () => {
    const result = parseChromeHandoffSummary("BOUGHT [1] £4.50");
    expect(result).toEqual([{ status: "bought", index: 1, price: 4.5 }]);
  });

  it("parses a skipped line with a reason", () => {
    const result = parseChromeHandoffSummary("SKIPPED [3] - already had honey");
    expect(result).toEqual([{ status: "skipped", index: 3, reason: "already had honey" }]);
  });

  it("parses a skipped line with no reason", () => {
    const result = parseChromeHandoffSummary("SKIPPED [7]");
    expect(result).toEqual([{ status: "skipped", index: 7, reason: null }]);
  });

  it("parses a bought line with no price (Claude couldn't read one)", () => {
    const result = parseChromeHandoffSummary("BOUGHT [2]");
    expect(result).toEqual([{ status: "bought", index: 2, price: null }]);
  });

  it("parses multiple lines, ignoring surrounding prose/preamble", () => {
    const text = `Here's what I did:
BOUGHT [1] £4.50
BOUGHT [2] £2.00
SKIPPED [3] - only needed a teaspoon
Let me know if you'd like anything else!`;
    const result = parseChromeHandoffSummary(text);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.index)).toEqual([1, 2, 3]);
  });

  it("is case-insensitive and tolerant of surrounding whitespace", () => {
    const result = parseChromeHandoffSummary("  bought [1] £1.00  \n\tskipped [2] - reason  ");
    expect(result).toEqual([
      { status: "bought", index: 1, price: 1 },
      { status: "skipped", index: 2, reason: "reason" },
    ]);
  });

  it("returns an empty array for text with no matching lines", () => {
    expect(parseChromeHandoffSummary("I've finished shopping, all done!")).toEqual([]);
  });
});
