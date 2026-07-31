# Method-step eval (MVP 1.1)

`REQUIREMENTS.md`'s MVP 1.1 milestone asks for a lightweight eval/spot-check before treating the
"more instructive method steps" requirement as done: generate at least 5 real recipes through the
actual generation pipeline (not hand-written examples) and score each against a rubric. This file
is that rubric plus the results - see `DECISIONS.md`'s "Method steps" entry for the reasoning
behind the prompt change and why the live run is currently blocked.

## Rubric

For each recipe's method steps:

1. **Temperature/time stated where the dish needs one** - e.g. an oven temperature, a pan heat
   level, a cook time in minutes. Pattern-matched automatically (`°C`/`°F`, "N min(s)", "N hour(s)",
   "gas mark N").
2. **At least one visual/sensory doneness cue present somewhere in the method** - "until golden",
   "until the yolk is just set", "until tender", etc., not just a bare instruction with no way to
   judge doneness. Pattern-matched against a keyword list (see `scripts/eval-method-steps.ts`).
3. **No step assumes an unstated technique a home cook wouldn't know.** This is a judgement call -
   no regex can make it safely - so it's marked `REVIEW` in the generated table and needs a human
   to actually read the method steps (printed in full below the table) and mark yes/no.

A recipe **passes** the eval if: criterion 1 is met by the steps that actually need a time/temp
(not every step needs one - "serve immediately" doesn't), criterion 2 is met at least once across
the recipe's method, and criterion 3 is a "no" (i.e. nothing unstated is assumed).

## How to run it

```
ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/eval-method-steps.ts
```

This calls the real `generateWeekPlan` pipeline (same code path `/api/generate` uses, no
`MOCK_GENERATION`), flattens every meal from the returned week into a table, and prints:

- an automated scoring table (criteria 1 and 2, plus a `REVIEW` placeholder for criterion 3)
- the full method text for every recipe, so the `REVIEW` column can actually be filled in by
  reading it

Paste the table below under "Results", with the `REVIEW` column replaced by your own y/n read of
criterion 3 for each recipe, once you've read the method text.

## Status: blocked on a live `ANTHROPIC_API_KEY` (not present in the build sandbox)

Per `DECISIONS.md`: this build environment has no `ANTHROPIC_API_KEY` (confirmed via `env`, same
gap MVP1 hit with `UNSPLASH_ACCESS_KEY` and its first live generation test - keys are provided at
deploy time per `PROJECT.md` §11, not during the build session). The script itself has been run
against `MOCK_GENERATION=1` to confirm it executes, parses the response, and scores correctly - the
mock's method steps (`"Preheat the oven.", "Roast everything together.", "Serve."`) predictably
fail the rubric, which is expected/correct (they're intentionally minimal placeholder text, not a
finding about real generations) and proves nothing about the actual prompt change.

**Operator action needed**: run the command above once against a real key, then replace the
"Results" section below with the printed table (with the `REVIEW` column filled in by hand) before
treating this specific `REQUIREMENTS.md` bullet as fully closed. Everything else in MVP 1.1 is
finished and tested independently of this.

## Results

_Not yet run against a live key - see "Status" above._
