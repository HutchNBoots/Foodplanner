# Decisions Log

This file records non-trivial decisions made while building v1, and the reasoning behind them, per `PROJECT.md` §10. Newest at the bottom of each section unless noted.

## Repo structure: one file or split?

Kept `PROJECT.md` as the single vision/spec document — its numbered sections (§1–12) already read like a well-organised spec, and splitting it into `VISION.md`/`SPEC.md` stubs would just add indirection for a single-developer personal project with one reader (the person who wrote it). Instead:

- **`README.md`** — added, because it's the standard convention every dev (including future-me) looks for first: what this is, stack, local dev setup, scripts. Purely additive, doesn't duplicate the spec.
- **`DECISIONS.md`** — this file, added per §9/§10's explicit request for a running decisions log.
- **`DEPLOY.md`** — added per §10 Phase 3, the copy-paste handoff steps.

No content was removed or duplicated out of `PROJECT.md` itself.

## Branching

The task runner assigned a single working branch (`claude/project-file-setup-8e1k5n`) and the operator explicitly said "no branching throughout the project." `PROJECT.md` §10/§12 suggests a `build/v1` branch merged via PR — superseded by the operator's direct instruction. All work happens directly on the assigned branch; no PR is opened automatically (a PR is a reversible, low-cost action but still an explicit ask per the runner's own policy) — the handoff is a pushed, green branch, and opening the PR is offered as a follow-up.

## Tech stack

Followed §7's suggested stack as-is (Next.js App Router + TypeScript, Tailwind, Vercel), since the reasoning given there holds up: mobile-first UI, server routes for the Claude key, zero-config Vercel deploys. Package manager: npm (matches the preinstalled toolchain, no lockfile-format decisions to make).

### Data storage: Vercel Postgres (Neon-backed) + Drizzle ORM (supersedes both the Turso and Railway decisions)

Went Turso (libSQL) → Railway Postgres → **Vercel Postgres**, each step an explicit, direct infra call by the operator rather than something to second-guess. The final call: **Vercel only, no second platform** - once "Vercel-only" was the requirement, Vercel's own Storage tab offering (Postgres, Neon-backed under the hood) was the obvious pick over asking the operator to still manage a separate Railway/Neon/Supabase account for just the database. Drizzle's adapter is a thin swap (schema stays relational, only the dialect/driver changes), so each of these was a mechanical migration, not a redesign:

- **Schema**: `drizzle-orm/pg-core`, JSON columns as native `jsonb`, dates/enums as plain `text` - unchanged by this last swap (still true from the Railway move).
- **Production**: `@neondatabase/serverless` + `drizzle-orm/neon-http` against `DATABASE_URL`, which Vercel auto-injects the moment you add Postgres from the dashboard's Storage tab - no manual connection-string copy-paste, no public-vs-private-URL gotcha like Railway had (Vercel's Postgres is designed to be reached from Vercel's own serverless functions). The HTTP driver also resolves the earlier-flagged connection-pooling concern outright: each query is a `fetch()` call, not a held TCP connection from a stateless function, so there's no pool-sizing trade-off left to accept. One real limitation traded in: **the Neon HTTP driver doesn't support transactions** - not a problem for this app today (every write path here is sequential awaits, no `db.transaction()` calls exist), but worth knowing before adding one later; multi-statement atomicity would need `drizzle-orm/neon-serverless` (WebSocket-based, supports transactions) instead if that's ever needed.
- **Local dev/tests**: unchanged by this swap - still **PGlite** (`@electric-sql/pglite`) via `drizzle-orm/pglite`, zero network, zero external account needed to run `npm run dev` or the test suite. `src/lib/db/client.ts` picks neon-http vs PGlite based solely on whether `DATABASE_URL` is set.
- **Gotcha found and fixed while first wiring PGlite up** (still relevant, unrelated to which Postgres production talks to): PGlite's WASM asset loading breaks under Next.js/Turbopack's bundler unless `@electric-sql/pglite` is listed in `next.config.ts`'s `serverExternalPackages` - see git history for the exact error if this regresses.

### Data model: hybrid blob + normalized tables

`weeks.plan_json` stores the raw structured output Claude returned for that week (source of truth, exact regeneration-free redisplay). In parallel, the plan is normalized into a `meals` table (one row per meal instance — day, slot, title, macros, ingredients, method, image, batch/leftover links) because two things genuinely need to query across meals rather than through a JSON blob:
- **History/repeat avoidance** — "don't repeat last 2-3 weeks' dinners" needs a simple `SELECT title FROM meals WHERE week_id IN (...) AND slot = 'dinner'`, not JSON-path queries.
- **Feedback** — feedback rows reference a specific `meal_id`, and future-generation prompts need "loved/disliked meal titles" pulled by a join, not by re-parsing every stored week's JSON.

`shopping_items` is **derived deterministically on the server, not generated by Claude**. Claude returns each meal's ingredients (name, quantity, unit, aisle-tag); the server aggregates/dedupes/totals across the week's meals into `shopping_items` at generation time and persists that snapshot. Reasoning: asking an LLM to also do the arithmetic (totalling quantities across meals, deduping near-identical ingredient names) is a reliability risk for no benefit — deterministic code does it exactly right every time, and Claude is still the one deciding *what* ingredients and *how much* per meal. Snapshotting (rather than recomputing on every view) keeps "copy as text" stable and gives Phase 2 (§9) a clean, searchable `product_name`/`quantity` per row to search-and-add against later, as instructed.

### Meal slots scoped for v1

`PROJECT.md` centers on dinners (batch-cooked, reused as leftovers) and mentions one weekday lunch example ("2 saved for Wednesday's lunch"); it doesn't ask for breakfast planning, and the household goals (§3) are framed around "adult main meal" macros. v1 models **dinner** (every requested day) and **lunch** (weekdays, frequently a batch-cook leftover rather than newly generated) plus the Sunday special slot (lunch or BBQs, per intake). Breakfast is out of scope for v1 — flagging here rather than silently narrowing the spec.

### Generation: forced tool-use, not prompt-only JSON

The Claude API call uses a forced tool call (`tool_choice: {type: "tool", name: "emit_week_plan"}`) with a JSON-schema-defined input, rather than "respond only with JSON" prompt instructions. Tool-use schemas are validated by the model's own constrained decoding, which is meaningfully more reliable than hoping a prose instruction prevents markdown fences, commentary, or truncated JSON. The response is still re-validated server-side with Zod before it touches the database; on validation failure the route retries once with the validation error appended to the prompt, then surfaces a clear error to the UI rather than silently persisting a bad plan.

### Images: Unsplash primary, local illustrated placeholders as fallback

Per §5: fetch a representative Unsplash photo per recipe (search query = recipe title falling back to main ingredient), cache the chosen photo URL + required attribution (photographer name/link, per Unsplash API terms) on the `meals` row so repeat views never re-fetch. If `UNSPLASH_ACCESS_KEY` is missing, or the API errors/rate-limits, fall back to a small set of **locally-illustrated category cards** (simple SVG/CSS icon-and-gradient cards for salad/soup/tray-bake/bowl/stir-fry/protein/default) bundled in `public/`, chosen by keyword-matching the recipe title — not real stock photos (bundling licensed photo binaries into the repo is its own problem, and this build has no way to browse/license real photos offline). This is a visible, documented degrade (the UI marks illustration-mode as a badge in dev), not a silent one, per §5's explicit instruction.

### `middleware.ts` -> `proxy.ts`

Next.js 16 renamed the middleware file convention to `proxy.ts` (same request-interception mechanics, just a renamed file + exported function, `proxy` instead of `middleware`) and logs a deprecation warning on the old name. Renamed `src/middleware.ts` to `src/proxy.ts` (`export async function proxy(...)`) while doing the DB work above, to keep build output clean - confirmed the auth gate still redirects unauthenticated requests and allows authenticated ones after the rename.

### Auth: shared-password gate

Single env var `APP_PASSWORD` checked in a login route; on success, an HttpOnly cookie holding an HMAC-signed token (secret: `AUTH_SECRET` env var, falls back to `APP_PASSWORD` if unset in dev) is set so the cookie can't be trivially forged, without needing a session store. `middleware.ts` gates every route except the login route and static assets. This is intentionally not real multi-user auth per §7 — single household, single shared password, documented assumption.

### Testing

- **Vitest** for unit tests (generation-response parsing/validation, shopping-list aggregation logic) — fast, ESM/TS-native, no config friction with Next.js.
- **Playwright** for the end-to-end smoke test (intake → generate → recipe view → shopping list), since a Chromium build is already provisioned in this environment. The generation step is mocked via `MOCK_GENERATION=1` (see `src/lib/claude/mock.ts`, wired into `generateWeekPlan`) - no live Anthropic key needed to prove the flow works end-to-end, and everything downstream of generation (persistence, shopping-list aggregation, image fallback) still runs for real; a live-key path is documented in `DEPLOY.md` for the operator to smoke-test post-deploy.
- **Bug the unit tests caught**: `aggregateShoppingList` originally deduped ingredients by `name+unit`, so "0.4kg" and "400g" of the same ingredient (or a quantified vs. "to taste" instance of the same herb) silently became two separate shopping-list rows instead of one combined line - defeating the point of aisle-grouped, quantity-totalled aggregation (PROJECT.md §4). Fixed by deduping on product name alone and letting the existing unit-compatibility check decide whether to sum or list side-by-side. Left here as a concrete example of why the generation/parsing logic needed real tests rather than a visual check.
- **Bug the e2e test caught (more serious)**: the full intake → generate → view flow 404'd on the very first attempt against a `next build && next start` server - a freshly-created week couldn't be found by the immediately-following page request. Root cause: `src/lib/db/client.ts` exported `db` as a plain module-level `const`, assuming that's one singleton per process. It isn't, under Next's compiled output - route handlers and page renders each live in their own server bundle chunk, and a plain module-level singleton gets re-evaluated once per chunk that imports it. For `pg` against a real Postgres server that's harmless (multiple pools, one real DB, still consistent). For **PGlite it's fatal**: each re-evaluation constructs a *separate embedded Postgres instance* pointed at the same directory, and those instances don't share each other's writes - so `POST /api/generate`'s write landed in one instance while the following `GET /plan/[weekId]` read from another, empty one. Fixed with the standard Next.js fix for this class of bug (the same pattern used for Prisma client singletons): cache the instance on `globalThis` instead of a bare module-level `const`, guaranteeing exactly one `db` per process regardless of how many bundle chunks import the module. Confirmed fixed by the e2e test going from a reproducible 404 to a consistent pass. This only affects the PGlite dev/test path - real Postgres was never at risk - but it would have been a very confusing "works via curl, breaks in the app" bug to debug later without the smoke test catching it now.

### Migrations run automatically during Vercel's build (`vercel-build` script)

Originally `DEPLOY.md` asked the operator to run `npm run db:migrate` by hand from their own machine against the production `DATABASE_URL`, once, before/after the first real deploy. In practice this needed a local Node/terminal setup the operator didn't have - and separately, this build environment's own network egress is restricted to an allowlist that doesn't include Neon's host, so even I couldn't run it directly against their database from here.

Fixed by adding a `vercel-build` script to `package.json`: `tsx src/lib/db/migrate.ts && next build`. Vercel automatically uses a `vercel-build` script instead of `build` when one is present (zero extra config, no `vercel.json` needed) - and Vercel's own build containers have normal, unrestricted internet access, so the migration runs there instead, against the real `DATABASE_URL` env var already configured for that deployment. It's safe to run on every deploy (Drizzle's migrator tracks which migrations already applied and skips them), so this isn't just a one-time fix for this operator's setup - it's also the correct ongoing behavior: any future schema change ships and applies automatically on the next deploy, no manual step at all. Local `npm run build`/`npm run dev` are unaffected (they use the plain `build` script, which Vercel ignores in favor of `vercel-build` when both exist).

### Bug found on the operator's first real (non-mocked) generation call: `max_tokens` too low

The e2e smoke test uses `MOCK_GENERATION=1` (see the Testing section above), so the first time the *real* Claude call ever ran was the operator's live post-deploy test - and it failed with a Zod error (`"days": expected array, received undefined`), meaning the tool-call input came back missing that key entirely. Root cause: `max_tokens: 8000` in `src/lib/claude/generate.ts`, an arbitrary number picked during scaffolding, wasn't actually enough for a full 7-day plan's ingredients/method/macros for every meal - the response got cut off mid-generation before (or while) building the `days` array, and the truncated tool input just silently failed schema validation with no indication *why*.

Fixed three ways:
- Raised `max_tokens` to 16000 - comfortably above a realistic full-week payload.
- Added an explicit check for `response.stop_reason === "max_tokens"` that fails with a clear, specific message ("Claude's response was cut off before it finished...") instead of letting truncation fall through to a confusing Zod parse error - if this ever happens again (e.g. an unusually verbose response), it'll be immediately diagnosable from the error shown in the UI rather than requiring a repeat of this debugging session.
- Tightened the system prompt to explicitly ask for economical wording (short method steps, no padding) given how much has to fit in one response - reduces the odds of hitting the limit at all, independent of what the limit is set to.
- Also updated the default model from `claude-sonnet-4-5` to `claude-sonnet-5` (the current recommended default) while making this change, since `ANTHROPIC_MODEL` was never actually exercised against a real key before now either.

### Protein select/unselect added to the intake form

Operator-requested addition, not in the original spec: a "Proteins to use this week" section (Chicken, Beef, Pork, Fish & seafood, Turkey, Eggs, Plant-based), all selected by default, tap to deselect one to exclude it entirely for that week. Threaded through as `intake.proteins: string[]` (the *included* set) alongside the existing `dishStyles` pattern, with the system prompt computing the complement (`PROTEIN_TYPES` minus what's selected) and telling Claude explicitly "Do NOT use these at all this week: X" only when something's actually excluded - keeps the prompt clean when everything's selected (the common case) rather than always listing a redundant full inclusion list.

## MVP 1.1 — Consistency, instructive recipes & CX polish

Scoped from `REQUIREMENTS.md`'s MVP 1.1 section (live-app review feedback, 2026-08-03 build). Same
working style as MVP1 (§10): brainstorm before building where a decision is left open, build,
test, document, PR — no direct pings unless something actually blocks.

### Branching (again supersedes REQUIREMENTS.md's suggested name)

`REQUIREMENTS.md` says branch as `build/mvp1.1`. The session runner that actually started this work
assigned a specific branch (`claude/build-mvp1-1-pq3e0l`) instead, the same situation MVP1 hit with
`build/v1` vs. the runner-assigned `claude/project-file-setup-8e1k5n` (see the "Branching" entry
above). Same resolution: the runner's assigned branch is what's actually checked out and is what
CI/the PR will run against, so that's what's used - not a meaningful deviation from intent, just
following the literal branch that exists.

### Ingredient canonicalisation: auto-built and grown, not seeded upfront

`REQUIREMENTS.md` explicitly leaves this open ("let Claude Code decide"). Two options considered:

1. **Seed upfront with a curated common-ingredients list, then grow.** Pro: guarantees good coverage
   and sensible default aisles for the obvious staples from day one. Con: a personal single-household
   app's actual ingredient vocabulary is whatever *this* household's generations produce - a curated
   seed list is a guess at that vocabulary, will inevitably miss real generated names anyway (Claude
   isn't constrained to only ever emit seeded names), and needs the exact same fuzzy-match/create-on-miss
   logic to handle the misses. It adds a maintenance surface (a hand-written list to keep in sync)
   for a benefit that mostly evaporates once the real dedup logic exists.
2. **Auto-built and deduplicated from what generations actually produce over time.** Every new
   ingredient name is fuzzy-matched against the canonical table; a match reuses the canonical row
   (name + aisle), a miss inserts a new canonical row (first-seen name/aisle become canonical). Pro:
   the table converges on exactly the vocabulary this household's plans actually use, with zero
   upfront curation effort, and the required fuzzy-match/dedup logic (needed regardless, per the
   "cherry tomato vs cherry tomatoes" requirement) is the entire mechanism - no separate seed-data
   path to keep working. Con: the first few weeks after shipping have a smaller table, so the first
   occurrence of any ingredient always creates a new row - not a real cost, since that's true on
   week one *of the seeded approach too* for anything not in the seed list.

**Decision: auto-built and grown (option 2).** It's strictly simpler (one mechanism, not two) and
better fits a single-household app where "the canonical list" should just *be* this household's
real ingredient vocabulary, not a generic supermarket catalogue. Implementation: `ingredients_canonical`
table (id, name, aisle, created_at), resolved once per generation (batched across the whole week's
ingredients, not per-meal) in `src/lib/ingredients/resolve.ts`, using pure matching logic in
`src/lib/ingredients/match.ts` (normalisation + token-singularisation + Levenshtein-ratio fallback,
threshold-gated so real different ingredients like "chicken breast"/"chicken thigh" don't collapse).
Matched/created canonical names overwrite the per-meal `ingredients[].name` before the week is
persisted, so both the `meals` table and the derived `shopping_items` aggregation get the canonical
name - shopping-list aisle-grouping benefits automatically, per the requirement, without extra work.
`canonicalIngredientId` is stored alongside each ingredient (nullable) as the concrete "clean,
searchable product name" hook `PROJECT.md` §9 flags for Phase 2, but rendering never requires it -
old weeks (pre-dating this table) simply have `canonicalIngredientId: null` and render their frozen
free-text `name` exactly as before, per the "don't backfill old weeks" requirement.

### History page / duplicate-date bug: root cause

Investigated the reported bug ("History shows the same date for every entry, six rows deep, mixing
Failed/Ready"). The intake form's week-start date defaults to `upcomingMonday()` and is edited by
hand only if the user changes it - so repeated attempts on the same day (including retries after a
failed generation, before this milestone's real retry existed) naturally produce several `weeks` rows
sharing an identical `week_start_date`. That's not itself invalid data - two attempts *can* legitimately
target the same week - but every query that lists/orders weeks (`listWeeks`, `getRecentMealTitles`,
`getLatestWeek`, `getLatestReadyWeek`) ordered **only** by `weekStartDate`, with no tiebreaker. Rows
with an identical date then come back in whatever order the database happens to return them (not
necessarily insertion order), which is exactly "looks the same, order looks wrong" - and since
`getRecentMealTitles` feeds the intake form's "avoid repeating" pre-fill, a wrong tiebreak order there
means the "recent" list isn't reliably showing the *actually* most recent meals, matching the
suspicion raised in `REQUIREMENTS.md`.

**Fix**: added `desc(weeks.createdAt)` as a secondary sort key everywhere `weeks` is ordered by
`weekStartDate`, so ties resolve to true recency. Also surfaced `createdAt` (as a short relative/time
label) in the History list UI itself, so a human looking at several same-date rows can now tell them
apart at a glance instead of just the previous bare date. Regression test: two weeks inserted with an
identical `weekStartDate` but different `createdAt` must come back newest-`createdAt`-first.

### Retry design (bug: silent Failed state)

The per-week detail page already showed `week.errorMessage` and a "Try again" link - but that link
went to `/plan/new`, i.e. a full fresh intake form, discarding the original answers. Added
`POST /api/weeks/[weekId]/retry`: validates the week is `status: "error"`, re-runs the exact same
generation pipeline against the week's already-stored `intakeJson` (same `after()`-backgrounded
pattern as `/api/generate`), and updates the *existing* week row in place (reset to `generating`,
clear `errorMessage`) rather than creating a new one - this also means retries no longer add to the
duplicate-date pile the History fix above addresses. The error page keeps a secondary "Start a new
week instead" link for when the user actually wants to change something, and the retry button
transitions the page straight to the existing `GeneratingStatus` polling view.

### Week nutrition summary: per-day totals + week average, not a chart

`REQUIREMENTS.md` asks for "daily/weekly kcal & protein totals... at a glance". Considered a small
bar chart (one bar per day) vs. a plain numeric summary. Went with a plain numeric card (week total,
per-day average, and a compact per-day breakdown list) - the ask is "can I tell if this week is
roughly on target", which numbers answer directly, and a chart is more visual weight than five to
seven numbers need for a personal app read on a phone. Pure calculation lives in
`src/lib/nutrition/summary.ts` (day-grouped sums of the already-stored per-adult-portion macros +
a week/day average), unit-tested independently of any rendering.

### Shopping list checklist: persisted server-side, not localStorage

Ticking items off needs to survive a phone/laptop switch mid-shop (the same cross-device requirement
`PROJECT.md` §7 already resolved against plain `localStorage` for the whole data model) - so checked
state is a new `checked` boolean column on `shopping_items`, toggled via
`PATCH /api/shopping-items/[itemId]`, not client-only state.

### Method steps: prompt change only, live eval blocked on a missing key (same as MVP1's Unsplash/live-generation gaps)

Updated `buildSystemPrompt`'s method-step instructions to explicitly ask for temperatures, pan/oven
specifics, and a visual/sensory doneness cue per step where relevant, aiming for steps that stand
alone without the recipe title - directly per the requirement. Wrote `scripts/eval-method-steps.ts`,
a standalone script that calls the real `generateWeekPlan` pipeline, flattens every meal's method
steps, and scores each against the rubric (temperature/time mentioned where the dish needs it, at
least one sensory/visual cue per step where relevant, no unstated-technique assumptions - the first
two are checked with pattern-matching, the third is flagged for human read-through since it's a
judgement call no regex can make safely) - see `EVALS.md` for the rubric and the mechanics.

**This sandbox has no `ANTHROPIC_API_KEY`** (confirmed via `env`, consistent with the "Blocking items
surfaced to the operator" note below from MVP1 - same gap, same reason: keys are provided at deploy
time per `PROJECT.md` §11, not present during the build session). The script was exercised end-to-end
against `MOCK_GENERATION=1` to prove it runs, parses, and scores correctly - that is **not** the
required real eval (the mock's method steps are intentionally minimal placeholder text and will fail
the rubric, which is expected/correct behaviour for a mock, not a finding about real generations).
Per MVP1's own precedent (documented below as "not build-blocking, deploy-blocking"), this is flagged
rather than halting the whole milestone: **the operator needs to run
`ANTHROPIC_API_KEY=... npx tsx scripts/eval-method-steps.ts` once against a real key and record the
output in `EVALS.md`** before this specific DoD bullet ("method steps... pass the eval... with the
rubric + results recorded") is fully closed out. Everything else in this milestone does not depend on
this and is finished/tested independently.

### CX judgment calls (`REQUIREMENTS.md` §4, "Claude Code's call")

- **"This Week" landing page feels thin** - **shipped, lightly.** When the latest week is `ready`,
  the home card now also shows the plan's one-line `summary` (already generated and stored in
  `planJson`, previously unused on this page) and direct links into Recipes/Shopping instead of a
  single link to the recipe view. Deferred to backlog: a fuller "today's meals" day-by-day dashboard
  view - genuinely more valuable but a materially bigger scope addition (needs "what day is it
  within this plan" logic, its own layout) than fits alongside everything else in this milestone;
  noted in `REQUIREMENTS.md`'s backlog spirit rather than invented as a new requirement here.
- **Loading/generation state** - **shipped, lightly.** `GeneratingStatus` now shows an elapsed-time
  counter and a slightly more descriptive line, so a long wait reads as "still working, N seconds
  in" rather than a static spinner. Deferred: true step-by-step progress ("generating recipes...
  optimising shopping list...") - the server doesn't currently emit intermediate progress events
  during the single Claude call + image-resolution pass, and fabricating step labels on a timer
  without the backend actually being at that step would be a misleading UI, not a CX improvement.
  Doing this properly needs the generation pipeline to persist/stream real phase markers, which is
  a backend change bigger than this milestone's remaining scope - backlog candidate.
- **Version label ("v2") visible on the household/home page** - **kept as-is, decision: intentional,
  not a debug leftover.** `STATUS.md` already documents the operator relying on this exact number to
  visually confirm a deploy picked up new code ("Manually bumped by one on every deploy-bound
  change"). That's a real, currently-used purpose, not an accidental leftover - moving it to a
  buried footer/about page would remove the at-a-glance value it's actually serving. No code change;
  documenting the intent here so it doesn't get flagged as a stray debug artifact again.

### Intake form prefill: budget only, by design

`REQUIREMENTS.md` asks to prefill "adult count, Sunday headcount, budget default, store" from
settings. Of those, only **budget** and **Sunday mode** are actually intake-form fields - adult
count, Sunday headcount, and store were never asked in the intake form to begin with (`PROJECT.md`
§4's intake question list doesn't include them; they're applied automatically to every generation
via the system prompt from the household row, per `systemPrompt.ts`). Sunday mode was already
defaulted from `household.sundayDefaultMode` (see `plan/new/page.tsx`). **Budget was the actual gap**
- the form hardcoded `useState("")` instead of reading `household.budgetDefault`, so the intake form
silently ignored a setting whose entire purpose is to avoid re-typing it weekly. Fixed by threading
`household.budgetDefault` into the form as `defaultBudget`, kept fully overridable per week exactly
as the requirement asks. Not treating adults/kids/store as something to newly add as intake fields -
that would be a scope expansion into "per-week household-size override", which isn't in the
requirement's ask (it only asks to *prefill from* settings, not make settings fields *editable a
second time* per-week) and isn't something the operator flagged as missing in the live-app review.

## MVP 1.2 — Kids meals, family meal cadence & leftover balance

Scoped from `REQUIREMENTS.md`'s MVP 1.2 section, itself scoped from further live-use feedback after
MVP 1.1 shipped. `PROJECT.md` §3/§4 were already updated (directly on `main`) to state the new
three-occasion default before this build started - this section is the brainstorm/build log for
actually implementing it. Branch: `build/mvp1.2` (no runner-assigned branch was specified for this
milestone, so following `REQUIREMENTS.md`'s own suggested name directly).

### Data model: `track` (adult/kids/family) alongside `slot` (breakfast/lunch/dinner), not more special-cased slots

MVP1's `meals.slot` was `"lunch" | "dinner" | "sunday_special"` - one special-cased value for the
one family occasion that existed. MVP 1.2 needs three family occasions *plus* a whole new kids
track (breakfast/lunch/dinner, Mon-Sat) *plus* the existing adult track. Stacking more
special-cased slot values (`"sat_breakfast_special"`, `"sun_lunch_special"`, ...) would tangle
"which meal-time is this" with "whose meal is this" into one enum. Instead: **`slot` becomes purely
the meal-time** (`"breakfast" | "lunch" | "dinner"`), and a new **`track`** column
(`"adult" | "kids" | "family"`) says whose meal it is. This maps directly onto the required
Parents/Kids/Family recipe-view tabs (§3 of the requirement) with zero extra mapping logic, and
generalises cleanly if a fourth track or fifth occasion ever gets added later.

**Old rows** (pre-MVP1.2, `slot: "sunday_special"`, no `track` column): the new `track` column is
added `NOT NULL DEFAULT 'adult'` at the DB level (Postgres backfills existing rows with that
default as part of the `ALTER TABLE`, which is a mechanical schema-level default, not a
per-row semantic rewrite of historical data - different in kind from MVP1.1's explicit
"don't backfill ingredient names" rule, which was about not re-guessing historical *content*). The
one place this default is wrong is old `sunday_special` rows, which were actually family-track
meals - handled by special-casing `slot === "sunday_special"` to render/tab under **Family**
regardless of its (technically-default) `track` value, in the one small piece of render/filter code
that needs it. This is computed at render time, not a data mutation, so it satisfies both "old
weeks must still render correctly" and "don't rewrite frozen historical rows."

**One accepted gap**: a week that failed *before* this migration shipped, sitting in `status:
"error"`, has an `intakeJson` shaped like the old `sundayMode` intake, not the new `familyMeals`
shape. Retrying it (MVP 1.1's retry feature) after this deploy will hand the generator
`intake.familyMeals` as `undefined`. Given this is a personal app with essentially no long-lived
error backlog, this is accepted as a documented edge case rather than engineered around - the fix,
if it's ever hit, is "start a new week instead of retrying," not a code change.

### Family-occasion mode options: breakfast never gets "BBQ"

`REQUIREMENTS.md`/`PROJECT.md` phrase the three per-occasion options as "sit-down / BBQ (evening
only) / skip". Read literally-strict ("BBQ only valid for the evening occasion") this would remove
BBQ from Sunday lunch, which contradicts the *existing*, unchanged MVP1 behaviour (Sunday lunch has
always been able to be a BBQ - a Sunday BBQ lunch is a completely normal thing). Read as "BBQ isn't
a breakfast thing" (obviously true, and the only occasion it'd be nonsensical for), the phrasing is
just flagging the obvious rather than intending to remove an existing capability. **Decision**:
`satBreakfast` mode is `"sit_down" | "skip"` only (no BBQ); `satEvening` and `sunLunch` both keep
the full `"sit_down" | "bbq" | "skip"` set, preserving Sunday's existing behaviour and treating
Saturday evening the same way. If this reading is wrong, it's a one-line enum change to fix, not an
architectural one.

### One shared family headcount, not one per occasion

MVP1 had a single "Sunday headcount" (adults/kids) setting, separate from the base household size,
because a family occasion can have a different attendance than an ordinary weekday. Rather than
tripling that into three separate headcount settings (one per occasion), MVP 1.2 keeps **one**
shared `familyAdults`/`familyKids` setting (renamed from `sundayAdults`/`sundayKids`) applied to
whichever family occasions are actually happening that week. The three occasions are still the same
family gathering together, just on three possible occasions rather than one - attendance doesn't
usually vary occasion-to-occasion the way it might vary week-to-week (a guest coming for one
specific Sunday, say) and the intake's free-text notes field already exists for one-off exceptions
("Grandma's joining Saturday breakfast this week"). Simpler data model, same escape hatch for the
actual variability that matters.

### "Skip" semantics differ between breakfast and dinner/lunch occasions

Per the existing (unchanged) Sunday behaviour, `skip` for a family occasion means "no special
shared meal - treat the slot normally," not "nothing gets cooked": Sunday-skip already meant adults
still get a normal Sunday dinner/lunch generated. Extending that consistently:
- **Saturday evening / Sunday lunch, skip** → falls back to normal per-track meals for that
  slot (adult dinner + kids dinner separately on Saturday; adult-only on Sunday, since Sunday was
  never in the kids track - see below).
- **Saturday breakfast, skip** → no breakfast is generated for that slot at all, because unlike
  dinner/lunch, breakfast was never otherwise tracked by the app for *any* day (weekday breakfasts
  are explicitly out of scope, per this same requirement's "regular weekday breakfasts stay
  simple/separate"). There's no "normal adult breakfast" concept to fall back to.

This is encoded as **system-prompt instruction, not code-enforced structure** - see the next entry
for why.

### Day/slot/track structure is prompt-driven, not code-validated (except the leftover cap)

The existing architecture already leaves "exactly which days/slots appear" entirely to Claude,
validated only by the overall Zod schema's shape (arrays non-empty, enums valid) - dish styles,
effort level, batch/leftover placement etc. were never independently re-validated against a rigid
per-day rubric. MVP 1.2 keeps that pattern: the many day/slot/track rules above (kids Mon-Sat only,
family occasions replacing specific slots, skip-reversion semantics) are all clearly spelled out in
the system prompt, the same mechanism already relied on for every other per-week rule. The
**one** exception, because `REQUIREMENTS.md` explicitly calls for code enforcement, not just a
prompt ask, is the leftover cap (next entry). Building a full structural validator for the
day/slot/track rules would be a materially bigger, brittle addition (effectively re-deriving "what
should this exact week look like" in code) for a rule set that's fundamentally about *quality/taste*
of the generated plan, not data integrity - a prompt-engineering problem, not a validation one.

### Leftover cap: counted from `batchCook.leftoverFor`, enforced via the existing retry loop

"No more than 2 meal-slots per week should be leftovers from an earlier batch-cook" needs a
concrete, countable definition. A leftover slot already has an exact representation in the existing
schema: an entry in some meal's `batchCook.leftoverFor` array *is* a leftover meal-slot (that's
literally what the field means - "this day/slot eats this batch's leftovers instead of a fresh
meal"). So the count is simply the sum of `leftoverFor.length` across every meal in the plan,
combined across adult/kids/family tracks (per the requirement - "adults + kids together, not
tracked separately"). This slots directly into `generateWeekPlan`'s existing 2-attempt retry loop
(added for Zod-validation failures in MVP1): after a response parses successfully against the Zod
schema, it's now also checked against the leftover cap, and a cap violation is fed back to the
model as a corrective message on the retry, exactly like a schema-validation failure already is.
Kept at the existing 2-attempt limit rather than adding a third attempt purely for this - if this
proves insufficient in practice, raising the attempt count is a one-line change, not a redesign.

### Kids-meal macros: same fields, different meaning, not a schema fork

Kids meals still report `macrosPerAdultPortion` (kcal/protein/carbs/fat/fibre) for UI consistency
(per the requirement: "the macro-per-portion display can stay for consistency"), but for a
kids-track meal, that number means "per kid portion," not "per adult portion" - there's no adult
portion on a kids-only meal (`servingsAdults: 0`). Renaming the field (and the DB columns, which are
already the generic `kcal`/`proteinG`/etc., not adult-specific) would be pure churn for something
that's really just a description-text/consumer-side framing difference. Fixed by clarifying the
Zod field's `.describe()` text to state the meaning depends on the meal's `track`, and - more
importantly - by scoping `WeekNutritionSummary` (MVP 1.1) to **adult + family track meals only**,
excluding kids: mixing a deficit-framed adult-portion number with a kids' balanced-nutrition number
in the same "week nutrition" total would silently misrepresent both. Old weeks (all effectively
adult/family, no kids track existed) are unaffected since their rows default to `track: "adult"`.

### One combined generation call, not a split adult/kids call

`REQUIREMENTS.md` explicitly leaves this open. Splitting into two calls (one for adults, one for
kids+family) would roughly double the *input* token cost (system prompt + household context +
history/feedback context repeated twice) for every generation, on top of needing new orchestration
to merge two independent responses into one persisted week and reconcile shared concerns (canonical
ingredients, the leftover cap, which is explicitly meant to span both tracks combined - a split
call would need a second round-trip just to reconcile the cap across two separately-generated
halves). A single combined call keeps the existing architecture (one `weekPlanSchema` response, one
retry loop, one persistence path) and only costs more in *output* tokens, which was already the
larger cost driver and already has a known, cheap lever from MVP1: raise `max_tokens` further (this
change bumps it from 16000 to 28000) and keep leaning on "concise, economical wording" in the
prompt. Given MVP1's STATUS.md already flags generation cost as "higher than expected," paying the
system-prompt/context tokens once instead of twice is also the cheaper option, not just the simpler
one.

### Freezer-doubling: a `freezerPortions` count, not a new shopping-list mechanism

"A recipe can suggest doubling the batch and freezing the surplus, and the shopping list should
reflect the doubled quantity" - the shopping list already buys ingredients scaled to whatever
`batchCook.makes` portions the recipe's own `ingredients` list is sized for, regardless of how those
portions get used later (eaten fresh, eaten as a same-week leftover, or frozen) - so "doubling the
quantity" already happens automatically the moment the model sets a higher `makes` and scales
ingredients accordingly; no separate shopping-list-side computation was needed. What *was* missing
was a way to say "of these `makes` portions, N are being frozen for a future week" (distinct from
`leftoverFor`, which specifically means "eaten again this week") - added as a nullable
`batchCook.freezerPortions` count, purely descriptive (drives a small MealCard badge, e.g. "Makes 8
· 2 frozen for later"), explicitly **not** counted toward the leftover cap (frozen portions aren't
this week's leftovers) and **not** a freezer-inventory system (knowing what's already frozen from a
prior week and skipping re-buying/re-cooking accordingly stays out of scope, logged to the backlog
in `REQUIREMENTS.md` already).

### Migration: rename+preserve the Sunday-era columns instead of drop+recreate

`drizzle-kit generate` would default to dropping `sunday_default_mode`/`sunday_adults`/
`sunday_kids` and adding fresh replacement columns, discarding whatever the operator had already
configured in Settings. Since `sunday_default_mode` maps directly onto the new `sun_lunch_default_
mode` (Sunday lunch is exactly the occasion that field already described) and `sunday_adults`/
`sunday_kids` map directly onto the new shared `family_adults`/`family_kids`, the generated
migration was hand-edited to `ALTER TABLE ... RENAME COLUMN` for those three instead of drop+add,
preserving any real value the operator had already set. `sat_breakfast_default_mode` and
`sat_evening_default_mode` are genuinely new columns (added with a `sit_down` default, matching the
requirement's "on by default").

### Verification

Beyond `tsc`/`eslint`/`vitest`/`playwright` (all green): the hand-written migration was verified
against a seeded pre-migration household row (a fresh PGlite instance with only migrations
0000-0001 applied, a row inserted with non-default Sunday values, then migration 0002 applied on
top) - the renamed columns kept the operator's values, the two genuinely-new columns got their
`sit_down` default. Also did a manual browser pass (Playwright script, not the committed test
suite) through Settings (family-occasion pickers save and persist across reload), the intake form
(the new family-meals section, Saturday breakfast correctly missing the BBQ option), and the
recipe view (Parents/Kids/Family tabs correctly filter, the freezer-portions badge renders) -
per this project's "test UI changes in a browser, don't just claim it works" convention.

## Post-merge production hotfixes (MVP 1.2)

Two issues surfaced from the operator's live testing right after MVP 1.2 merged, both fixed
directly on `main` (not a branch/PR) given they were actively breaking the live app:

### "Streaming is required for operations that may take longer than 10 minutes"

Real (non-mocked) generation started failing with this Anthropic SDK error the moment MVP 1.2's
`max_tokens: 28000` (raised from 16000 for the combined adult+kids+family response) went live -
the SDK requires streaming once a request's own estimated duration can plausibly exceed 10 minutes,
and evidently this max_tokens value was enough to cross that threshold for a full-week
adult+kids+family plan. Not caught before merging because `MOCK_GENERATION=1` (used by the e2e test
and this build sandbox's only way to exercise generation) bypasses the real Anthropic call
entirely - the same class of gap as MVP1's `max_tokens` truncation bug, which also only ever
surfaced on the operator's first live call. Fixed by switching `client.messages.create(...)` to
`client.messages.stream(...).finalMessage()` - same params, same returned `Message` shape, so
nothing downstream of the API call needed to change; it just waits for the stream to finish instead
of making a single blocking non-streaming request.

While fixing this, also caught and fixed a related gap: `/api/weeks/[weekId]/retry` (MVP 1.1) never
had `export const maxDuration = 300` set, unlike `/api/generate` - it runs the exact same
potentially-long generation call via `after()`, so it would have been capped at Vercel's much
shorter default duration and killed mid-generation on a real retry. Never caught because the e2e
test's only retry-adjacent coverage is the mocked unit test
(`tests/unit/retry-generation.test.ts`), which resolves near-instantly either way.

## MVP 2.1 — favorite proteins, optional meal-times, stronger free-text override

Four small, operator-requested items from live use, built as one milestone (branch `build/mvp2.1`).

### 1. Favorite proteins: a household default, not a per-week-only choice

The intake's protein picker (all 7 selected by default, deselect to exclude) never had a
household-level default - every week started from "everything on," same as day one. Added
`households.favoriteProteins` (jsonb `string[]`, defaults to all `PROTEIN_TYPES` so existing
households see no behaviour change until they actually edit it in Settings), editable in Settings
with the same pill-picker UI as the intake form, and the intake form now defaults its selection
from that instead of always defaulting to "all". Still fully overridable per week - same pattern as
budget and the family occasions.

### 2 & 4. Meal-times as independent toggles, not fixed per-track rules

These two requested items are really one design question - "which meal-times does each track need
this week" - so implemented together:

- **Adults gain an optional breakfast.** Previously hard-coded as entirely out of scope
  (`buildSystemPrompt`: "Adults do NOT get a separate breakfast... every day, including Saturday").
  The underlying data model already supports it with zero schema change - `slot: "breakfast"` /
  `track: "adult"` was already a valid combination (MVP 1.2's slot rework made `breakfast` a normal
  slot value), it was simply never requested. So this is a prompt+intake change only.
- **Kids meals become genuinely optional** (the literal ask - "make children meals optional") by
  the same mechanism: toggle all three kids meal-times off and no kids track is generated that
  week, rather than adding a single separate "skip kids" switch that would duplicate the same
  on/off concept the breakfast/lunch/dinner toggles already provide.

Implementation: two new `WeekIntake` fields, `parentMeals` and `kidsMeals`, each
`{ breakfast: boolean; lunch: boolean; dinner: boolean }`. New intake form section, "Meals needed
this week," with two toggle rows. Defaults match current behaviour exactly (parents: lunch+dinner
on, breakfast off; kids: all three on) so nothing changes for a household that never touches this
section. Toggles apply to every day in the requested range **except** where a family occasion
already covers that specific day/slot (Saturday breakfast/evening, Sunday) or Sunday generally
(kids still never get a separate Sunday meal, per the standing "kids eat separately Mon-Sat" rule -
that's a separate, unrelated concept from the new per-meal-time toggles and this milestone doesn't
touch it).

**Scope call: intake-only, no new household-level defaults for these two.** Unlike family occasions
and (now) proteins, `parentMeals`/`kidsMeals` don't get a Settings-level default - just sensible
hardcoded initial state in the intake form, matching how `daysMode`/`effort` already work (some
fields are Settings-backed, some are reasonable one-off defaults; not every field needs the former).
The operator's ask was specifically "a box on the generate [form]", not a standing setting, and
adding six more household columns for toggles that'll rarely change from their sensible defaults
would be scope beyond what was actually requested.

### 3. Free-text notes as an explicit override, not just "additional context"

The notes field existed since MVP1 but was framed in the prompt as one more soft input alongside
dish styles/budget/effort, with no signal that it should ever *override* the household's standing
assumptions (batch-cooking, variety, oven-based cooking implicitly assumed throughout) when they
conflict. Concretely: "I'm camping this week, no oven" was competing on equal footing with rules
like "batch-cook proteins and reuse across meals" rather than suspending them. Fixed with two
additions, not a rewrite: `buildSystemPrompt`'s household-context intro now states these are
"standing defaults, not hard constraints" and that the week's specific request - especially
free-text notes - takes priority when they conflict, with the camping/no-oven example spelled out
directly so the instruction is concrete rather than abstract. `buildUserPrompt`'s notes line is
re-labelled from a neutral "Additional notes from the user" to an explicit "override standing
defaults where they conflict" framing when notes are present, so the priority is stated right where
the model reads the actual free text, not just once further up in the system prompt.

## Post-merge hotfix (MVP 2 era): empty ingredients array surviving a retry

A real generation call failed hard with a Zod error at two separate paths
(`days[3].meals[0].ingredients`, `days[5].meals[1].ingredients`) - both meals came back with a
completely empty `ingredients` array, violating the schema's `ingredients.min(1)`. The existing
retry loop (MVP1: try once, feed the exact Zod error back, try again) didn't produce a valid plan
even after the correction attempt - the much larger MVP 1.2 combined adult+kids+family response
(~25-30 meals per call, versus ~10-14 pre-MVP1.2) simply gives more surface area for an isolated
slip like this to occur, and Anthropic's forced tool-use decoding doesn't strongly enforce numeric
array-length constraints like `minItems` the way it enforces structural/type constraints (see the
existing "forced tool-use, not prompt-only JSON" entry above on why server-side Zod validation
exists at all) - so the schema alone was never going to reliably prevent this, only catch it.

Two changes, both small and low-risk:
- **The system prompt now states the rule explicitly, up front**: "every meal's ingredients list
  must have at least one entry - never emit an empty list, even for the simplest meal", with a
  concrete example (a "toast" or "cereal" breakfast still lists its ingredients). Preventive,
  rather than relying solely on the retry loop to catch it after the fact.
- **Retry attempts raised from 2 to 3.** One extra attempt only costs anything when validation
  actually fails (not on the happy path), and gives the model more chances to self-correct against
  a response this much larger than what the original 2-attempt budget was sized for.

Test coverage: a new assertion in `tests/unit/system-prompt-method-steps.test.ts` pins the new
prompt sentence so it can't be silently dropped in a future prompt edit. Not adding a live-generation
regression test for the empty-array failure itself, consistent with this project's established
gap here (MOCK_GENERATION bypasses the real Anthropic call entirely, so this whole class of "does
the real model actually follow this instruction" question isn't something automated tests in this
sandbox can answer - same reasoning as the method-step eval in `EVALS.md`).

## MVP 2 scope correction: no in-app automation, a text-format tweak instead

`REQUIREMENTS.md`'s original MVP 2 section (and `PROJECT.md` §9 before it) described "assisted
basket-fill" as something this app would build: a flow that searches Sainsbury's for each shopping
item and adds it to the basket, suggesting either a browser assistant or a Playwright script as the
mechanism. Operator correction: **Claude in Chrome is a browser-side extension with no API for a
third-party site to invoke, and no headless mode by design** - a human is always the one watching
and driving it. There's no "trigger a Claude in Chrome session from the app" integration to build,
not because it's out of scope by policy, but because it doesn't exist as a capability at all.

The actual flow needs no automation on this app's side: the user already gets a canonical,
quantity-totalled shopping list (MVP1's "copy as plain text" button, sharpened by MVP 1.1's
canonical ingredient table); they open Claude in Chrome themselves, in their own logged-in
Sainsbury's session, paste that list, and ask it to add everything to the basket - Claude in Chrome
handles confirmation prompts and stops before payment on its own, same as it would for anything
else consequential it's asked to do in a browser. This app's only real job is making that pasted
text as easy as possible for an agent to act on.

**Revised MVP 2 scope**: tighten the plain-text shopping-list export for this specific handoff (one
line per item, canonical name + quantity, no aisle-grouped prose - see the next entry), and add a
short in-app note pointing at the actual workflow. That's the whole milestone. The original section
is kept in `REQUIREMENTS.md`, collapsed and struck through, rather than deleted outright, so the
history of what was originally scoped and why it changed isn't lost.

**Confirms**, rather than changes, the "Explicitly not planned" section already in
`REQUIREMENTS.md`: unattended/automated checkout was already out of scope; this correction just
means there's no automation layer here at all to accidentally extend toward it later.

### Shopping-list plain-text export: flat, one line per item, no aisle headers

The on-screen shopping list view keeps its aisle grouping - genuinely useful for a human physically
walking a store. The **plain-text export** (`asPlainText` in `ShoppingList.tsx`, now
`shoppingListAsPlainText` in `src/lib/shopping/exportText.ts` for testability) drops that grouping
and the `"- "` bullet/aisle-header prose entirely: one line per item, `productName - displayQuantity`,
sorted alphabetically by name. An agent working through the list to search-and-add each item on a
retailer's site has no use for "which physical aisle is this in" - that's a human-in-a-shop concept
- and a flat list is strictly easier to parse line-by-line than nested grouping headers mixed in
with item lines. Sorting alphabetically (rather than preserving aggregation order) just keeps the
output deterministic and easy to visually scan/diff, independent of aisle categorisation.

### Bonus find while manually verifying the export: quantity/unit spacing bug, again

Manually testing the new export in a browser (`3loaf`, `2800g`, `32tbsp` in the clipboard output)
turned up the same "no space between quantity and unit" bug MVP1.1 fixed for recipe ingredient
lines (`IngredientLine`/`formatIngredientAmount`) - except this was a second, separate occurrence
of the identical bug in `aggregateShoppingList`'s own quantity-formatting (`displayQuantity` on the
shopping list, built independently with its own string concatenation rather than reusing
`formatIngredientAmount`). Since this directly affects the very text this milestone is tightening,
fixed it in the same pass: `aggregate.ts` now calls the existing `formatIngredientAmount` helper
instead of its own ad hoc `${quantity}${unit}` concatenation, for both the summed-quantity case and
the unsummable/mismatched-units fallback strings. One existing unit test asserted the old,
unspaced `"2tbsp"` output and was updated to `"2 tbsp"`.

## Blocking items surfaced to the operator (not build-blocking, deploy-blocking)

No `ANTHROPIC_API_KEY`, `UNSPLASH_ACCESS_KEY`, or production database credentials are present in this environment — expected, since §11 says these are provided at deploy time, not during the build. The app is built to run fully with local fallbacks (embedded PGlite database, illustrated placeholder images) so the whole flow is testable without any of those secrets; real keys/DB are required only for production deploy and for hitting the live Claude/Unsplash APIs. Documented precisely in `DEPLOY.md`.

## MVP 1.3 — Visual identity & mobile UX pass

Design-refresh milestone, not a features milestone: a real user flagged the live app as reading like
"a generic unstyled Tailwind/shadcn template" — one flat green accent doing every job (primary
button, active toggle, nav state), every control the same rounded-pill shape at the same weight, no
display typeface, plain number rows for nutrition. Scope is strictly visual/IA: no change to the
MVP1/1.1/1.2/2/2.1 data model, generation logic, or API routes. `/mnt/skills/public/frontend-design/
SKILL.md` was read before starting and followed for its two-pass (brainstorm → self-critique) process.

### Branching (again supersedes a suggested `build/mvp1.3` name)

Same situation as MVP 1.1/1.2/2/2.1 (see those entries above): the session runner assigned a
specific branch (`claude/visual-identity-mobile-ux-t3dfeh`) rather than the `build/mvp1.3` name
floated in the task description. Used the runner's assigned branch — it's what's actually checked
out and what the PR runs against.

### Process: three subagent passes before any code was touched

Per the task brief, three independent subagents reviewed the milestone in sequence — UX research
first (grounds the problem), creative design second (proposes direction, informed by the research),
UX/interaction third (pressure-tests that specific direction for mobile) — each one's output feeding
the next, rather than three parallel takes reconciled after the fact. Full findings below; the
"Resolutions" subsections after each state where this build followed a subagent's recommendation
directly vs. made an explicit call between two subagents' conflicting suggestions.

#### 1. UX research findings (audit against usability heuristics, not just "looks generic")

- The single accent color (`brand-600`, ~#22c569) carries three unrelated meanings at once —
  primary CTA (`btn-primary`), active filter (`PillOption` active state), and nav location
  (`NavBar` active link) — with nothing else to tell them apart.
- Section headers and sub-labels in `IntakeForm` are nearly the same visual weight (`.label` at
  `text-sm font-medium` vs. sub-group labels at `text-sm text-neutral-600` — a one-shade difference
  is the only cue).
- Single-select pill groups (days mode, effort, family-occasion) and multi-select pill groups (dish
  styles, proteins, avoid-repeat) use the identical `PillOption` component with no visual affordance
  for "pick one" vs. "pick any."
- Eight stacked, equally-weighted `.card` sections in the intake form, uniform `space-y-6` gaps,
  nothing signals which are essential vs. optional before the submit button at the very bottom.
- `PillOption` tap targets are `px-3.5 py-1.5` text-sm — roughly 30-33px effective height, under the
  44px guidance, with only `gap-2` (8px) between wrapped chips in 6-10-chip groups.
- No `focus-visible` styling defined on `PillOption` at all (in either `IntakeForm` or
  `SettingsForm`) — `.input` has a focus ring, the app's most-used control doesn't.
- Substantive instructional copy (not decoration) rendered at `text-neutral-400`/`text-neutral-300`
  — roughly 2.8:1 contrast on white, failing WCAG AA for body text — in the kids-meals-off note,
  the de-emphasised-styles note, the protein hint, and the shopping-list tip.
- `WeekNutritionSummary` is `<details open>` by default, pushing 7 plain number rows above the meal
  tabs on every single visit even though its own purpose is a secondary at-a-glance check.
- Nutrition is numbers-only with no relative/visual encoding anywhere (`WeekNutritionSummary`'s
  per-day rows, `MealCard`'s 5-stat `MacrosRow`) — the stated "am I on track" question requires
  manual mental math across up to 7 rows.
- `MacrosRow`'s `grid-cols-5` gives kcal/protein (the goal-relevant stats per `PROJECT.md` §3) no
  more visual weight than carbs/fat/fibre.
- `WeekTabs.tsx` and `MealTrackTabs.tsx` independently hand-roll the same segmented-tab markup, and
  `PillOption` is separately reimplemented inline in `SettingsForm.tsx` (missing the `transition`
  class the original has) — duplicated, drifting patterns rather than one shared component.
- Mobile nav uses raw emoji (🍽️ 🗓️ ⚙️ 🚪) as icons — inconsistent rendering across OSes, can't take
  brand styling, and the active/inactive state is color-only with no other differentiator.

#### 2. Creative design direction (grounded in the actual subject: a household's recipe box, three eaters, a Saturday/Sunday table)

**Color** — six named hex values, each doing exactly one job (all pass WCAG AA as text-on-Paper and
white-on-fill):

| Name | Hex | Job |
|---|---|---|
| Paper | `#EDEEE6` | Background — card-stock/chopping-board paper, not linen-cream |
| Ink | `#24231F` | Primary text, structural lines |
| Parents Petrol | `#1F5F5A` | The parents' calorie-deficit/high-protein track |
| Kids Marigold | `#8C5A0A` | The kids' simpler, repeatable track |
| Family Bramble | `#7A2340` | Weekend sit-down/BBQ family occasions |
| Status Sage | `#4B6B4E` | Completion/on-target state (not a fourth "track" — a state) |

**Type** — three typefaces, each with one restrained role: **Bricolage Grotesque** (display —
week header, section titles, index-tab labels, used only at large sizes so it stays a treat, not
wallpaper), **Inter** (kept, body/UI — labels, buttons, nav, paragraphs), **IBM Plex Mono** (data —
every macro/nutrition figure, shopping-list quantities, dates; tabular numerals via monospace
without needing an OpenType feature flag, and it reads like an actual food-packaging nutrition
panel — the right register for this content).

**Layout** — break the intake form's eight identical cards into one continuous "recipe box":
question clusters grouped and colored by *who they're for* (Family/Parents/Kids/shared), each
introduced by a small colored index-tab instead of a same-weight card border; single-select
questions render as a joined tab-strip, multi-select questions render as checkbox-style chips.
Low-frequency fields (budget, effort, notes) collapse into one closed accordion.

**Signature element** — explicitly overrides the task brief's originally-sketched "colored
edge/spine on cards" in favor of an **index-tab notch** (the physical divider tab from an actual
recipe box) at the top-left corner of each cluster, filled in the track color, carrying the
section's short label. Reasoning given: a flat spine is a generic "category color bar" any app
could use; a die-cut tab is specific to this subject and does double duty as the missing
hierarchy/label signal the research flagged, rather than being pure decoration.

**Self-critique against the three flagged AI-design clichés** — checked explicitly, none hit by
default: not cream+serif+terracotta (Paper is a cooler grey-green, not pink-cream; display face is
a grotesque not a serif; no clay/terracotta hue exists anywhere in the palette — Bramble is a
wine-berry, not clay-orange); not near-black+single-acid-accent (background stays light, three
desaturated track colors each carry one meaning rather than one loud accent, Status Sage is muted
not vermilion); not broadsheet (guarded against by using tab-shaped notches and rounded card stock
rather than hairline dividers, and by grouping into a small number of labeled clusters rather than
dense multi-column rules — flagged as the closest risk given "structure is information," but
avoided).

#### 3. UX/interaction mobile pressure-test (of the direction above, against real `IntakeForm.tsx` content density)

- **Joined tab-strip (single-select)**: workable at 44px height on a 375px screen (3 segments ≈
  114px each), but several existing option labels ("Weekdays only (Mon-Fri)", "Sit-down dinner")
  will wrap to 2 lines in that width and misalign the strip — needs shorter copy, not a layout
  change.
- **Checkbox-chips (multi-select)**: the current `PillOption` sizing (`px-3.5 py-1.5`, ~34px) is
  exactly the sub-44px problem the researcher flagged and the design brief doesn't override it by
  itself — needs an explicit `min-h-11 min-w-11 px-4 py-2.5` rule and `gap-2.5` (not `gap-2`)
  between wrapped chips so growing the targets doesn't create adjacent-mistap risk. The checkbox
  glyph must be decorative only — the whole chip stays the tap target.
  - **Overriding the wireframe as drawn**: the design brief's own ASCII wireframe wraps most
    multi-select rows onto single lines with inline glyphs (`☑Lunch ☑Dinner ☐Breakfast`) — treated
    as illustrative shorthand, not a literal spacing spec, since the pressure-test's 44px floor
    doesn't fit that density. Implementation follows the pressure-test's concrete sizing over the
    wireframe's visual compression.
- **Vertical cost**: rough estimate on a 375×667 viewport put the new clustered layout at ~960px
  before reaching the collapsed accordion, versus 1500px+ for today's 8 bordered cards — a real net
  win, but only if the tap-target floor above doesn't erase it. Verdict: index-tab clustering alone
  is not sufficient; needs an added collapse layer (next point).
- **Progressive disclosure — goes further than the design brief's "budget/effort/notes only"
  accordion**: family-occasion pickers, the parents/kids meal-time toggles, and the protein
  selector all have real household defaults already wired in code (`defaultSatBreakfastMode`,
  `parentMeals`/`kidsMeals` defaults, `defaultProteins`) — each collapses to a single-line editable
  summary that expands on tap, rather than always rendering the full chip/tab-strip set. Dish
  styles (no preset, starts empty) and the avoid-repeat text input (novel input every time) stay
  always-expanded, since collapsing those would hide the fields a user is actually most likely to
  touch.
- **`WeekNutritionSummary`'s `<details open>`**: confirmed as a fix regardless of the new visual
  system — default closed, matching `MealCard`'s ingredients/method disclosures, with the headline
  kcal/protein figures already living in the `<summary>` line so no information is lost by
  collapsing.
- **Index-tab notch**: kept, with a guardrail — rendered as a non-interactive heading
  (`cursor-default`, no hover/active state, not a `<button>`) so it doesn't read as a tappable
  affordance sitting directly above genuinely tappable chips/tab-strips.
- **`WeekTabs.tsx`/`MealTrackTabs.tsx`**: flagged as already having the same sub-44px tab height as
  `PillOption` (`py-2 text-sm` ≈ 36px) — the `min-h-11` fix applies to these existing components
  too, not just newly-built ones.

#### Resolutions / build-time calls

- **Followed the UX/interaction pass over the design brief's literal wireframe** where they
  conflicted on chip/tab sizing (see the "Overriding the wireframe" note above) — the 44px floor is
  a hard requirement per the task brief, the ASCII sketch was always illustrative.
- **Extended the "collapse to summary" treatment to the protein picker**, matching the
  UX/interaction pass's aside that it should get the same treatment as the family-occasion/meal-time
  clusters (all three share the same "has a wired default, rarely changed" shape) — dish styles
  and avoid-repeat stay expanded per its explicit "must stay visible" call.
- **Nutrition visualization**: implemented as a small relative bar per day (`WeekNutritionSummary`)
  and a two-tier macro layout (`MealCard`'s `MacrosRow`, kcal/protein visually larger than
  carbs/fat/fibre) — the starting sketch in the task brief suggested this as "one option" for
  replacing the plain number table; kept it, since neither subagent pass raised a reason to prefer
  something else, and it directly answers the research pass's "requires manual mental math" finding.
- **Nav emoji (🍽️ 🗓️ ⚙️ 🚪)**: left as-is rather than rebuilt into a custom icon set. The research
  pass flagged this as a contributor to the generic-template feel, but a full icon system is a
  larger scope addition than this pass's other fixes and wasn't specifically pressure-tested by
  either the creative-design or UX/interaction pass — improved instead with `focus-visible` rings
  and a stronger (non-color-only) active-state indicator on both the desktop and mobile nav, leaving
  the icon question open for a future pass rather than guessing at a full replacement set.

## MVP 1.3 follow-up: intake form regrouping, plan-page intake summary, collapsible days

Small operator-requested tweaks after MVP 1.3 merged. Since that PR was already merged, the branch
was reset to latest `main` before this work per the standard "already-merged PR" branching rule
(same situation documented in earlier milestones' "Branching" entries) rather than stacked on the
merged commit.

- **`IntakeForm.tsx` regrouped**: "Avoid repeating" moved from its own standalone section into the
  "Budget, effort & notes" accordion (renamed "Budget, effort & avoid repeating"); the notes
  textarea moved out of that same accordion into its own new "About this week" section. Operator
  request, not a usability finding - implemented as asked. Flagged to the operator that this leaves
  two similarly-worded index-tab labels on the same form ("This week" for dish styles, "About this
  week" for notes) - operator confirmed keeping both as specified rather than renaming either.
- **Intake context surfaced on the plan page**: `weeks.intakeJson` already persists the full intake
  (including `avoidRepeating` and `notes`) verbatim at generation time (see the "Data model" entry
  above) - no schema change needed, just a new read. `WeekIntakeSummary.tsx` renders an "About this
  week" card at the top of `/plan/[weekId]`, showing the notes text and "Avoiding: ..." list from
  that same week's stored intake, and renders nothing if both are empty (most weeks, historically,
  since neither field is required).
- **Days collapsed by default in the recipe view**: each day's `<details>` in `MealTrackTabs.tsx` -
  previously an always-expanded `<section>` - now defaults closed, with a meal-count hint in the
  summary row. A full week of expanded meal cards was a genuine wall of content on a narrow screen
  (the UX/interaction pass's MVP 1.3 finding about needing more progressive disclosure than the
  budget/effort/notes accordion alone applies here too, just not caught in that pass since it was
  scoped to the intake form). `WeekNutritionSummary` (also a closed-by-default `<details>`) sits
  above the day list, so the smoke test's original `page.locator("details summary").first()` now
  hits the wrong element - the day sections got `data-testid="day-section"` so the test can target
  them unambiguously (see `tests/e2e/smoke.spec.ts`).

## Cholesterol-lowering focus toggle

Operator-requested feature, not a bug fix or visual tweak - a per-week intake toggle that (a) biases
generation toward ingredients with recognised LDL-cholesterol-lowering properties and (b) marks
qualifying ingredients with a ♥ badge on the recipe, confirmed via `AskUserQuestion` (per-week
intake toggle, not a Settings default; both bias generation and label ingredients, not display-only).

- **`cholesterolLowering: boolean` added to `ingredientSchema`** (`src/lib/claude/schema.ts`) as a
  **required** field, not optional/defaulted - Claude sets it honestly on every ingredient in every
  meal regardless of whether that week's toggle is on, per explicit system-prompt instruction (see
  `buildSystemPrompt`). Required rather than optional so the model can't silently omit it; this is
  the same "evidence-based property of the ingredient" framing used for `aisle`, not a per-week flag
  - a week with the toggle off can still show ♥ on an oily-fish dinner if that's just what got
    generated.
- **`intake.lowerCholesterol: boolean`** added to `weekIntakeSchema` (default `false`) and the
  `WeekIntake` type - when true, `buildUserPrompt` adds one line telling Claude to actively favour
  cholesterol-lowering ingredients this week "without abandoning the dish styles/proteins/effort
  requested above" (i.e. a bias, not an override of everything else asked for).
- **UI**: a single `Chip` ("♥ Lower cholesterol") in the intake form's existing "This week"
  `TrackSection`, next to dish styles - a boolean toggle didn't warrant its own index-tab cluster.
  `IngredientLine.tsx` renders a small ♥ (sage-colored, `title`/`aria-label` for the tooltip and
  screen readers) after any ingredient where `cholesterolLowering` is true, on every week's recipes,
  not gated on that week's toggle having been on.
- **Scoped to the recipe ingredient list only, not the shopping list** - `aggregate.ts`'s
  shopping-list dedupe already collapses per-meal ingredient objects down to `productName`/quantity
  by name, discarding other per-ingredient fields; carrying `cholesterolLowering` through there too
  is a reasonable follow-up but wasn't asked for and adds aggregation-merge-semantics complexity
  (what happens if the same product name shows up both flagged and unflagged across meals) that
  didn't seem worth guessing at unprompted.
- **Required-field ripple**: making the Claude-schema field required (not optional/defaulted) meant
  every hand-written `Ingredient`/`MealPlanItem` object literal typed against it needed the field
  added - `src/lib/claude/mock.ts`, `scripts/eval-method-steps.ts`, and the `WeekIntake`-typed
  fixtures in `tests/unit/{mvp12-generation-integration,mvp21-meal-times-and-override,
  retry-generation,shopping-checked,system-prompt,week-ordering,leftover-cap,claude-schema}.test.ts`
  all got `cholesterolLowering: false` (or `true` on the mock's "mixed vegetables", to give the
  heart badge something real to render in mocked/e2e runs) - mechanical, not a design decision, but
  worth noting since it touched a lot of files for one added field. The DB-side `Ingredient` type
  (`src/lib/db/schema.ts`) keeps this field **optional** instead, since weeks generated before this
  shipped won't have it in their stored `ingredients_json` - `IngredientLine` treats missing as
  "no badge", not an error.

## Saturated fat: extended the cholesterol toggle rather than a new one

Operator asked to also lower saturated fat (e.g. low-fat/no-fat yoghurt) and whether that needed a
new button. Answered directly rather than re-opening `AskUserQuestion`, since the nutrition case is
clear-cut: standard cholesterol-lowering dietary guidance (NHS/AHA) already bundles "eat less
saturated fat" and "eat more soluble-fibre/unsaturated-fat foods" as one piece of advice, not two -
so **no new toggle**. The existing `lowerCholesterol` intake flag now biases generation toward both
qualities at once (see `buildUserPrompt`'s bias line), and its chip's description text in
`IntakeForm.tsx` was reworded to say so, rather than adding a second chip for what's really the same
underlying "heart-healthy this week" request.

- **`lowSaturatedFat: boolean` added to `ingredientSchema`** (`src/lib/claude/schema.ts`), same
  required-field treatment as `cholesterolLowering` and for the same reason (an honest,
  evidence-based property of the ingredient, always set, not gated on that week's toggle) - low-fat/
  fat-free dairy, lean/trimmed cuts, skinless poultry, egg whites, or an unsaturated-fat swap like
  olive oil for butter.
- **Tracked and badged as a separate fact from `cholesterolLowering`, not folded into it** - the two
  are correlated but not the same property (low-fat yoghurt is low in saturated fat but has no
  cholesterol-lowering property of its own; oily fish is both; oats are cholesterol-lowering but not
  meaningfully a "fat" ingredient at all). An ingredient can be either, both, or neither, so each
  needed its own boolean and its own icon rather than collapsing to one "heart-healthy: yes/no" flag.
- **Icon choice**: an outline droplet-with-a-slash SVG (`IngredientLine.tsx`'s `LowFatIcon`), not a
  second emoji or a reused/recolored heart - deliberately a different *shape* (outline vs. the ♥
  glyph's filled shape) so the two badges read as distinct at a glance before a reader gets to the
  tooltip text, same reasoning the MVP 1.3 pass used for track colors carrying one meaning each. A
  custom inline SVG (not emoji) to stay consistent with the app's existing icon pattern (the
  chevrons/checkmarks already in `TabStrip`/`Chip`/`CollapsibleTrackSection`) and avoid the
  cross-platform emoji-rendering inconsistency flagged against `NavBar`'s icons in MVP 1.3.
- Same required-field ripple as the cholesterol toggle, smaller this time (`cholesterolLowering` was
  already threaded through every fixture) - `mock.ts` and two `tests/unit/*.test.ts` ingredient
  literals needed `lowSaturatedFat` added.

## Multi-agent app review (UX, CX, end-user, nutritionist)

Four independent subagent reviews of the live app (UX, CX, an end-user roleplay, and a nutrition-
science review), run against a shared mocked-generation dev server so each could actually drive the
app rather than review from code alone. Full findings reported to the operator directly, not
duplicated here in full - this entry is the pointer for future sessions. Cross-cutting findings three
reviewers converged on independently: the ♥/low-saturated-fat badges rely on `title`/`aria-label`
tooltips, which don't fire on touch (no hover on iOS Safari, unreliable on Android) - effectively
unreadable on the mobile-first surface this app targets; History can't distinguish same-day weeks
(no meal-title preview, no feedback recap); the shopping-list quantity formatting has a real bug
(`"6+6+6"` instead of a summed total, `"32 tbsp"` pesto instead of a sensible unit); a new household
gets no onboarding nudge toward Settings before its first "Plan a new week." One regression the UX
pass caught: `FeedbackControls.tsx`'s rating pills are still ~36px tall, under the 44px floor MVP 1.3
established everywhere else - missed during that pass, not a deliberate exception. None of these were
fixed as part of this entry - this is the review, not the fix; see the operator's own prioritisation
for what gets picked up next.

The nutritionist pass separately flagged, as the most safety-relevant findings: the
`cholesterolLowering`/`lowSaturatedFat` flags are unverified LLM self-reports with no clinical
cross-check and no disclaimer anywhere that this isn't medical advice; family-occasion meals are
cooked once to the adult calorie-deficit framing and kids eat the identical dish (the nutrition
*summary* already excludes kids from its totals, but that doesn't change what's actually served);
sodium isn't tracked at all despite the heart-health framing.

## Backlog item: household/per-week "Goals" selector (Lose weight / Build muscle / Balanced / Reduce cholesterol) - not built, nutritionist-reviewed first

Operator-proposed feature, explicitly requested as a backlog item rather than built now, and
explicitly requested to get a nutritionist's review of the goal set before it was written up - see
`REQUIREMENTS.md`'s Backlog section for the short version. Full nutritionist recommendations below,
to build from directly whenever this is picked up:

1. **Single-select, not independently combinable** - "Lose weight" + "Build muscle" is nutritionally
   contradictory as a silent default; recomposition is a real but individualized goal an AI planner
   shouldn't attempt unprompted. Recommendation: fold "Reduce cholesterol" into the same four-way
   single-select rather than keeping today's `lowerCholesterol` toggle orthogonal - the ingredient
   bias it already does (lean protein, fibre, unsaturated fat) overlaps almost completely with what
   a sensible "Lose weight" default would already favour, so stacking mostly adds UI complexity for
   little practical difference. (Documented alternative if independence is wanted later: single-select
   the calorie/protein framing, keep "Reduce cholesterol" as a second orthogonal boolean layering its
   existing ingredient-bias logic on top - the codebase already half-supports this, since the badge
   logic doesn't depend on the deficit language at all.)
2. **The hardcoded deficit framing has to become goal-conditional, not a fixed default with
   overrides bolted on** - this is a real reversal of the original v1 "Adult-track nutrition goals"
   decision (§3), worth its own DECISIONS.md entry when actually built, not just an additive feature.
   `buildSystemPrompt`'s single hardcoded nutrition bullet becomes a lookup keyed on the selected
   goal: Lose weight keeps today's line near-unchanged (moderate deficit, high protein, high fibre,
   minimal ultra-processed); Build muscle explicitly drops the deficit (maintenance-or-slight-surplus,
   protein pushed higher, ~35-45g/adult main meal); Balanced drops deficit/surplus language entirely
   (adequate, varied, moderate portions) and needs its own wording distinct from the kids track's
   near-identical framing, not to read as "same as kids' food"; Reduce cholesterol (if kept as a
   fourth option per point 1) keeps today's ingredient-bias language with a neutral calorie framing,
   since the clinical target is LDL/saturated fat, not weight.
3. **"Lose weight" safety scope**: with no weight/height/age/sex/activity data collected, the only
   responsible implementation is one fixed, conservative deficit (close to what's already shipped),
   with an explicit model instruction to never suggest a specific weight-loss rate, target, or
   timeline. No UI path should ever let a household type a target weight or a numeric calorie floor -
   that starts to look like individualized medical/dietary prescription from a system with no
   clinical inputs to validate it. Ship a one-time, dismissible disclaimer when "Lose weight" or
   "Build muscle" is first selected ("general healthy-eating guidance, not personalized medical or
   dietetic advice") - also the natural place to finally add the disclaimer the nutritionist review
   flagged as missing for the existing cholesterol/sat-fat badges.
4. **Household Settings default, overridable per week** - not per-week-only like the cholesterol
   toggle (a nutrition goal is a longer-lived household characteristic, not a weekly whim) and not
   household-only either. Concretely: a `goal` column on `households` (parallel to `store`,
   `budgetDefault`), plus an optional per-week `goalOverride` in the intake that wins when set, same
   override pattern `notes` already uses.
5. **Kids must never inherit an adult's selected goal** - the kids track's existing
   "balanced, age-appropriate, no numeric targets" framing stays hardcoded and goal-independent,
   regardless of what the household's adults pick. **Family-occasion meals are the harder case**
   (already flagged by the earlier nutritionist review, independent of this feature): they're cooked
   once for adults and kids together, so a household on "Lose weight" or "Build muscle" would
   otherwise generate the shared family meal under an adult framing kids also eat. Recommended fix
   when this is built: family-occasion meals always use the "Balanced" framing regardless of the
   household's selected goal - occasions are already a separate track in the prompt, so this is a
   small conditional, not a structural change, and it closes a gap that predates this feature rather
   than introducing a new one.

## Backlog execution: "execute all the backlog, don't need me involved"

The operator asked for every item in `REQUIREMENTS.md`'s Backlog section to be built, autonomously,
with the decision log kept current. Scoped precisely to that section's six items (not every review
finding from the "Multi-agent app review" entry above, which was never formalised into that list) -
four were built this pass (see their own entries below); two were deliberately left un-built with
reasoning logged (see the "Deliberately not built" entry) rather than guessed at blind, since both
are large enough decisions (a fundamental auth/data-model pivot; an operator infrastructure choice
neither of which this session could responsibly make alone) that building something risks producing
the wrong thing entirely rather than just extra, discardable work.

### Generation prompt-tuning pass for kids meals

`REQUIREMENTS.md`'s backlog item: "kids meals could be more instructive/varied." The MVP 1.2
decision that kids meals may repeat week-to-week (`recentTitles` anti-repeat rule doesn't apply to
the kids track) stays exactly as it was - re-litigating it wasn't what "more varied" was asking for.
What changed in `buildSystemPrompt`'s kids-track bullet:
- **Within-week variety**: explicitly asks for different dish types across a single week's kids
  slots (not the same one or two go-to recipes every time), with a short example repertoire
  (wraps, traybakes, stir-fries, jacket potatoes, omelettes, soups, homemade-style pizza, rice/
  noodle bowls) so the model has concrete options to draw from instead of defaulting narrow.
- **Instructiveness clarified, not changed**: the existing method-step rules (temperature, timing,
  doneness cues) already applied to every track structurally, but "kids meals should be simple"
  could plausibly be read by the model as license for a shorthand method write-up too. Added one
  explicit sentence separating "simple" (the dish/ingredient list) from the method's detail level,
  which stays identical to every other track.
- Verified via `tests/unit/system-prompt-method-steps.test.ts` content-assertions (the established
  pattern for this file, since prompt *quality* can't be verified without a live Claude call - no
  `ANTHROPIC_API_KEY` in this sandbox, same limitation every prior session flagged for this kind of
  change).

### "Swap this meal"

`REQUIREMENTS.md`'s backlog item: regenerate a single meal instead of the whole week.

- **New `POST /api/meals/[mealId]/swap`**, synchronous (not the `after()`+202+poll pattern
  `/api/generate` uses) - a single-meal call (`max_tokens: 4000`, a new `emit_meal` tool reusing
  `mealSchema` directly via a new `mealToolInputSchema()`) is small/fast enough that the client can
  just await the response, so no polling infrastructure was worth building for it. `maxDuration = 60`
  covers the Anthropic call running slower than Vercel's short default.
- **Batch-cook meals can't be swapped** (`SwapNotAllowedError`, 409) - a batch-cook source's
  leftover relationship is described only on *its own* row (`leftoverForJson`); other days' meal
  rows don't reference it back, so swapping it away would silently strand whatever those days'
  content says about "using Monday's batch" with nothing left to describe. Simplest safe rule:
  disallow it outright rather than trying to keep a swapped-in meal's batch/leftover shape in exact
  sync with rows this call doesn't touch. The button isn't even rendered for these meals
  client-side, so the 409 is a defensive backstop, not the primary UX.
- **The replacement never introduces a new batch-cook or freezer-inventory relationship**
  (`batchCook`/`usesFreezerItem` force-set to `null` server-side after parsing, not just prompted
  for) - the rest of the week's plan was already generated around the meal being replaced, so a
  swap creating new same-week leftover/freezer dependencies risks invalidating leftover-cap
  accounting or freezer bookkeeping that already happened for other meals.
- **`slot`/`track`/servings are force-overridden server-side** after parsing, same reasoning as
  every other "validated with a forced tool call, still don't fully trust the model" decision in
  this codebase - the swap must replace exactly the meal that was clicked, not something the model
  decided to reinterpret.
- **Whole-week shopping list re-aggregated in place** (`replaceShoppingItemsForWeek` - delete +
  reinsert for that week) after the swap, using the exact same deterministic `aggregateShoppingList`
  a fresh generation uses, just re-run for one week's current meals instead of a freshly-inserted
  batch. `planJson` (the raw blob) is deliberately left stale after a swap - nothing else reads meal
  content from it (the normalized `meals` table is what every view renders from), so the only
  practical effect is the home page's week-summary teaser text not reflecting a later swap. Judged
  not worth patching for a one-line, low-visibility teaser versus the complexity of also editing a
  blob shaped like a full-week Claude response for a single-meal change.
- Verified with a PGlite integration test (`tests/unit/swap-meal.test.ts`, mocked generation) proving
  the batch-cook rejection, the in-place content replacement (slot/track/servings preserved), and
  the shopping-list re-aggregation actually picking up the new ingredient.

### Freezer inventory tracking

`REQUIREMENTS.md`'s backlog item: "knowing what's already batch-frozen from a prior week and
factoring that into future generation (skip re-cooking/re-buying accordingly)."

- **New `freezer_inventory` table** (migration `0004`): one row per batch-freezing event (not one
  row per household) - `itemName`, `portions`, `frozenFromWeekId` (informational only), decremented
  or deleted as it's consumed. A new `meals.usesFreezerItem` column (nullable text) records which
  inventory item a given meal reheated, mutually exclusive with `batchMakes` (a meal either makes a
  new batch or reheats an old one, never both - enforced in the prompt and, for swaps, server-side).
- **Stocking**: any meal with `batchCook.freezerPortions > 0` at persist time adds a
  `freezer_inventory` row (`persistPlan`, after the existing image-resolution step). **Consumption**:
  the household's current freezer inventory (name + portions) is listed in `buildUserPrompt`'s
  message every generation; if Claude sets `meal.usesFreezerItem` to a name matching one exactly, the
  matching row is decremented by that meal's total servings after persisting, deleted at zero. Portion
  accounting is intentionally approximate (servings consumed, not a stricter unit-of-measure model) -
  good enough for "should we cook this again or not," not trying to be a precise kitchen inventory
  system.
- **Consumption can't be verified without a live Claude call** (same sandbox limitation as the kids
  prompt-tuning pass) - `MOCK_GENERATION`'s deterministic mock plan doesn't take freezer inventory as
  an input the way a real call does, so extending the mock to fake "the model chose to use a freezer
  item" would just be testing invented mock logic, not the real prompt-following behaviour. What *is*
  tested (via `tests/unit/freezer-inventory.test.ts`, PGlite + mocked generation): stocking from a
  real `freezerPortions` value, exact-name lookup, decrement-then-delete-at-zero, and manual removal -
  the whole storage/query layer the consumption path depends on, just not the "does Claude actually
  choose well" question itself.
- **Settings UI**: a read-only list (household-level standing state, same section pattern as favorite
  proteins/family occasions) plus a manual "Used it" removal per item (`DELETE
  /api/freezer-items/[itemId]`, idempotent) for a household member who ate or binned something
  without waiting for a future generation to consume it server-side. No manual "add" affordance -
  deliberately kept as a faithful record of what generation actually froze, not a free-form todo
  list, to avoid the inventory drifting from what's really in the freezer.
- **MealCard badge**: a meal with `usesFreezerItem` set shows a small "From the freezer" badge
  (sage-colored, distinct from the existing amber "Makes N" batch-cook badge, matching the "one
  color, one job" reasoning from MVP 1.3's palette).

### Goals selector

`REQUIREMENTS.md`'s backlog item: a 4-way nutrition goal (lose weight / build muscle / balanced /
reduce cholesterol), added after a dedicated nutritionist-review pass (see the earlier "Goals
backlog item" entry above) that produced 5 concrete recommendations. All 5 are reflected below.

- **Replaces `lowerCholesterol` entirely, not layered alongside it.** The nutritionist review's
  recommendation was to fold the old boolean toggle into the new goal set as its own option
  (`reduce_cholesterol`) rather than keep both live at once - two independent, un-composed nutrition
  controls (a 4-way goal *and* a separate cholesterol checkbox) would raise the question of what
  happens when someone picks "Build muscle" *and* checks the old toggle, with no good answer. One
  control, four mutually exclusive options, is simpler for the household and for the prompt.
- **`Goal` type and `households.goal` column** (migration `0005`, default `"lose_weight"` to match
  the old always-on deficit framing so existing households see no behaviour change until they
  actively pick something else). **`WeekIntake.goal`** replaces `WeekIntake.lowerCholesterol`,
  pre-filled from the household default and fully overridable per week - the same pattern already
  used for `proteins`/`budget`.
- **Nutrition framing moved from `buildSystemPrompt` into `buildUserPrompt`/`buildSwapMealUserPrompt`.**
  The old cholesterol framing lived in the household-level system prompt (which only ever takes
  `household`, not `intake`) because it was a per-household toggle at the time. Goal is a per-week
  resolved value now, so its framing belongs in the per-week user-prompt builders instead, which
  already receive `intake`. Each of the 4 goals gets its own `GOAL_FRAMING` string:
  - `lose_weight` / `build_muscle`: explicitly **never state a specific weight-loss rate, target
    calorie number, weight target, timeline, or training programme** - a second nutritionist-review
    recommendation, since this app has no way to know an individual's actual calorie needs and
    stating a number would misrepresent general guidance as personalised advice.
  - `balanced`: no deficit/surplus/calorie framing at all, just whole-food variety.
  - `reduce_cholesterol`: unchanged from the old toggle's ingredient-level guidance (oats, oily fish,
    nuts, legumes, olive oil, low-fat dairy, lean/trimmed meat, skinless poultry).
- **Goal never applies to the kids track or to family-occasion meals** - both always use the
  `balanced` framing regardless of the week's selected goal, since kids eat family-occasion meals too
  and a deficit/surplus/cholesterol focus aimed at adults has no place there. This was true of the old
  cholesterol toggle as well; carried forward unchanged.
- **Disclaimer copy broadened to cover all 4 goals, not just the two the nutritionist flagged.** The
  nutritionist reviews (both the original cholesterol-toggle review and this goals review) raised
  disclaimer concerns specifically about `lose_weight`/`build_muscle`'s deficit/surplus language and
  about `reduce_cholesterol`'s health-adjacent framing. Rather than showing different disclaimer text
  per goal, one disclaimer line ("General everyday guidance, not individualised advice - talk to a
  healthcare professional for anything specific to you.") is shown under the selector for all 4
  options - simpler to maintain and avoids implying `balanced` is somehow exempt from the same
  "this is not personalised advice" caveat.
- **UI: two stacked 2-item `TabStrip` rows, not a 4-item single row.** The shared `TabStrip` component
  is also used for Days needed, family occasion pickers, and Effort level, all of which assume a
  narrow (2-3) segment count and were mobile-pressure-tested at that width (see MVP 1.3's UX/interaction
  finding). Extending `TabStrip` itself to gracefully handle 4 segments on a 375px screen without
  re-testing every other caller risked a layout regression elsewhere for a single new caller's
  benefit. Two 2-item rows, both bound to the same state value/setter, form a visual 2x2 grid while
  each row internally stays inside `TabStrip`'s already-verified layout envelope. Shown in both
  `IntakeForm` (per-week, defaults from the household) and `SettingsForm` (household default, still
  fully overridable per week) - verified end-to-end via Playwright against the mocked dev server:
  saving a household default in Settings persists and is picked up as the Intake form's default on
  the next visit, and submitting a week with a non-default goal selected reaches `/api/generate`
  successfully.

### Deliberately not built: multi-household support, push notifications

`REQUIREMENTS.md`'s remaining two backlog items - the only two left unbuilt after this execution
pass. Both are left ⬜ on purpose, not skipped by oversight: each needs a decision this session
shouldn't make unilaterally under a "don't need me involved" mandate, because each decision would be
expensive or awkward to reverse later and materially changes what gets built.

- **Multi-household / multi-user support.** Every other backlog item this pass (Swap this meal,
  Freezer inventory, Goals selector, the kids prompt-tuning pass) is additive: new columns, new
  routes, new UI sections, none of it touching how a household is identified or authenticated. This
  one isn't - `getOrCreateHousehold()` (`src/lib/db/queries.ts`) is single-row-by-design (§3 of
  `PROJECT.md`, "v1 is single-household"), and the entire app - auth (`APP_PASSWORD`, one shared
  password, no per-user accounts), every query, every API route - assumes exactly one household
  exists. Building this for real means picking an auth model (per-user accounts? invite links? still
  a single shared household, or genuinely multi-tenant?) and a data-model shape (household membership
  table? row-level scoping on every existing query?) before a single line of feature code, and picking
  wrong is the kind of thing that's painful to unwind once real data exists under the old shape.
  That's a product/architecture decision for whoever owns this app to make explicitly, not something
  to guess at while executing a backlog autonomously.
- **Push notifications / reminders** (e.g. "start Monday's batch cook"). Unlike the app's existing
  surface (Next.js pages/API routes with no background jobs or third-party services), this requires
  picking and standing up delivery infrastructure the app doesn't have any of today: web push
  (needs a service worker, VAPID keys, browser permission UX), email (needs a transactional-email
  provider and a from-address), or SMS (needs a provider like Twilio and ongoing per-message cost).
  Each has a real ongoing cost and operational surface (deliverability, unsubscribes, a provider
  account with its own credentials) that outlasts this one PR - an infrastructure choice for the
  operator to make, not a default this session should pick on its own.

Both stay as ⬜ backlog items rather than being removed - they're still real, still wanted, just
blocked on a decision outside this session's scope. Revisit either by asking the operator to pick a
direction first (auth model for the first, delivery channel for the second), then treat it as its own
scoped feature the same way Goals/Swap/Freezer were.

## Goals selector: two-axis redesign

Operator feedback shortly after the Goals selector above shipped: *"you can build muscle and loose
weight by focusing on protein - can you review that feature and make it it's own section - perhaps
it should be increase protein - can you research on web please and brainstorm a better goals
section."* This is a real correction, not a preference tweak - the original single 4-way `Goal` enum
(Lose weight / Build muscle / Balanced / Reduce cholesterol) conflated two things that don't actually
compete with each other.

**Research first, before touching any code** (web search, cited in the sources given to the operator
in chat):
- The 2025-2030 US Dietary Guidelines moved to 1.2-1.6g protein/kg bodyweight/day (up from 0.8g,
  unchanged for 70+ years); ACSM/AND/Dietitians of Canada recommend 1.2-2.0g/kg for anyone training,
  "to optimize recovery... and promote the growth and maintenance of lean mass."
- Protein >1.3g/kg/day is associated with increased muscle mass; <1.0g/kg/day with a higher risk of
  muscle mass decline - i.e. the SAME high-protein target that builds muscle in a surplus also
  *prevents muscle loss* in a deficit.
- Higher protein intake during a deficit measurably improves satiety (less hunger, easier adherence)
  and better preserves lean mass than an equivalent deficit at lower protein.
- Precedent from established macro-tracking apps (MyFitnessPal, MacroFactor, Cronometer): all treat
  "high protein" as an independent modifier layered on top of a calorie goal, not a goal unto itself.

**Conclusion**: protein isn't a competing goal alongside "lose weight" and "build muscle" - it's the
evidence-based mechanism behind BOTH of them. The old enum forced a false choice (pick "Build muscle"
*or* get the cholesterol guidance, never both; no way to say "lose weight and eat more protein while
I'm at it" even though that's the single best-supported combination in the research above).

**Redesign - two independent axes, presented to the operator as a specific recommendation before any
code was touched** (confirmed via `AskUserQuestion` against a documented alternative: just bolting on
a 5th mutually-exclusive "Increase protein" option, which would have preserved the same underlying
conflation):
- **`EnergyDirection`** (single-select, unchanged in kind from before): `lose_weight` | `balanced` |
  `build_muscle`. Purely the calorie-direction question - deficit, neutral, or surplus/maintenance.
  No longer says anything about protein.
- **`NutritionFocus[]`** (multi-select, new): `increase_protein` | `reduce_cholesterol`. Stackable on
  top of any direction, because neither has a real relationship to calorie direction -
  `increase_protein` is the same guidance whether the week is in deficit or surplus,
  `reduce_cholesterol` never had one either (it's about LDL/saturated fat, orthogonal to weight).
  This also fixes a real gap in the old design: a household can now combine "Lose weight" with
  "Reduce cholesterol" in one week, which the old single-enum design couldn't express at all.
- `households.goal` (single text column) → `households.energyDirection` + `households.focuses`
  (jsonb array, same storage pattern as `favoriteProteins`). `WeekIntake.goal` → `WeekIntake.energyDirection`
  + `WeekIntake.focuses`, same per-week-override-of-a-household-default pattern as everything else on
  that type.
- **Migration `0006`** backfills every existing household's old `goal` value losslessly rather than
  just defaulting everyone back to `lose_weight`: `reduce_cholesterol` → `energyDirection: "balanced"`
  + `focuses: ["reduce_cholesterol"]` (it never had a direction opinion, so "balanced" is the neutral
  read); the other three values map straight across with `focuses: []`. Historical weeks'
  `weeks.intakeJson.goal` (the raw JSON blob of what was actually sent to Claude at generation time)
  is left untouched - nothing in the app re-reads that field for an already-generated week, so
  rewriting historical JSON would be pure risk for zero behavioural benefit. Hit the same non-TTY
  `drizzle-kit generate` interactive-rename-resolver gotcha as MVP 1.2's column rename (see that
  entry) since dropping one column and adding two looks rename-shaped to its heuristic - same
  workaround: `drizzle-kit generate --custom` for a correctly-chained empty file, hand-write the SQL,
  hand-patch `meta/0006_snapshot.json`, verify with a plain `generate` reporting "No schema changes."
- **System prompt**: `GOAL_FRAMING`/`GOAL_LABEL` (one string per enum value) split into
  `DIRECTION_FRAMING`/`DIRECTION_LABEL` (3 entries, calorie framing only, no protein numbers) and
  `FOCUS_FRAMING`/`FOCUS_LABEL` (2 entries). `increase_protein`'s framing explicitly cites the
  research above (roughly 1.2-2.0g/kg/day, ~30-45g per adult portion) and states it applies
  "regardless of this week's calorie direction." A `nutritionFramingText(direction, focuses)` /
  `nutritionLabel(direction, focuses)` pair combines the two axes into one paragraph/label, shared by
  `buildUserPrompt` and `buildSwapMealUserPrompt` so both stay consistent. Kids track and
  family-occasion meals still always get "Balanced" with zero focuses, unchanged from before - the
  reasoning (kids eat family-occasion meals too, an adult-specific focus has no place there) didn't
  change, only the shape of what's being excluded did.
- **UI**: the 3-option direction now fits a single `TabStrip` row (the original 4-way enum's awkward
  two-stacked-2-item-row workaround, documented in the prior "Goals selector" entry, is gone - not
  because that workaround was wrong, but because the redesign incidentally dropped the option count
  back under `TabStrip`'s comfortably-tested 2-3-item range). Focuses render as ordinary multi-select
  `Chip`s, the same control already used for dish styles/proteins/avoid-repeat - no new component
  needed. Same household-default-with-per-week-override pattern in both `SettingsForm` and
  `IntakeForm` as before.
- Verified end-to-end with Playwright against the mocked dev server: selecting Build muscle + both
  focuses in Settings, saving, reloading, and confirming both the direction tab and both focus chips'
  `aria-pressed` state persist; the Intake form defaulting to the saved direction on next visit; and
  submitting a week with a non-default direction+focuses combination reaching `/api/generate`
  successfully (202, weekId returned).

## History page: delete a week, formatted per-week summary

Operator ask, three related items: delete a week from History (and the database, not just the list),
format the per-week summary, and make sure the "About this week" text is viewable from History without
having to open the full plan page. Treated as one cohesive History-page pass rather than three
unrelated tweaks, since #2 and #3 turned out to be the same underlying change.

- **Delete**: `deleteWeek(id)` (`src/lib/db/queries.ts`) does `DELETE FROM weeks WHERE id = ...` and
  nothing else - `meals`, `shopping_items`, and `feedback` all reference `weekId` with
  `onDelete: "cascade"` (already true of the schema, not a new FK), so the database removes them in
  the same statement rather than the app doing three separate deletes. `freezer_inventory
  .frozenFromWeekId` is `onDelete: "set null"`, so freezer stock a deleted week batch-froze correctly
  survives - it just loses the (informational-only) link to which week froze it. New `DELETE
  /api/weeks/[weekId]` route, idempotent (deleting an already-gone week is still a 200, same
  convention as the freezer-item removal route). Covered by
  `tests/unit/delete-week.test.ts` (PGlite + mocked generation): asserts meals/shopping/feedback are
  actually gone after delete, not just the `weeks` row, and that a second delete doesn't throw.
- **Confirm before delete**: a two-tap inline confirm (`DeleteWeekButton` - tap the trash icon, it
  becomes "Delete? / Cancel", tap "Delete?" to actually go through) rather than a native `confirm()`
  dialog, to stay in the app's own visual language, and rather than a single-tap delete like the
  freezer item's "Used it" button - a whole week's meals/shopping/feedback is a bigger loss than one
  freezer entry, worth one extra tap to guard against a mis-tap.
- **Formatted summary**: each History row now shows what was actually asked for that week - days
  needed + the nutrition goal (direction + any focuses, e.g. "Full week · Lose weight + Reduce
  cholesterol") - instead of just a bare date and generation timestamp. Reuses the same short labels
  as the Goals selector UI, kept local to `history/page.tsx` rather than a shared labels module,
  matching this codebase's existing per-file-label-map convention (see e.g. `IntakeForm`'s
  `EFFORT_OPTIONS`).
- **"About this week" viewable from History directly**: the week's notes (truncated to 2 lines) and
  avoid-repeating list now render right in the History row itself - the same underlying data
  `WeekIntakeSummary` already shows on the full plan page, just also surfaced one level up so you
  don't have to open a week to remember why it said what it said. This didn't require a new query -
  `listWeeks` already `select()`s the whole `weeks` row, `intakeJson` included.
- **Defensive read of historical `intakeJson`**: `intakeJson` is stored verbatim at generation time
  and never rewritten by later migrations (an explicit decision - see "Goals selector: two-axis
  redesign" above). A week generated before the Goals selector existed has `energyDirection`/`focuses`
  genuinely `undefined` at runtime despite `WeekIntake` typing them as required fields. The History
  page's `goalSummary()` checks for this and renders nothing for the goal segment on such rows rather
  than crashing or printing "undefined" - same "don't trust the type for historical JSON" caution
  applied when `lowerCholesterol` was dropped and when the original 4-way `Goal` enum replaced it.

## Kids weekly batch-cook-to-freezer

Operator ask (alongside a design discussion about a sign-up journey, which is being tackled
separately - see the "Deliberately not built" entry's follow-up when that lands): *"for children's
meal it's always good to do a batch cook each week... to add to the freezer for future weeks."*

- **Strengthened, not new**: the freezer inventory backlog feature already built all the machinery
  this needs (`batchCook.freezerPortions`, the `freezer_inventory` table, `usesFreezerItem`) and the
  system prompt already said kids meals should "skew toward batch-cook-and-freeze" - but only as an
  encouragement, not a requirement, so real generations could go a whole week without one. This just
  turns that encouragement into a standing rule: **whenever the kids track is active a given week (at
  least one kids meal-time selected), at least one kids meal must freeze portions.**
- **Framed as a rotating stash, not a one-off**: the prompt explicitly says to do this "most weeks the
  kids track runs, not just when the freezer happens to be empty" and to freeze a *different* item if
  the freezer's already stocked, rather than treating the freezer being non-empty as a reason to skip
  freezing that week - the point is variety building up over time (this week's ragu, next week's
  meatballs), not a single default portion sitting in the freezer forever.
- **No schema or freezer-consumption-logic change** - this is purely a system-prompt strengthening.
  `mock.ts`'s existing kids-dinner-on-Monday freezer example (`freezerPortions: 4`, see its comment)
  already modelled this exact shape before this change, so no mock update was needed either.
- **Verified via content-assertion tests only** (`tests/unit/system-prompt-method-steps.test.ts`),
  same limitation as every other prompt-tuning item in this project: this sandbox has no live
  `ANTHROPIC_API_KEY`, so whether Claude actually follows the strengthened instruction in practice
  can only be confirmed by the operator watching a few real weeks generate, not by an automated test
  here.

## Sign-up journey

Operator ask, to support road-testing with real households: *"perhaps we should add a sign up journey
- create account -> set household name, number of kids, supermarket and budget -> welcome page."*
Then, mid-design-discussion: *"rather than request an email address can we generate a user name for
them - family1, family2 etc?"*

This **supersedes the "Multi-household / multi-user support" half** of the earlier "Deliberately not
built" entry above - that entry was correct at the time (a fundamental auth/data-model pivot isn't
something to guess at autonomously), and the operator has now made that call explicitly. The push-
notifications half of that entry is untouched, still deliberately unbuilt.

**Scope decided with the operator before writing any code** (via `AskUserQuestion`, two open
questions): password reset is skipped for v1 (no email-sending provider to build it on - same category
as the deferred push-notifications infrastructure decision; the operator resets a tester's password
manually if needed); sign-up stays gated behind an invite code rather than being fully open, reusing
the existing `APP_PASSWORD` rather than a new env var, since every generated week costs real Claude API
money and this bounds that cost to people actually invited. **One account per household** (no shared/
multi-member households) - matches the flow the operator described, and keeps the whole pivot much
smaller: account and household are 1:1, so there's no separate `users` table, no membership/invite-
another-person model, just two new columns on `households`.

- **`households.username`** (unique, auto-generated `family1`/`family2`/... - see
  `generateUniqueUsername` in `src/lib/db/queries.ts`, read-then-write, not atomic, accepted at
  road-test scale same reasoning as the freezer-consumption race) and **`households.passwordHash`**
  (nullable - see below). No email column at all, per the operator's explicit ask: nothing to verify
  ownership of, nothing to type, and it sidesteps needing any email-sending infrastructure, reinforcing
  the "skip password reset" call above rather than just deferring it.
- **Migration `0007`** backfills the pre-existing single household (`v1 is single-household` was true
  right up until this migration) with `username = 'family1'` and leaves `passwordHash` null - it isn't
  hashed at migration time since there's no way to run real password hashing from plain migration SQL
  without depending on a Postgres extension that may not be enabled everywhere (pgcrypto). Instead:
  **transparent upgrade on first login** (`resolveLogin` in `src/lib/auth/login.ts`) - a household with
  `passwordHash: null` is checked against the shared `APP_PASSWORD` (now doubling as the invite code)
  instead; if it matches, that password is hashed and stored as the real `passwordHash` right then, so
  the row becomes an ordinary account with zero operator action needed. The pre-existing production
  household keeps working the moment this deploys: log in as `family1` with the same password it
  already had.
- **Password hashing**: PBKDF2-HMAC-SHA256 via Web Crypto (`src/lib/auth/password.ts`,
  100,000 iterations, random 16-byte salt per password, `salt.hash` both base64url), not bcrypt/scrypt
  - no native dependency needed, matching `session.ts`'s existing Web-Crypto-only approach (kept
  edge-safe even though password hashing itself only ever runs from a Node API route, for
  consistency).
- **Session token upgraded to carry identity**: was `expiresAt.signature` (a bare "someone's logged
  in" flag - `verifySessionToken` returned a boolean); now `householdId.expiresAt.signature`
  (`verifySessionToken` returns the `householdId` or `null`). `createSessionToken` now requires a
  `householdId` argument. Still HMAC-signed via Web Crypto, still verifiable from both the Edge
  middleware (`proxy.ts`) and Node API routes/pages - the edge-compatibility constraint that shaped
  the original single-password design didn't change, only what the token carries.
- **`getSessionHouseholdId()`** (new, `session.ts`) is the one Node-only export in an otherwise
  Edge-safe file - it dynamically `import()`s `next/headers`' `cookies()` (Node/RSC-only, not
  available on the Edge runtime) rather than a static top-level import, so `proxy.ts` (which only
  needs the boolean-ish `verifySessionToken` check, not this helper) doesn't pull `next/headers` into
  its Edge bundle just by importing the same file.
- **`getCurrentHousehold()`** (new, `queries.ts`) replaces `getOrCreateHousehold()` at all 8 places a
  page/API route needs "the household for this request" (`/`, `/history`, `/plan/new`, `/settings`,
  `/api/household`, `/api/generate`, `/api/weeks/[weekId]/retry`, plus `/onboarding` and `/welcome`
  which are new). Resolves via the session instead of "grab the only row" - throws rather than
  returning null on a missing/invalid session, since `proxy.ts` already redirects unauthenticated
  requests before any page/route body runs, so reaching here with no valid session means something
  is genuinely wrong, not a normal case to handle gracefully. The blast radius stayed small because
  every *other* query already took an explicit `householdId` parameter - the "single household"
  assumption really did live in exactly one place, as the schema's original comment predicted
  ("the natural extension point for multi-household support"). `swapMealInPlace`
  (`generateAndPersist.ts`) resolves the household from `week.householdId` directly instead (via a
  new `getHouseholdById`) rather than the session, since it isn't itself request-scoped.
- **`getOrCreateHousehold()` kept, not removed** - purely a test/dev convenience now (7 integration
  test files call it to get "just give me a household" with no login flow to go through), unreachable
  from any real user-facing flow post-sign-up, so it causes no harm left in place. A household it
  creates looks exactly like a migrated legacy row (`passwordHash: null`), which is a well-defined
  state this design already handles.
- **Onboarding reuses the existing `/api/household` PATCH route** rather than a new endpoint -
  `OnboardingForm` is a stripped-down `SettingsForm`-shaped component (full form state seeded from the
  freshly-created household's schema defaults, but only 4 fields are actually rendered: name, kids
  count, supermarket, budget) that submits the complete PATCH body the route already expects, carrying
  every other field through unchanged. No server-side change needed for onboarding at all.
- **`NavBar` hidden on `/login`, `/signup`, `/onboarding`, `/welcome`** - showing nav links, and
  especially a "Log out" button, before there's anything to log out of or before setup is even
  finished, would be confusing.
- **e2e smoke test rewritten** to sign up (invite code + password) rather than log in with a bare
  password, since a fresh test DB has no household/account to log into anymore - this also gives the
  whole sign-up → onboarding → welcome flow real Playwright coverage, not just the parts after it.
  Asserts the welcome page shows a username matching `/^family\d+$/` rather than hardcoding
  `"family1"`, since the exact number depends on how many households already exist in whichever DB
  it runs against.
- **Manually verified against the mocked dev server** (Playwright, not part of the automated suite):
  the full signup → onboarding → welcome → Settings flow end-to-end with mobile-viewport (375px)
  screenshots; and separately, the legacy-household transparent-upgrade path specifically - seeded a
  `passwordHash: null` household, confirmed a wrong password still fails, confirmed the correct shared
  password succeeds and upgrades the row, and confirmed a second login with that same password
  succeeds via the normal hashed-password path (not the legacy fallback) afterward.

## Backlog item: pantry-staple-aware Claude-in-Chrome shopping handoff - not built, reviewed first

Prompted by the operator initially asking about a "plugin which books Sainsbury's baskets." That
reopened the "Explicitly not planned" fully-unattended-checkout item in `REQUIREMENTS.md`, which says
revisiting it needs an explicit conversation. Had that conversation directly (web search confirmed
Sainsbury's still has no public consumer basket/ordering API, only unofficial third-party scrapers) -
the conclusion was that a "plugin" doesn't change the risk calculus versus what's already flagged:
automating a retailer's site without their authorization is the same concern regardless of whether
Claude or custom code drives it. The operator then reframed toward what they actually wanted: not new
automation, but a **better-informed version of the existing supervised handoff** from the "MVP 2 scope
correction" entry above (paste a list into Claude in Chrome, a human watches the whole session, Claude
stops before payment on its own). That's a materially different, much smaller risk - no new
automation surface, no stored credentials, no unattended runs - so it's being treated as an ordinary
feature request, reviewed and specified with the operator (like the original Goals selector review)
rather than something needing further deliberation.

**Root cause, reframed**: a real test run had Claude in Chrome buy a whole jar of honey for a recipe
needing 1 tsp. Buying a whole jar isn't itself wrong - that's the only purchasable unit, you can't buy
a teaspoon of honey at retail. The actual gap: the shopping list has no concept of "the household
probably already has some of this," so a pantry staple gets treated identically to a real weekly-shop
item every time, with no signal anywhere that it might be worth skipping.

**Three design decisions made with the operator** (`AskUserQuestion`, two rounds, before writing the
full spec into `REQUIREMENTS.md`):
1. **What "Claude Plugin" concretely is**: confirmed as the existing Claude-in-Chrome copy-paste
   handoff (per the "MVP 2 scope correction" entry) - not a new API/manifest-level integration. This
   spec is entirely about the text the app generates for that paste, and a new box to paste Claude's
   response back into - no new integration surface with Anthropic or Sainsbury's at all.
2. **Where the "check with me first" confirmation happens**: inside the Claude browsing session
   itself, not pre-filtered by the app into a separate "you deal with these" list. A human is present
   for the whole session anyway (per the existing supervised-flow design), so it's simpler for Claude
   to just ask inline than for the app to split the list and create two separate places to review
   items.
3. **What "run a tally" means**: an item count (bought vs. skipped), not a cost total. No price data
   exists anywhere in the app today (the `budget` field is a free-text generation-steering hint, not a
   real running total), and getting real prices back would need Claude Plugin to report them - a
   bigger ask than was actually requested.

**A fourth decision, made while drafting the spec itself** (not asked as a separate question, since
there was a clearly better answer once the shape was concrete): the paste-back reconciliation needs
Claude's summary to map back onto specific shopping-list rows reliably. Free-text fuzzy-matching
("chicken breast" against a stored "chicken breast fillets") is exactly the kind of silent-failure
risk this project avoids elsewhere (e.g. the ingredient-canonical fuzzy-matcher already has known
edge cases) - so the export instead tags each line with a short stable reference number Claude is
instructed to echo back verbatim (`BOUGHT [3]` / `SKIPPED [7]`), turning the paste-back parse into
exact number-matching instead. Also decided the new `pantryStaple` flag should be singular rather than
split into a second `smallQuantity` flag - the two would overlap in practice (you rarely need "a
small quantity" of something that isn't also a staple) and a single flag is simpler to prompt Claude
for honestly and simpler for the export/UI to render.

**Not built yet** - this entry and the corresponding `REQUIREMENTS.md` backlog item are the
"reviewed and specified" step, same as the original Goals selector review before it was built.

## Pantry-staple-aware Claude-in-Chrome shopping handoff: prompt-generation build

Operator: *"Can you start on the prompt work now? It should work for any historical list as I assume
it can be generated on the fly using the existing metadata."* Built parts 1-2 of the three-part spec
above (pantry-staple detection + the richer export); part 3 (paste-back reconciliation) is still not
built. Two design revisions from the original spec came out of that one instruction and a piece of
real feedback that arrived mid-build:

- **`pantryStaple` moved from a generation-time Claude field to an export-time heuristic.** The
  original spec (previous entry) had Claude set `Ingredient.pantryStaple: boolean` at generation time,
  same pattern as the nutrition flags. The operator's "any historical list" requirement rules that out
  outright: a field Claude sets when generating a week can only ever exist on weeks generated *after*
  the feature ships - it can't retroactively apply to a week from three months ago, and every other
  historical-JSON gotcha in this project (the Goals migration, the History page's defensive read) is a
  reminder of exactly that limitation. Moved to `isPantryStaple()` in the new
  `src/lib/shopping/pantryStaples.ts` instead - a static, curated keyword list matched against
  `shoppingItems.productName` at export time (word-boundary regex, not a bare substring check, to
  avoid e.g. "sugar" false-positiving inside "sugar snap peas" or "oil" inside "boiled"). This needs no
  schema change and works identically on every stored week regardless of when it was generated, which
  is what "generated on the fly using the existing metadata" actually meant. Favours precision over
  recall throughout (a missed staple is a minor inconvenience; a wrongly-flagged real ingredient risks
  it getting skipped in the basket) - documented in the file itself as an accepted approximation, same
  category as the ingredient-canonical fuzzy-matcher's known edge cases.

- **Real feedback from a live 78-item/52-minute Claude-in-Chrome session, relayed by the operator,
  reshaped the export's shape and content.** Two findings mattered:
  - Most of the session's time wasn't clicking - it was verification overhead: Sainsbury's product
    cards don't reliably register a click first time, so the session was screenshotting and checking
    the cart total after nearly every single add, and incrementing multi-unit items (7 lemons, 7 red
    peppers) one click at a time rather than batching.
  - Bouncing between unrelated categories in alphabetical order cost real time in page loads/
    re-orientation; grouping searches by category up front would have helped.
  Both went straight into `buildChromeHandoffPrompt`. The second one **reverses the "Shopping-list
  plain-text export: flat, one line per item, no aisle headers" decision above, but for a different
  reason than the one that decision was originally about** - that entry's reasoning ("an agent has no
  use for which physical aisle it's in") is still true and still applies to `shoppingListAsPlainText`,
  which is untouched. What changed is a second, independent reason to group by category that has
  nothing to do with physical aisles: reducing how often the agent has to reorient between unrelated
  searches. The same `aisle` field happens to serve both purposes, which is why it looks like the same
  decision reversing itself when it's actually two different questions that happened to share input
  data. The first finding became explicit verification-strategy guidance embedded in the prompt itself
  (batch single-quantity adds with a spot-check at the end of the batch; single-click-and-verify for
  anything needing more than one unit; a full-basket check only every 15-20 items or when something
  looks off; skip zoom-in screenshots unless a result is genuinely ambiguous) - trading some of the
  original session's caution for speed, on the basis that the household already reviews the whole
  basket before paying (Claude already stops before payment on its own, an existing, unchanged
  behaviour), so a missed item from lighter verification is caught there, cheaply, rather than needing
  to be caught live mid-session.
- **Numbering/grouping is computed once, deterministically** (`groupedByAisle` in `exportText.ts`:
  group by `aisle` in first-seen order, alphabetical by name within each group) so a future paste-back
  parser (part 3, still unbuilt) can reconstruct the same `[N] → item` mapping from the same stored
  items independently, without needing the original prompt text kept around anywhere.
- The existing shopping-list page's single button ("Copy as plain text" → now "Copy shopping prompt")
  was updated in place to call the new function rather than adding a second button - its tip text
  already described the Claude-in-Chrome handoff specifically (see the MVP 2 scope-correction entry
  above), so upgrading its output in place is the same feature getting better, not a new one.
- **Not built in this pass**: part 3, the paste-back reconciliation box that would tick off
  `shoppingItems.checked` from Claude's `BOUGHT [N]`/`SKIPPED [N]` summary and show a tally. The
  export already emits the exact format that box will need to parse, but the box itself, its parser,
  and the tally UI don't exist yet.

## Paste-back reconciliation: category summary + spend

Operator ask, a second requirements pass on part 3 specifically (still not built - this is another
spec revision, same "review before build" pattern as the rest of this feature): *"we should give a
shopping summary by category e.g. protein, veg, staples, the total spend for each category and then
the items under each for reconciliation."* This reverses the earlier explicit "just an item count, not
a cost total... wasn't asked for" call from the original three-part spec - it's being asked for now, so
that call is being revisited rather than defended.

**Two decisions made with the operator** (`AskUserQuestion`) before writing the revised spec:

1. **Category source**: a new small fixed taxonomy purpose-built for this summary, not a reuse of the
   `aisle` field. `aisle` is free text Claude generates at generation time (not a controlled
   vocabulary - no fixed enum anywhere, unlike e.g. `PROTEIN_TYPES`), so its exact wording/granularity
   varies week to week ("Meat & fish" vs. "Fresh meat" vs. "Poultry" are all plausible for the same
   underlying category), and it doesn't match the "protein"/"veg" language the operator actually wants
   in a reconciliation summary anyway. Chose a fixed 8-category list instead (Protein, Veg & Fruit,
   Dairy, Bakery, Frozen, Store Cupboard, Staples, Other), mapped via a keyword heuristic on `aisle`
   text - same "static heuristic, favour reasonable-not-perfect, documented as an accepted
   approximation" pattern already established by `pantryStaples.ts`. `pantryStaple` items take
   priority into **Staples** regardless of what their `aisle` says (a jar of honey being nominally
   "Store cupboard" aisle doesn't make it useful to lump in with real store-cupboard weekly-shop items
   like tinned tomatoes or pasta) - which is also why **Store Cupboard** exists as a category distinct
   from **Staples**: the former is real dry-goods shopping, the latter is specifically the
   probably-already-have-some flag from the rest of this feature.
2. **Price data source**: Claude reports a price per item in its paste-back summary
   (`BOUGHT [N] £X.XX`, extending the existing format) rather than holding off on spend totals until a
   real pricing data source exists. Same "honest, best-effort, not verified" framing already used for
   the app's other Claude-self-reported fields (the nutrition flags, `cholesterolLowering`/
   `lowSaturatedFat`) - Claude is reading a price off whatever it saw on the product page while
   shopping, not calling a priced API, so it's an honest report, not a guaranteed-accurate one.

**Left open rather than decided**: whether the reported price gets persisted (`shoppingItems
.pricePaid`, a real new schema column, same durability pattern as `checked`) or only exists for that
one reconciliation session's UI state and is discarded afterward. This is a genuine build-time decision
- worth resolving when the paste-back box actually gets built, not now, since nothing about the rest of
the spec depends on which way it goes.

**Still not built** - this and the original three-part entry are both spec-only. Nothing about
`categories.ts`, the extended prompt format, or the paste-back UI exists in code yet.

## Paste-back reconciliation: build

Operator: *"build the way to receive it next before we deploy."* Built exactly what the two
requirements passes above specified - `src/lib/shopping/categories.ts` (the taxonomy),
`src/lib/shopping/parseSummary.ts` (parses `BOUGHT [N] £X.XX` / `SKIPPED [N] - reason`),
`src/lib/shopping/reconcile.ts` (combines both plus the export's `groupedByAisle` ordering into a
category-grouped, spend-totalled result), and a new "Reconcile after shopping" collapsible section in
`ShoppingList.tsx`. `buildChromeHandoffPrompt`'s requested summary format was updated in place to
`BOUGHT [N] £X.XX`.

- **Resolved the one open detail from the requirements pass**: the reconciliation is session-only, not
  persisted. No `shoppingItems.pricePaid` column was added. Reasoning: `checked` - the one piece of
  state actually worth keeping across a reload/device-switch - already persists via the existing PATCH
  endpoint, unchanged; the price and category breakdown are cheap to recompute from a re-pasted summary
  and this is a one-time "review right after shopping" action, not something a household would expect
  to come back and look at days later. Avoids a schema/migration change immediately before a deploy for
  a piece of state that doesn't need durability.
- **`reconcile()` extracted into its own module** rather than living inside `ShoppingList.tsx`, same
  "logic in a testable pure function, thin UI wrapper" pattern used elsewhere in this project (e.g.
  `swapMealInPlace` vs. its route handler) - lets the whole numbering → parsing → categorizing →
  totalling pipeline be tested directly (`tests/unit/shopping-reconcile.test.ts`) without going through
  React component rendering.
- **An item the pasted summary never mentions comes back as `"unreported"`**, a third state alongside
  bought/skipped, rendered with its own marker (`?`) rather than silently defaulting either way - Claude
  stopping early, the household pasting a partial summary, or a dropped line all look the same from the
  parser's side, and guessing which of bought/skipped it "probably" was would be worse than just saying
  "check this one yourself."
- **`groupedByAisle` exported from `exportText.ts`** (was module-private) specifically so `reconcile.ts`
  can reproduce the exact same `[N]` ordering independently, as long as it's called with the same items
  array the prompt was generated from - the numbering was never stored anywhere, it's derived
  identically both times from the same deterministic function.
- **A real category-mapping gap caught by manually running the whole flow end to end** (signup →
  onboarding → generate a week → copy the shopping prompt → paste a fabricated summary back →
  check the rendered category breakdown), not by the unit tests, which used hand-picked aisle strings
  that happened to already match the keyword list: this app's actual generated aisle names are "Fresh
  produce" and "Chilled & dairy" (see `src/lib/claude/mock.ts`), not the more generic "Fruit &
  veg"/"Dairy" `categorizeItem`'s keyword list was originally written against. "mixed vegetables"
  (aisle: "Fresh produce") landed in **Other** instead of **Veg & Fruit** until "produce" was added as
  a keyword - fixed, and a regression test added
  (`tests/unit/shopping-categories.test.ts`'s "handles the actual aisle strings this app generates").
  Worth remembering for any future aisle-text heuristic in this app: check it against `mock.ts`'s real
  strings, not just plausible-sounding examples.
- Also verified during that same manual pass: a "Copy shopping prompt" → (fabricated) paste-back →
  category summary round trip correctly ticks off the matching checkboxes in the on-screen list above
  the reconciliation section (5 of 6 items checked matching 5 `BOUGHT` + 1 `SKIPPED` lines pasted in).

## Delete this meal

Operator: *"lets add the option to delete a meal from the recipies section (next to the swap it
option) When this is dome is the shopping list updatted."* Added a "Delete" button next to "Swap this
meal" on `MealCard.tsx` (both now sit in a shared flex row, `flex-1` each, rather than stacked) - same
two-tap inline-confirm pattern as `DeleteWeekButton`, not a native `confirm()` dialog.

- **Same batch-cook restriction as "Swap this meal", for the same reason**: a batch-cook source's
  leftovers (`leftoverForJson`) are described only on *that* meal's own row - other days' rows don't
  reference it back. Deleting a batch-cook source would silently strand whatever those other days say
  about "using this batch," so `deleteMealInPlace` rejects it outright (`DeleteNotAllowedError`, mapped
  to 409, mirroring `SwapNotAllowedError`) rather than trying to keep the rest of the week in sync. The
  button isn't rendered at all for a batch-cook meal (`MealCard.tsx` already skips both buttons together)
  since the server would 409 either way.
- **Shopping-list re-aggregation logic shared with swap**: `swapMealInPlace`'s trailing
  "re-aggregate the whole week's shopping list" block was extracted into a private `reaggregateShoppingList`
  helper in `generateAndPersist.ts`, now called by both `swapMealInPlace` and the new
  `deleteMealInPlace` - same "re-derive the week's shopping list from whatever meals currently exist"
  approach, just triggered by a removal instead of a content change.
- **`feedback` rows for the deleted meal need no manual cleanup** - `feedback.mealId` already has
  `onDelete: "cascade"`, so they're removed automatically by the FK when the meal row goes.
- **Left as an accepted limitation, not implemented**: a deleted meal with `usesFreezerItem` set does
  *not* restore the freezer-inventory portions it consumed back onto `freezer_inventory`. Same
  "documented approximation over exact-but-fragile bookkeeping" call already made for freezer
  consumption's read-then-write race condition elsewhere in this file - the household discovering a
  meal was wrong *after* generation and deleting it, having also specifically used a freezer batch, is
  a narrow enough case that it isn't worth a reconciling write path for now. Worth revisiting if it
  turns out to matter in practice; the freezer count would just need a manual correction from
  `/settings` (or the database) in the meantime.
- New integration test file `tests/unit/delete-meal.test.ts` (PGlite, mocked generation, same shape as
  `swap-meal.test.ts`) - covers rejecting a batch-cook delete, and a real non-batch delete reducing the
  aggregated "chicken breast" quantity and dropping the deleted meal from that item's `usedIn`, rather
  than asserting an ingredient disappears entirely - the mock plan's non-batch adult dinners repeat the
  same ingredients as each other and as the batch-cook meal, so nothing in this particular test data
  is actually unique to one meal instance.

## Calendar-based days selection

Operator: *"for selecting the days really we should have a calendar view, the user should be able to
say what day and time the order is coming and then the number of days the order will cover - make sense?"*
Confirmed the idea, then resolved two open questions with the operator (`AskUserQuestion`) before
building:

1. **Delivery time is display-only** - it's shown as a reminder ("Order arrives 18:30" on the plan
   page header) but never changes which meal slots get planned. The alternative (an evening delivery
   meaning day-1 dinner can't use it) was rejected as real logic for a narrow case - what would cover
   day-1 dinner instead isn't obvious, and isn't worth guessing at without it actually being asked for.
2. **Day count is a free 1-14 number**, not a new set of presets - a stepper (`DayCountStepper.tsx`)
   replacing the old 3-option tab strip. 14 is a generous cap; beyond that a single shop realistically
   isn't still covering fresh ingredients.

**What changed under the hood**: `weekIntakeSchema`'s `daysMode` (`"full_week"` / `"weekdays_only"` /
`"mon_to_sat"`) is replaced by a plain `numDays: number` (1-14), plus a new optional `deliveryTime:
string`. `weekStartDate` is unchanged as a field, but its *meaning* shifts - it's no longer assumed to
be a Monday, it's whatever day the shop actually lands on. `daysForIntake()` (`src/lib/intake.ts`) just
expands `numDays` consecutive days from that date now, instead of picking a fixed 5/6/7-day span.

- **The family-occasion (Saturday breakfast/evening, Sunday lunch) and kids-track (Mon-Sat) logic
  needed no change at all** to support an arbitrary start day or a >7-day span, including one that
  spans two Saturdays/Sundays - both `mock.ts` and the system prompt already key family occasions off
  `dayOfWeek` per day in a loop, not off position within a fixed week, and the system prompt's existing
  "only apply an occasion if that day is actually within the days needed" guard already generalizes to
  "zero, one, or two" Saturdays without further work. Verified this holds for real (not just by
  inspection) with a manual run: a 10-day span starting Saturday 1 Aug correctly gave both Saturdays a
  family occasion (so no separate adult-track meal that day) while both Sundays still got an ordinary
  adult dinner (family only covers Sunday *lunch*, not dinner) - see the "Manually verified" note below.
  The system prompt's wording was still updated (`buildUserPrompt`'s parenthetical) to describe this
  case explicitly for Claude, since the old wording's example ("if only weekdays are needed") no longer
  makes sense without the removed presets.
- **New `CalendarDatePicker.tsx`** - a month-grid date picker built from scratch rather than the native
  `<input type="date">`, since the operator specifically asked for "a calendar view" and the native
  picker's chrome is rendered by the OS/browser, not this app, so it can't be made to match the design
  tokens the rest of the app now uses. Deliberately does **not** restrict past dates by default (no
  `minDate` passed from the intake form) - the old plain date input never restricted this either (e.g.
  logging a week retroactively worked fine), and this change wasn't asked to narrow that.
- **A real timezone bug caught before it shipped, not after**: the obvious implementation
  (`date.toISOString().slice(0, 10)`) converts to UTC first, which silently shifts a locally-constructed
  midnight `Date` back a day for any viewer west of GMT - tapping "5 March" would store "4 March". This
  app already has that exact latent pattern elsewhere (`todayISO()`, `daysForIntake`), but those are
  low-stakes (a default suggestion the user can freely override, or a same-timezone server-side
  calculation) - a calendar grid where every single tap runs through the formatter is a much larger
  surface for it to actually bite a real user. Wrote a local-safe formatter
  (`CalendarDatePicker.tsx`'s `toISO`) instead of reusing the existing pattern here, rather than
  "fixing" the rest of the app's date handling, which wasn't asked for and isn't obviously broken in its
  current low-stakes uses.
- **New `DayCountStepper.tsx`** - a −/+ stepper (not a bare `<input type="number">`) so both buttons
  hit the 44px tap-target minimum this app's mobile-UX pass established (see the MVP 1.3 pressure-test
  entry), same reasoning as `TabStrip`'s `min-h-11` segments.
- **`upcomingMonday()` removed, replaced by `todayISO()`** - defaulting the calendar to "the coming
  Monday" no longer makes sense once the date represents an arbitrary delivery day, not a fixed week
  start. Defaults to today; the household taps forward on the calendar if the real delivery date is
  later.
- **Historical weeks read their stored `daysMode` as before, unchanged** - `intakeJson` is stored
  verbatim and never rewritten by later migrations (the standing rule already established for
  `energyDirection`/`focuses`), so a week generated before this change genuinely has `daysMode` (not
  `numDays`) in its JSON at runtime despite `WeekIntake`'s type no longer declaring that field. The
  History page's `daysLabel()` explicitly guards for both shapes rather than assuming the new one - see
  the comment above `LEGACY_DAYS_MODE_LABEL` in `src/app/history/page.tsx`.
- **Manually verified** (mocked generation, real PGlite DB, real browser via Playwright, since the e2e
  smoke test only exercises the intake form's *defaults* and wouldn't catch a regression in the new
  calendar/stepper UI itself): signed up, opened the calendar (rendered the correct month with today
  highlighted), navigated a month forward and back, incremented the day stepper from 7 to 10, set a
  delivery time, picked Saturday 1 Aug 2026 on the grid, and submitted. The generated plan's header
  correctly read "Week of 2026-08-01 · Order arrives 18:30", and the Parents tab correctly showed 8
  adult-dinner rows (10 days minus the two Saturdays, both absorbed into the family occasion) with both
  Sundays still present (family only covers Sunday lunch, not dinner) - confirming the >7-day,
  multiple-weekend case actually works end to end, not just by code inspection.
