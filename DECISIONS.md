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

## Blocking items surfaced to the operator (not build-blocking, deploy-blocking)

No `ANTHROPIC_API_KEY`, `UNSPLASH_ACCESS_KEY`, or production database credentials are present in this environment — expected, since §11 says these are provided at deploy time, not during the build. The app is built to run fully with local fallbacks (embedded PGlite database, illustrated placeholder images) so the whole flow is testable without any of those secrets; real keys/DB are required only for production deploy and for hitting the live Claude/Unsplash APIs. Documented precisely in `DEPLOY.md`.
