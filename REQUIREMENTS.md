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

**Status: ✅ Shipped, merged into `main`.** Scoped from live-app review feedback (2026-08-03)
rather than the original `PROJECT.md` spec — first real iteration based on actual usage. See
`DECISIONS.md`'s MVP 1.1 section for the full build log; one item below (the method-step live eval)
still needs the operator to run it against a real `ANTHROPIC_API_KEY` - see `EVALS.md`.

**Branch:** `claude/build-mvp1-1-pq3e0l` (session-runner-assigned, superseding the `build/mvp1.1`
name suggested below - see `DECISIONS.md`), merged into `main` via PR.

**Why this comes before MVP 2:** the canonical ingredient list this introduces (clean name + unit,
one row per ingredient) is exactly the "clean, searchable product name/quantity" hook `PROJECT.md`
§9 already flagged as what Phase 2's Sainsbury's search-and-add step needs. Doing this properly now
makes MVP 2 more accurate later, not just a UI nicety today.

### 1. Ingredient list: consistent format, sourced from a canonical list

- ✅ Every ingredient renders as: **bold amount + unit**, then consistent spacing, then the
  ingredient name — e.g. **"4 "** → gap → "whole eggs", not a single freeform string per
  ingredient per recipe.
- ✅ Ingredient *names* should be pulled from one canonical ingredients table (a "cupboard list"),
  not emitted as arbitrary free text by each generation. Amount and unit stay per-recipe (a recipe
  needs "4" eggs, another needs "2"); the ingredient name and its default unit come from the shared
  table.
- ✅ **Decision left to Claude Code** (per operator, "let Claude Code decide"): auto-built and
  deduplicated from what generations actually produce over time (not a curated seed list) - see
  `DECISIONS.md` for the reasoning. New ingredient names fuzzy-match against the existing table
  before creating a new row, with test coverage (`tests/unit/ingredients-match.test.ts`,
  `tests/unit/ingredients-resolve.test.ts`).
- ✅ Shopping list view should benefit from this too — aisle grouping and cross-referencing get
  more reliable once ingredient names are canonical rather than free text.
- ✅ **Existing weeks generated before this change**: don't attempt to backfill/rewrite their
  stored free-text ingredients into the new canonical format — treat them as a frozen historical
  record as generated. Only weeks generated *after* this ships need to use the canonical table.
  Make sure the recipe view can still render old weeks without erroring (i.e. don't make canonical
  ingredient linkage a hard requirement of the render path).

### 2. Method steps: more instructive

- ✅ Current method steps are too terse (e.g. "Boil eggs for 8 minutes, cool and peel"). Update the
  generation prompt to ask for genuinely instructive steps: include temperatures where relevant,
  visual/sensory doneness cues ("until golden," "until the yolk is just set"), pan/oven specifics,
  and brief technique notes a less confident home cook would actually need — without padding step
  count for its own sake. Aim for steps that could stand alone without the recipe title for
  context.
- 🟡 Add a lightweight eval/spot-check before calling this done: generate at least 5 real recipes
  through the actual generation pipeline (not hand-written examples) and review each one's method
  steps against a short rubric — temperature/time stated where the dish needs it, at least one
  sensory/visual doneness cue per step where relevant, no step assumes an unstated technique a
  home cook wouldn't know. Record the rubric and the pass/fail per recipe in `DECISIONS.md` (or a
  small `EVALS.md`) so it's a real check, not a claim. **Rubric + script written
  (`scripts/eval-method-steps.ts`, `EVALS.md`), but the live 5-recipe run needs the operator's own
  `ANTHROPIC_API_KEY` (not available in the build sandbox) - see `EVALS.md`.**

### 3. Autocomplete the intake form from Settings

- ✅ Pre-fill the weekly intake form from the household settings already stored (adult count,
  Sunday headcount, budget default, store) instead of asking the user to re-enter values that
  rarely change week to week.
- ✅ Keep every field editable/overridable for that week — this is a default, not a lock. A
  one-off "guests this week" or "tighter budget this week" shouldn't require a settings change.

### 4. General CX review — suggestions to consider for this milestone

Beyond the four items above, some things worth doing in the same pass since they touch the same
screens. Split by how firm they are — the first two are real requirements for this milestone, the
rest are judgment calls Claude Code can ship, defer to backlog, or handle differently, using its
own read of effort vs. value, as long as the reasoning goes in `DECISIONS.md`.

**Must-ship for MVP 1.1:**

- ✅ **Week-level nutrition summary** — daily/weekly kcal & protein totals, not just per-meal
  figures, so the person can see at a glance whether the week is actually hitting the calorie
  deficit / protein target, not just each meal individually.
- ✅ **Shopping-list checklist behaviour** — tap to tick off items while actually shopping in-store,
  not just a static list. Small addition, high real-world value.

**Claude Code's call (ship, defer, or handle differently — document which and why):**

- ✅ **"This Week" landing page feels thin** — shipped lightly (plan summary + Recipes/Shopping
  quick links on the home card); a fuller day-by-day dashboard deferred to backlog - see
  `DECISIONS.md`.
- ✅ **Loading/generation state** — shipped lightly (elapsed-time counter); true step-by-step
  progress deferred to backlog (needs backend phase-tracking) - see `DECISIONS.md`.
- ✅ **Version label ("v2") visible on the household page** — kept as-is; decided intentional, not
  a debug leftover (the operator relies on it to confirm deploys) - see `DECISIONS.md`.

### Definition of done for MVP 1.1

- ✅ Ingredients render as bold amount/unit + consistent spacing + name, on every meal card, sourced
  from the canonical ingredients table — no raw free-text ingredient strings in the UI for weeks
  generated after this ships
- ✅ New ingredient names from a generation are fuzzy-matched against the canonical table before a
  new row is created, with test coverage proving near-duplicates (e.g. "cherry tomato" vs. "cherry
  tomatoes") collapse to one entry
- 🟡 Method steps for newly generated recipes pass the eval/spot-check rubric above, with the
  rubric + results recorded (rubric/script done, live results still need the operator's key)
- ✅ The intake form pre-fills from household settings and remains fully editable per field
- ✅ The three MVP1 bugs above (ingredient spacing, History dates, silent Failed state) are fixed,
  each with a regression test
- ✅ Both "must-ship" CX items are live; each "Claude Code's call" item has an explicit decision
  logged in `DECISIONS.md` even if the decision is "deferred to backlog"
- ✅ All of this is in a PR from `build/mvp1.1` into `main`, ready for review and merge

---

## MVP 1.2 — Kids meals, family meal cadence & leftover balance

**Status: ✅ Shipped, in PR to `main`.** Scoped from further live-use feedback, after MVP 1.1 was
kicked off. Depended on MVP 1.1's canonical ingredient list (kids meals draw from the same list,
not a separate free-text set — see below). See `DECISIONS.md`'s MVP 1.2 section for the full build
log.

**Branch:** `build/mvp1.2`, PR into `main`.

This section **updates two defaults from `PROJECT.md`** and should be treated as superseding them:

- `PROJECT.md` §3 said kids "join for a Sunday lunch or BBQ" — that's now **three** family
  occasions by default: **Saturday breakfast, Saturday evening dinner, and Sunday lunch**, all
  editable per week (not hardcoded), same as the existing Sunday-headcount setting. Saturday
  breakfast is the newest and most tentative of the three — a more relaxed, sit-down family
  breakfast, since weekday mornings don't allow for it. It should default to **on but easily
  skippable**, since it's the softest of the three occasions.
- **Every other breakfast (Mon–Fri, and any day it isn't explicitly a family occasion) stays
  simple, quick, and eaten separately** — adults and kids each get their own straightforward
  breakfast, not a shared sit-down meal. Don't let the new family-breakfast concept bleed into
  making weekday breakfasts more elaborate or "family-style" by default; the whole point is that
  time doesn't allow for that Mon–Fri.
- `PROJECT.md` §4's intake question "Sunday: sit-down lunch, BBQ, or skip" needs to become a
  broader "family meals this week" section covering all three occasions, not just Sunday.

Claude Code should update `PROJECT.md` §3/§4 to reflect this (or add a short note pointing to this
section as the current source of truth) so the two docs don't silently disagree.

### 1. Cap on leftover/batch-cook meals per week

- ✅ Across the **whole household plan combined** (adults + kids together, not tracked separately),
  no more than **2 meal-slots per week** should be "leftovers from an earlier batch-cook." Batch
  cooking itself is still encouraged (cooking once, portioning for the freezer — see kids meals
  below) — the limit is specifically on *same-week reheated leftovers* appearing on the plan, which
  was happening too often.
- ✅ This needs to be an actual constraint in the generation prompt/logic, not just a hope — and
  ideally validated after generation (if the model still schedules 3+ leftover slots, that's a
  validation failure worth retrying on, similar to the existing Zod-validation retry). Counted from
  `batchCook.leftoverFor` (`countLeftoverSlots`), enforced in `generateWeekPlan`'s existing retry
  loop - see `DECISIONS.md`.

### 2. Kids meals (new)

- ✅ Plan all three kids meals Mon–Sat (breakfast, lunch, dinner) — not just dinner. This roughly
  doubles the size of a typical week's generated output; if that pushes into `max_tokens` or cost
  territory worth worrying about (see the MVP1 🟡 cost item), Claude Code's call whether to keep it
  as one combined generation call or split adult/kids into separate calls — document the choice.
  **Decision: one combined call** (raised `max_tokens` to 28000 instead) - see `DECISIONS.md`.
- ✅ Kids meals should be **simple, often repeatable, and skew toward batch-cook-and-freeze** —
  e.g. pasta with pesto, freezer-friendly bakes/traybakes. Some repetition week to week is fine and
  expected for kids' food (this is different from the adult plan's "vary week to week" rule) —
  don't apply the adult anti-repeat logic to the kids track.
- ✅ Kids meals should **not** carry the adult plan's calorie-deficit/high-protein framing — plan
  for balanced, age-appropriate nutrition instead. The macro-per-portion display (kcal/protein/
  carbs/fat/fibre) can stay for consistency, but the generation prompt shouldn't be optimising kids'
  portions toward a deficit.
- ✅ Kids meal ingredients must be **sourced from the same canonical ingredients list** as the adult
  plan (MVP 1.1), not a separate free-text set — the shopping list stays **one consolidated list**
  for the whole household, aisle-grouped, with each ingredient's "used in" cross-reference now
  potentially spanning adult, kids, and family meals together.
- ✅ "Bulk cook and freeze" for kids meals is scoped narrowly for this milestone: a recipe can
  suggest doubling the batch and freezing the surplus, and the shopping list should reflect the
  doubled quantity where that's suggested. Actually *tracking* what's already sitting in the freezer
  from a previous week's batch (and skipping re-cooking/re-buying accordingly) is **out of scope**
  for MVP 1.2 — flag it to the backlog list below rather than building it now. Implemented as a
  `batchCook.freezerPortions` count (separate from `leftoverFor`, not counted toward the cap) - see
  `DECISIONS.md`.

### 3. Recipe view: Parents / Kids / Family tabs

- ✅ Add tabs (or an equivalent filter) to the recipe view: **Parents**, **Kids**, **Family** — so
  the three meal tracks (adult Mon–Sat, kids Mon–Sat, the Saturday-evening/Sunday-lunch family
  meals) are easy to navigate separately rather than one long mixed list.
- ✅ The shopping list stays unified across all three tabs (see above) — the tabs are a
  recipe-browsing convenience, not separate plans with separate lists.

### Definition of done for MVP 1.2

- ✅ No more than 2 leftover/batch-cook meal-slots appear across the whole week's plan (adults + kids
  combined), enforced in generation and checked after generation, with test coverage
- ✅ Kids meals are generated for all three meals, Mon–Sat, pulled from the canonical ingredient list,
  without adult-style deficit framing or the adult anti-repeat constraint
- ✅ Family meal cadence defaults to Saturday breakfast (on but skippable), Saturday evening dinner,
  and Sunday lunch, all editable per week; regular Mon–Fri (and non-family-occasion) breakfasts
  stay simple and separate for adults/kids, not sit-down family meals; `PROJECT.md` §3/§4 updated
  (or annotated) to match
- ✅ Recipe view has working Parents / Kids / Family tabs; shopping list remains one consolidated,
  aisle-grouped, cross-referenced list across all three
- ✅ Freezer-batch suggestions are reflected in shopping-list quantities where a recipe doubles a
  batch; freezer-inventory tracking is explicitly logged as deferred to backlog, not silently
  dropped
- ✅ All of this is in a PR from `build/mvp1.2` into `main`, ready for review and merge

---

## MVP 2 — Shopping list, ready to hand to Claude in Chrome

**Status: ✅ Shipped, merged into `main`.** **Scope corrected from the version of this section below (kept, struck
through, for the record) — see `DECISIONS.md`'s "MVP 2 scope correction" entry for the full
reasoning.** Depends on MVP 1.1's canonical ingredient list — a clean, canonical product name per
row is exactly what makes the list something Claude in Chrome can search against reliably.

The originally-scoped "assisted basket-fill" build below assumed the app could trigger or drive a
Claude-in-Chrome session directly. It can't: Claude in Chrome is a browser-side extension with no
API for a third-party site (like this app) to invoke, and it has no headless mode by design - a
human is always the one watching and driving it. So there's no automation for this app to build
here. The actual, much smaller, flow is entirely manual and already 90% built:

1. The user gets the shopping list from the app (MVP1's "copy as plain text" button, already
   shipped) - MVP 2's job is just making sure that exported text is as easy as possible for an
   agent to act on, not just for a human reading it on a phone screen.
2. The user opens Claude in Chrome themselves, on Sainsbury's site, in their own logged-in session,
   pastes the list, and asks it to add everything to the basket.
3. Claude in Chrome drives the page itself - asking for confirmation before anything it treats as
   consequential, and stopping before payment - the user reviews the actual basket and pays
   themselves.

### Scope for this milestone

- ⬜ Review and tighten the "copy as plain text" shopping-list export for this specific use case:
  one clean line per item (canonical product name + quantity), formatted for a linear paste-and-go
  read rather than the aisle-grouped prose that's better suited to a human scanning a phone screen
  in-store. The on-screen shopping list view keeps its aisle grouping - only the copy/export text
  changes.
- ⬜ Add a short, visible in-app note near the shopping list pointing users at the actual workflow
  above (open Claude in Chrome, paste the list, ask it to add everything to the basket) - this is
  documentation of an existing manual workflow, not a new feature.

### Explicitly not in scope (see `DECISIONS.md`)

- 🚫 Any server-side or in-app browser automation (Playwright or otherwise) driving Sainsbury's.
- 🚫 Storing Sainsbury's credentials or a logged-in session anywhere in this app.
- 🚫 Any attempt to trigger or invoke the Claude in Chrome extension programmatically from the app
  - there is no such API, and building toward one isn't a small integration away, it's not
    possible by design.
- 🚫 Unattended/automated checkout, as already flagged in the "Not planned" section below - still
  true, and more clearly so now that there's no automation layer here to accidentally extend into it.

### Definition of done for MVP 2

- The shopping-list plain-text export is one clean line per item (canonical name + quantity),
  reviewed for how easy it is to hand to an agent in one paste
- A short in-app note near the shopping list explains the Claude-in-Chrome paste-and-go workflow
- `REQUIREMENTS.md` (this section) and `DECISIONS.md` reflect the corrected scope and the
  reasoning for it
- All of this is in a PR from `build/mvp2` into `main`, ready for review and merge

<details>
<summary>Original MVP 2 scope (superseded - kept for the record, see the scope-correction entry in
DECISIONS.md)</summary>

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

</details>

---

## MVP 2.1 — Favorite proteins, optional meal-times, stronger free-text override

**Status: ✅ Shipped, in PR to `main`.** Small, operator-requested backlog grab-bag, built as one
milestone on `build/mvp2.1` from latest `main`. Four items, two of which turned out to be one
underlying feature (see `DECISIONS.md`'s "MVP 2.1" entry for the full design reasoning):

### 1. Favorite proteins (household setting)

- ✅ A new "Favorite proteins" section in Settings — a pill-picker over the same protein list the
  intake form already uses, saved as a household-level default (`households.favorite_proteins`).
- ✅ The intake form's protein picker now pre-selects from this household default instead of always
  starting with every protein selected — still fully overridable per week, same as every other
  intake field.

### 2 & 4. Optional/skippable meal-times per track (adult + kids)

Originally asked as two separate items ("make kids meals optional" and "add breakfast/lunch/dinner
as parent options and kids") but designed as one feature — both are instances of "which meal-times
does each track need this week":

- ✅ A new "Meals needed this week" section on the intake form: a Breakfast/Lunch/Dinner toggle row
  each for Parents and for Kids.
- ✅ Adults can now optionally get a breakfast (previously never modelled at all).
- ✅ The kids track can be skipped entirely for the week by toggling all three off for Kids — not
  just individual days, the whole track.
- ✅ Intake-only, not backed by new Settings columns — sensible hardcoded defaults (parents:
  lunch+dinner, no breakfast; kids: all three) matching pre-MVP2.1 behaviour exactly, same treatment
  as `daysMode`/`effort` already get. `favoriteProteins` above is different: that was explicitly
  asked for as a "favorite" (a standing preference), so it got a household column; these meal-time
  toggles were asked for as "a box on the generate form" — a per-week choice, not a standing setting.

### 3. Stronger free-text override

- ✅ The system prompt's household-context section now explicitly frames itself as standing
  *defaults*, not hard constraints — a closing rule states that the week's free-text notes win over
  any conflicting default (e.g. "camping this week, no oven" should suspend the batch-cooking
  default entirely, not just get acknowledged alongside it).

### Definition of done for MVP 2.1

- Household favorite proteins: Settings section, migration, intake form pre-fill, all wired
- Meals-needed toggles: intake form section (Parents/Kids × Breakfast/Lunch/Dinner), system prompt
  and mock generation both respect per-track/per-slot selection including the kids track being fully
  skippable
- System prompt explicitly frames free-text notes as overriding standing defaults, with a concrete
  example
- `REQUIREMENTS.md` (this section) and `DECISIONS.md` updated
- `tsc`, `eslint`, and `vitest` all green; a manual mocked-generation browser pass confirms favorite
  proteins persist and pre-fill, the toggles work per-track, and the generated plan reflects them
- All of this is in a PR from `build/mvp2.1` into `main`, ready for review and merge

---

## MVP 3 (Phase 3) — Delta ordering

**Status: ⬜ Not started.** Per `PROJECT.md` §9. Depends on MVP 2 existing first.

- ⬜ Compare this week's optimised shopping list against last week's (or a saved "usual basket")
- ⬜ Surface/add only the items that changed, so a recurring shop is a quick review of deltas
  rather than re-doing all ~40 items each time

---

## Backlog (mentioned in the spec, not scheduled as an MVP)

Per `PROJECT.md` §9, listed but explicitly deferred — pick up if/when prioritised:

- ⬜ Multi-household / multi-user support — deliberately not built, see `DECISIONS.md`'s
  "Deliberately not built" entry (a fundamental auth/data-model pivot, not a scoped feature).
- ⬜ Push notifications / reminders (e.g. "start Monday's batch cook") — deliberately not built, see
  `DECISIONS.md`'s "Deliberately not built" entry (needs an operator infrastructure decision - web
  push vs. email vs. SMS - this session couldn't make alone).
- ✅ "Swap this meal" — regenerate a single meal instead of the whole week. Shipped: `POST
  /api/meals/[mealId]/swap`, a `SwapMealButton` on `MealCard` (hidden for batch-cook meals, which
  can't be swapped), whole-week shopping-list re-aggregation after the swap. See `DECISIONS.md`'s
  "Swap this meal" entry.
- ✅ Freezer inventory tracking — knowing what's already batch-frozen from a prior week and
  factoring that into future generation (skip re-cooking/re-buying accordingly), deferred from
  MVP 1.2's narrower "suggest doubling the batch" version. Shipped: a `freezer_inventory` table
  stocked from `batchCook.freezerPortions`, listed in the generation prompt so Claude can choose to
  reheat instead of cook/buy fresh (`meal.usesFreezerItem`), a read-only Settings list with manual
  "Used it" removal, and a "From the freezer" badge on the recipe card. See `DECISIONS.md`'s
  "Freezer inventory tracking" entry - the consumption half can't be verified without a live Claude
  call, same limitation as the prompt-tuning pass below.
- ✅ Generation prompt-tuning pass — kids meals could be more instructive/varied. A
  prompt-following issue to review and tighten in the system prompt, not a data-model bug.
  Shipped: within-week variety guidance (a short example repertoire so the model doesn't default to
  the same one or two dishes) and a clarification that "simple" describes the dish, not the method
  write-up's instructiveness bar. See `DECISIONS.md`'s "Generation prompt-tuning pass" entry - prompt
  *quality* can't be verified without a live Claude call, so this is verified by content-assertion
  tests, not a live-generation eval. (The other half of this item, an adult breakfast appearing when
  it shouldn't have, is resolved as of MVP 2.1 - adult breakfast is now an intentional per-week
  toggle rather than an always-out-of-scope meal, so it appearing is no longer a bug.)
- ✅ **Household/per-week "Goals" selector** — two independent axes: nutrition **direction** (Lose
  weight / Balanced / Build muscle, single-select) and nutrition **focus** (Increase protein / Reduce
  cholesterol, multi-select, stackable on any direction). Replaces the old hardcoded "moderate
  deficit, high protein" adult default and the separate `lowerCholesterol` toggle. Went through two
  rounds: an initial nutritionist-reviewed single 4-way enum (Lose weight/Build muscle/Balanced/Reduce
  cholesterol), then an operator-flagged correction backed by web research once real evidence surfaced
  that higher protein is the mechanism behind BOTH losing weight (satiety, muscle preservation in a
  deficit) and building muscle - not a property of one option, so it shouldn't have been bundled
  inside either. See `DECISIONS.md`'s "Backlog item: household/per-week 'Goals' selector" (the
  original review), "Goals selector" (the first build), and "Goals selector: two-axis redesign" (the
  correction, with cited sources) entries. Final shape: `households.energyDirection` +
  `households.focuses` Settings defaults with fully overridable per-week `WeekIntake` equivalents
  (same pattern as `notes`/`proteins`/`budget`); no user-typed or model-stated weight/calorie/timeline
  targets ever for `lose_weight`/`build_muscle`; `increase_protein` applies regardless of calorie
  direction; kids/family-occasion meals always stay "Balanced" with no focuses regardless of
  selections. UI: a single 3-item `TabStrip` for direction, multi-select `Chip`s for focus, in both
  `IntakeForm` and `SettingsForm`, plus a disclaimer line shown under the selector.

## Explicitly not planned

- 🚫 **Fully unattended automated checkout** (no human click, stored payment credentials, running
  headless on a schedule). Flagged in `PROJECT.md` §9 as outside Sainsbury's terms of service and
  a real financial/security risk without an official partner API. Revisiting this is a conversation
  to have explicitly, not a default to build toward.
