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
