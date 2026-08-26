/** Parses the `BOUGHT [N] £X.XX` / `SKIPPED [N] - reason` summary Claude
 * in Chrome is asked for at the end of `buildChromeHandoffPrompt` (see
 * DECISIONS.md's "Paste-back reconciliation: category summary + spend"
 * entry). Matched by the `[N]` reference number rather than fuzzy product-
 * name text, so a paraphrase or slight rename in Claude's reply can't
 * silently fail to match an item - same reasoning that led to numbering
 * the export in the first place.
 *
 * Deliberately tolerant of stray text: only lines that actually start with
 * BOUGHT/SKIPPED (surrounding whitespace aside) are parsed; anything else
 * Claude adds around the summary (preamble, sign-off) is just ignored
 * rather than causing the whole paste to fail. */

export type SummaryLine =
  | { status: "bought"; index: number; price: number | null }
  | { status: "skipped"; index: number; reason: string | null };

const BOUGHT_PATTERN = /^BOUGHT\s*\[(\d+)\]\s*(?:£\s*([\d.]+))?/i;
const SKIPPED_PATTERN = /^SKIPPED\s*\[(\d+)\]\s*(?:-\s*(.*))?/i;

export function parseChromeHandoffSummary(text: string): SummaryLine[] {
  const results: SummaryLine[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const bought = line.match(BOUGHT_PATTERN);
    if (bought) {
      const index = Number(bought[1]);
      const price = bought[2] ? Number(bought[2]) : null;
      results.push({ status: "bought", index, price: Number.isFinite(price) ? price : null });
      continue;
    }

    const skipped = line.match(SKIPPED_PATTERN);
    if (skipped) {
      const index = Number(skipped[1]);
      const reason = skipped[2]?.trim() || null;
      results.push({ status: "skipped", index, reason });
    }
  }

  return results;
}
