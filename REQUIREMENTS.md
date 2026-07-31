# Requirements — broken down by MVP

This restates the requirements already captured in `PROJECT.md` (original spec, §1–12) and
`STATUS.md` (current build state), organised by MVP milestone instead of by topic, so it's easy to
see what's shipped vs. what's still ahead. `PROJECT.md` remains the source of truth for full
detail and reasoning — this file is a status-oriented index into it.

Status key: ✅ Shipped & confirmed working · 🟡 Shipped but incomplete/open · ⬜ Not started · 🐞 Bug

---

## MVP 1 (v1) — Ask → Generate → Optimise loop

**Status: ✅ Shipped, live. Confirmed working end-to-end with a real Anthropic key — but see Bugs
below, found from a live-app review (screenshots, 2026-08-03 build) that weren't caught by the
automated test suite.**

The core personal meal-planning workflow, per `PROJECT.md` §2–4, §12.

### Requirements

- ✅ Weekly intake form: days needed (full 7 / weekdays / Mon–Sat), Sunday mode (sit-down lunch /
  BBQ / skip), dish style preference (salads/soups/tray bakes/bowls/stir-fries/no preference,
  seasonally de-emphasising soup-type dishes in warm months), avoid-repeats (pre-filled from last
  2–3 weeks' history), budget (free text), effort level, free-text notes
- ✅ Protein select/unselect (all on by default, deselect to exclude for the week) — added beyond
  original spec, operator-requested
- ✅ Server-side Claude API call, forced tool-use + Zod-validated structured output, retries once
  on validation failure
- ✅ Recipe view: day-by-day meal cards — title, photo, ingredients with quantities, numbered
  method, kcal/protein/carbs/fat/fibre per adult portion, visible batch-cook/leftover relationships
- ✅ Shopping list view: aisle-grouped, quantity-totalled, cross-referenced to meals, "copy as
  plain text" button
- ✅ Feedback: loved / too much effort / too bland / repeat-this, stored and fed back into future
  generation prompts
- ✅ Household settings page: adult count, Sunday headcount, budget default, store — editable, not
  hardcoded
- ✅ Single shared-password auth (`APP_PASSWORD` + HMAC-signed cookie) — documented as
  intentionally not multi-user
- ✅ Deployed to Vercel from `main`, Vercel Postgres (Neon-backed) with migrations run
  automatically on every build — no manual migration step
- ✅ Usable end-to-end from a phone, no local setup
- ✅ Automated tests: unit (Vitest) + e2e smoke (Playwright, generation mocked), all green pre-push

### Open items within MVP 1 (shipped but not fully closed out)

- 🟡 **Real Unsplash photos** — `UNSPLASH_ACCESS_KEY` not yet set in production, so recipes
  currently use the local illustrated-placeholder fallback rather than real stock photos. No code
  change needed, just adding the env var.
- 🟡 **Generation cost** — flagged as higher than expected per generation. Currently
  `claude-sonnet-5` at `max_tokens: 16000`. A cheaper (Haiku-tier) model is the available lever if
  cost matters more than quality — not yet decided.
- 🟡 **Vercel auto-deploy toggle** — operator wants every push to `main` to stop
  auto-deploying, in favour of manual deploy control. Vercel dashboard setting only, not
  code-driven.

### 🐞 Bugs found (live-app review, screenshots, 2026-08-03 build)

Not caught by the current test suite — worth adding regression coverage for each as it's fixed.

- 🐞 **Ingredient text has no space between amount/unit and ingredient name** — renders as
  "4whole eggs", "1tbsp olive oil" instead of "4 whole eggs", "1 tbsp olive oil". This is a
  template/formatting bug, distinct from the bigger ingredient-consistency rework in MVP 1.1 below
  — fix this regardless of when the rework lands.
- 🐞 **History page shows the same date ("Week of 2026-08-03") for every entry**, six rows deep,
  mixing Failed/Ready statuses. Either the week's date isn't being persisted/read correctly, or the
  history list is rendering a hardcoded/wrong field. This needs fixing before it's trustworthy —
  the intake form's "avoid repeating recent meals" pre-fill reads from this same history, so a
  broken date likely means broken "recent" filtering too.
- 🐞 **A failed generation shows only a red "Failed" label, no reason and no retry action.**
  Whatever caused it (rate limit, a second validation failure after the one retry, malformed JSON,
  network error) should surface to the user, and there should be an obvious way to retry without
  starting the whole intake form over.

---

## MVP 1.1 — Consistency, instructive recipes & CX polish

**Status: ⬜ Not started.** Scoped from live-app review feedback (2026-08-03) rather than the
original `PROJECT.md` spec — first real iteration based on actual usage.

**Branch:** `build/mvp1.1`, PR into `main` when done — same review checkpoint as `PROJECT.md`'s
`build/v1` convention.

**Why this comes before MVP 2:** the canonical ingredient list this introduces (clean name + unit,
one row per ingredient) is exactly the "clean, searchable product name/quantity" hook `PROJECT.md`
§9 already flagged as what Phase 2's Sainsbury's search-and-add step needs. Doing this properly now
makes MVP 2 more accurate later, not just a UI nicety today.

### 1. Ingredient list: consistent format, sourced from a canonical list

- ⬜ Every ingredient renders as: **bold amount + unit**, then consistent spacing, then the
  ingredient name — e.g. **"4 "** → gap → "whole eggs", not a single freeform string per
  ingredient per recipe.
- ⬜ Ingredient *names* should be pulled from one canonical ingredients table (a "cupboard list"),
  not emitted as arbitrary free text by each generation. Amount and unit stay per-recipe (a recipe
  needs "4" eggs, another needs "2"); the ingredient name and its default unit come from the shared
  table.
- ⬜ **Decision left to Claude Code** (per operator, "let Claude Code decide"): whether this table
  is auto-built and deduplicated from what generations actually produce over time, or seeded
  upfront with a curated common-ingredients list that then grows — pick whichever is the more
  robust approach given the JSON-schema/validation setup already in place, and document the
  reasoning in `DECISIONS.md`. Either way: new ingredient names from a generation should fuzzy-match
  against the existing table before creating a new row (to stop "cherry tomatoes" and "cherry
  tomato" becoming two separate entries), and the matching/dedup logic should have test coverage.
- ⬜ Shopping list view should benefit from this too — aisle grouping and cross-referencing get
  more reliable once ingredient names are canonical rather than free text.
- ⬜ **Existing weeks generated before this change**: don't attempt to backfill/rewrite their
  stored free-text ingredients into the new canonical format — treat them as a frozen historical
  record as generated. Only weeks generated *after* this ships need to use the canonical table.
  Make sure the recipe view can still render old weeks without erroring (i.e. don't make canonical
  ingredient linkage a hard requirement of the render path).

### 2. Method steps: more instructive

- ⬜ Current method steps are too terse (e.g. "Boil eggs for 8 minutes, cool and peel"). Update the
  generation prompt to ask for genuinely instructive steps: include temperatures where relevant,
  visual/sensory doneness cues ("until golden," "until the yolk is just set"), pan/oven specifics,
  and brief technique notes a less confident home cook would actually need — without padding step
  count for its own sake. Aim for steps that could stand alone without the recipe title for
  context.
- ⬜ Add a lightweight eval/spot-check before calling this done: generate at least 5 real recipes
  through the actual generation pipeline (not hand-written examples) and review each one's method
  steps against a short rubric — temperature/time stated where the dish needs it, at least one
  sensory/visual doneness cue per step where relevant, no step assumes an unstated technique a
  home cook wouldn't know. Record the rubric and the pass/fail per recipe in `DECISIONS.md` (or a
  small `EVALS.md`) so it's a real check, not a claim.

### 3. Autocomplete the intake form from Settings

- ⬜ Pre-fill the weekly intake form from the household settings already stored (adult count,
  Sunday headcount, budget default, store) instead of asking the user to re-enter values that
  rarely change week to week.
- ⬜ Keep every field editable/overridable for that week — this is a default, not a lock. A
  one-off "guests this week" or "tighter budget this week" shouldn't require a settings change.

### 4. General CX review — suggestions to consider for this milestone

Beyond the four items above, some things worth doing in the same pass since they touch the same
screens. Split by how firm they are — the first two are real requirements for this milestone, the
rest are judgment calls Claude Code can ship, defer to backlog, or handle differently, using its
own read of effort vs. value, as long as the reasoning goes in `DECISIONS.md`.

**Must-ship for MVP 1.1:**

- ⬜ **Week-level nutrition summary** — daily/weekly kcal & protein totals, not just per-meal
  figures, so the person can see at a glance whether the week is actually hitting the calorie
  deficit / protein target, not just each meal individually.
- ⬜ **Shopping-list checklist behaviour** — tap to tick off items while actually shopping in-store,
  not just a static list. Small addition, high real-world value.

**Claude Code's call (ship, defer, or handle differently — document which and why):**

- ⬜ **"This Week" landing page feels thin** — right now it's mostly a status card and a button
  (see screenshot). Once a week is generated, this should probably surface *into* the plan (e.g.
  "today's meals" or a quick day-by-day nav) rather than requiring a click through to find it.
- ⬜ **Loading/generation state** — given generation "takes a while" (per `PROJECT.md` §4), the
  current binary Ready/Failed doesn't say what's happening in between. A simple progress indicator
  or step description ("generating recipes… optimising shopping list…") would help, especially
  combined with the Failed-state bug fix above.
- ⬜ **Version label ("v2") visible on the household page** — decide whether that's meant to be
  user-facing (fine, just make sure it's meaningful/updated) or a debug leftover that should move
  to a footer/about page instead.

### Definition of done for MVP 1.1

- Ingredients render as bold amount/unit + consistent spacing + name, on every meal card, sourced
  from the canonical ingredients table — no raw free-text ingredient strings in the UI for weeks
  generated after this ships
- New ingredient names from a generation are fuzzy-matched against the canonical table before a
  new row is created, with test coverage proving near-duplicates (e.g. "cherry tomato" vs. "cherry
  tomatoes") collapse to one entry
- Method steps for newly generated recipes pass the eval/spot-check rubric above, with the
  rubric + results recorded
- The intake form pre-fills from household settings and remains fully editable per field
- The three MVP1 bugs above (ingredient spacing, History dates, silent Failed state) are fixed,
  each with a regression test
- Both "must-ship" CX items are live; each "Claude Code's call" item has an explicit decision
  logged in `DECISIONS.md` even if the decision is "deferred to backlog"
- All of this is in a PR from `build/mvp1.1` into `main`, ready for review and merge

---

## MVP 2 (Phase 2) — Assisted basket-fill

**Status: ⬜ Not started.** Per `PROJECT.md` §9. Depends on MVP 1.1's canonical ingredient list —
matching against Sainsbury's search will be materially more reliable with clean names than with
free text, so sequencing MVP 1.1 first is deliberate, not incidental.

A human-in-the-loop flow (browser assistant or a Playwright script the user runs themselves) that:

- ⬜ Takes the shopping list (canonical `product_name`/`quantity` per row, per MVP 1.1) and searches
  Sainsbury's for each item
- ⬜ Adds matched items to the Sainsbury's basket
- ⬜ Stops before payment — a human reviews substitutions (out-of-stock items, pack sizes) and
  completes checkout manually
- Explicitly **not** in scope: unattended checkout, stored payment credentials, or anything that
  removes the human click before payment (see "Not planned" below)

---

## MVP 3 (Phase 3) — Delta ordering

**Status: ⬜ Not started.** Per `PROJECT.md` §9. Depends on MVP 2 existing first.

- ⬜ Compare this week's optimised shopping list against last week's (or a saved "usual basket")
- ⬜ Surface/add only the items that changed, so a recurring shop is a quick review of deltas
  rather than re-doing all ~40 items each time

---

## Backlog (mentioned in the spec, not scheduled as an MVP)

Per `PROJECT.md` §9, listed but explicitly deferred — pick up if/when prioritised:

- ⬜ Multi-household / multi-user support
- ⬜ Push notifications / reminders (e.g. "start Monday's batch cook")
- ⬜ "Swap this meal" — regenerate a single meal instead of the whole week

## Explicitly not planned

- 🚫 **Fully unattended automated checkout** (no human click, stored payment credentials, running
  headless on a schedule). Flagged in `PROJECT.md` §9 as outside Sainsbury's terms of service and
  a real financial/security risk without an official partner API. Revisiting this is a conversation
  to have explicitly, not a default to build toward.
