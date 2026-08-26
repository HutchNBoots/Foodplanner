# Current status (read this first in a new chat)

Start here for "where are we" - the other docs are: `PROJECT.md` (original spec), `REQUIREMENTS.md`
(MVP-by-MVP breakdown), `DECISIONS.md` (full decision-by-decision log with reasoning), `EVALS.md`
(method-step eval rubric/results), `README.md` (local dev), `DEPLOY.md` (deploy steps). This file is
just the up-to-date summary of where things actually stand.

## Backlog execution pass - autonomous, per explicit operator instruction

After MVP 1.3, its follow-ups, and a 4-persona (UX/CX/end-user/nutritionist) multi-agent app review
all merged (PR #7), the operator asked for a nutritionist-reviewed "Goals" backlog item to be written
up (not built), then said: *"execute all the backlog across all topics - update the decision log etc
but I don't need to be involved."* This section covers everything built under that instruction, all
on branch `claude/visual-identity-mobile-ux-t3dfeh` (reset from latest `main`), currently pushed but
**not yet merged - no PR opened for this branch yet**. Full reasoning for every item below is in
`DECISIONS.md`'s "Backlog execution" section; this is the short version. `tsc`, `eslint`, `vitest`
(104 tests), and `playwright` are all green as of the last commit on this branch.

Scope was deliberately read as `REQUIREMENTS.md`'s 6-item Backlog section specifically - not the
separate, never-formalized findings from the earlier multi-agent review (those were reported to the
operator in chat, not logged as backlog items, so they're out of scope for "execute the backlog").

- ✅ **Generation prompt-tuning pass for kids meals** - within-week variety guidance and a
  clarification that kids meals need the same instructive method-step bar as every other track.
  Prompt *quality* can only be verified by content-assertion tests here (no live `ANTHROPIC_API_KEY`
  in this sandbox), not a live-generation eval.
- ✅ **"Swap this meal"** - regenerate a single meal in place (`POST /api/meals/[mealId]/swap`),
  re-aggregating the week's shopping list afterward. Rejects swapping a batch-cook meal other days
  rely on as leftovers (`SwapNotAllowedError`, 409, button hidden client-side) rather than silently
  stranding those references.
- ✅ **Freezer inventory tracking** - a `freezer_inventory` table stocked whenever a meal batch-freezes
  portions, listed in the generation prompt so Claude can choose to reheat instead of cook/buy fresh
  (`meal.usesFreezerItem`), a read-only Settings list with manual "Used it" removal, and a "From the
  freezer" badge on the recipe card.
- ✅ **Household/per-week "Goals" selector** - two independent axes: nutrition **direction** (Lose
  weight / Balanced / Build muscle, single-select `TabStrip`) and nutrition **focus** (Increase
  protein / Reduce cholesterol, multi-select `Chip`s, stackable on any direction). Replaces both the
  old hardcoded adult-deficit default and the separate `lowerCholesterol` toggle. Household Settings
  default with a fully overridable per-week choice, one disclaimer line. Verified end-to-end with
  Playwright against the mocked dev server (Settings save → Intake form default → generation submit),
  plus mobile (375px) screenshots of both selectors.
- ⬜ **Multi-household / multi-user support** - deliberately left unbuilt. Every other item above is
  additive; this one requires picking an auth model and a data-model shape before any feature code,
  which is a product/architecture decision for the operator to make explicitly, not one to guess at
  autonomously.
- ⬜ **Push notifications / reminders** - deliberately left unbuilt. Requires standing up delivery
  infrastructure the app has none of today (web push, transactional email, or SMS), each with its own
  ongoing cost and operational surface - an operator infrastructure choice, not a default to pick
  unilaterally.

All of the above (except the two deliberately-unbuilt items) merged to `main` via PR #8.

**Goals selector correction** (separate follow-up, after PR #8 merged): the operator flagged that
protein is the mechanism behind BOTH losing weight and building muscle, not a property of one option -
"can you research on web please and brainstorm a better goals section." Backed by web research (2025
Dietary Guidelines' 1.2-1.6g/kg protein target, ACSM/AND sports-nutrition consensus, satiety/muscle-
preservation evidence during a deficit), the Goals selector was rebuilt into the two-axis shape
described above - direction and focus as independent choices rather than one 4-way enum. See
`DECISIONS.md`'s "Goals selector: two-axis redesign" entry for the full research citations and
reasoning, and for why a straight "just add a 5th option" fix was rejected (it was presented to the
operator as an explicit alternative and declined).

## MVP 1.3 - Visual identity & mobile UX pass, shipped and merged, plus a follow-up

Design-refresh milestone (`REQUIREMENTS.md`'s "MVP 1.3"), built on the session-runner-assigned
branch `claude/visual-identity-mobile-ux-t3dfeh` from latest `main` (after MVP 2.1 merged). Not a
features milestone - a real user flagged the live app as reading like a generic unstyled
Tailwind/shadcn template (one flat green accent doing every job, every control the same rounded
pill, no display typeface, plain number nutrition rows). Scope is strictly visual/IA: no change to
the MVP1-2.1 data model, generation logic, or API routes. `tsc`, `eslint`, `vitest` (90 tests), and
`playwright` all green, plus a manual mobile-viewport (375px) browser pass through login, home, the
full intake form (collapsed and expanded), all three recipe tracks, the shopping list, and Settings.
Full reasoning, all three subagent findings, and the self-critique against the frontend-design
skill's cliché checklist are in `DECISIONS.md`'s "MVP 1.3" entry - this is the short version.

- **A six-color token system with named jobs** replaces the single flat green accent: Paper/Ink
  (background/structural text), Parents Petrol / Kids Marigold / Family Bramble (one color per
  eater track), and Status Sage (a completion/on-target state, not a fourth track). No color means
  more than one thing anymore - the primary-action button, active filters, and nav state are now
  visually distinct.
- **Three typefaces with restrained roles**: Bricolage Grotesque (display - headers/section titles
  only), Inter (kept, body/UI), IBM Plex Mono (every macro/nutrition figure, shopping quantity, and
  date - tabular numerals via monospace).
- **The signature element**: an "index-tab" notch (a recipe-box divider tab) fused to the top-left
  corner of every track-scoped card/cluster, filled in that track's color and carrying its label -
  overrides the originally-sketched "colored edge/spine" idea (see `DECISIONS.md` for why).
- **Segmented controls redesigned per-purpose**: a joined tab-strip for single-select choices (days
  needed, family occasions, effort, the Recipes/Shopping-list switch, the Parents/Kids/Family
  tabs), checkbox-style chips for multi-select choices (dish styles, proteins, avoid-repeat,
  meal-times-needed) - the two now look visibly different instead of both being the same pill.
- **Nutrition redesigned to scan faster on a phone**: `WeekNutritionSummary` is closed by default
  (was `open`, pushing content down on every visit) with a small relative bar per day; `MealCard`'s
  macros grid gives kcal/protein visual priority over carbs/fat/fibre instead of five equal-weight
  numbers.
- **Progressive disclosure added to the intake form**: family-occasion pickers, Parents/Kids
  meal-times, and the protein picker all collapse to a one-line editable summary by default (they
  have real household defaults already wired in) - dish styles and avoid-repeat stay always
  expanded (no preset, novel input respectively). Budget/effort/notes stay a single closed
  accordion, per the original brief.
- **44px minimum tap targets and visible `focus-visible` rings** on every rebuilt control
  (`TabStrip`, `Chip`, `WeekTabs`, `MealTrackTabs`, nav links) - the old pill sizing
  (`px-3.5 py-1.5`, ~30-33px) and missing focus states were both flagged by the UX research pass.
- **Bundled placeholder illustration SVGs recolored** (`public/images/categories/*.svg`) - their
  old saturated per-category gradients (bright yellow/orange/red) clashed hard against the new
  muted paper/ink palette once everything else changed; now a consistent muted paper-toned
  gradient behind the same emoji. Purely a static visual asset, not the image-resolution logic.
- One real bug caught in the mobile screenshot pass, not by `tsc`/`eslint`/tests: a native
  `<details>` element only renders its `<summary>` child while closed, so the collapsible intake
  clusters' index-tab (a sibling of `<summary>`) was invisible until expanded - fixed by moving it
  inside `<summary>`. See `DECISIONS.md`.

**Follow-up (small operator-requested tweaks after the above merged)** - see `DECISIONS.md`'s "MVP
1.3 follow-up" entry:

- "Avoid repeating" moved into the "Budget, effort & notes" accordion (now "Budget, effort & avoid
  repeating"); notes moved out into its own new "About this week" section.
- The week's notes and avoid-repeating list - already persisted verbatim on `weeks.intakeJson`, no
  schema change needed - are now surfaced in an "About this week" card at the top of the plan page,
  rendered only when either was actually set.
- Each day in the recipe view is now a collapsed-by-default `<details>` (was always-expanded) with
  a meal-count hint, so a full week isn't a wall of expanded meal cards on a phone.

**Heart-healthy focus toggle** (added on the same branch/PR, see `DECISIONS.md`'s "Cholesterol-
lowering focus toggle" and "Saturated fat" entries):

- A "♥ Lower cholesterol" chip in the intake form's "This week" section - when on, generation
  favours both ingredients with recognised LDL-cholesterol-lowering properties (oats, oily fish,
  nuts, legumes, olive oil...) and lower-saturated-fat choices (low-fat/fat-free dairy, lean/trimmed
  meat, skinless poultry...). One toggle covers both, not two - standard dietary guidance treats
  "less saturated fat" and "more cholesterol-lowering foods" as the same piece of advice.
- Every ingredient Claude generates now carries two required, honest boolean flags -
  `cholesterolLowering` and `lowSaturatedFat` - set on every ingredient in every week regardless of
  whether that week's toggle was on. `IngredientLine` shows a ♥ for the former and a small outline
  droplet icon for the latter (deliberately a different shape, not just a different tooltip, so the
  two badges are distinguishable at a glance) - an ingredient can have either, both, or neither.

## MVP 2.1 - shipped, in PR to `main`

Small operator-requested backlog grab-bag, built as one milestone on `build/mvp2.1` from latest
`main` (after the post-MVP2 empty-ingredients hotfix below). `tsc`, `eslint`, and `vitest` (90
tests) all green, plus a manual mocked-generation browser pass through Settings and the intake form
confirming persistence and generation behaviour end to end. See `DECISIONS.md`'s "MVP 2.1" entry for
full design reasoning, including why items 2 and 4 below were built as one unified feature.

- **Favorite proteins** - a new household-level default (`households.favorite_proteins`, migration
  `0003`), editable in Settings via the same pill-picker style as the intake form's protein picker.
  The intake form's protein selection now pre-fills from this instead of always starting with every
  protein selected.
- **Meals-needed toggles** - a new "Meals needed this week" intake section with independent
  Breakfast/Lunch/Dinner toggles for Parents and for Kids. Adults can now optionally get a
  breakfast (previously never modelled at all); the kids track can be skipped entirely for the week
  by toggling all three off. Intake-only, not a Settings default - see `DECISIONS.md` for why that's
  the right line (favorite proteins were explicitly asked for as a standing preference; these
  toggles were asked for as "a box on the generate form").
- **Stronger free-text override** - the system prompt now explicitly frames the household context
  as standing defaults, not hard constraints, with a closing rule that conflicting free-text notes
  win outright (e.g. "camping this week, no oven" now suspends the batch-cooking default entirely
  rather than just getting acknowledged alongside it).
- Resolves the backlog item about an adult breakfast appearing unexpectedly (see
  `REQUIREMENTS.md`'s backlog section) - it's no longer unexpected, it's now an intentional per-week
  choice.

## Post-MVP2 hotfix: empty ingredients array surviving a retry

A real generation call hit a hard failure - two meals came back with empty `ingredients` arrays
(schema requires at least one), and it survived the existing one-retry correction loop. Fixed by
(a) the system prompt now states "never emit an empty ingredients list" as an explicit up-front
rule instead of relying solely on the retry to catch it, and (b) retry attempts raised from 2 to 3.
See `DECISIONS.md`'s "Post-merge hotfix (MVP 2 era)" entry. Pushed directly to `main` given it was
an active generation failure, same as the MVP 1.2 streaming/maxDuration hotfixes.

## MVP 2 - shipped and merged

Shopping list tightened for handing to Claude in Chrome (`REQUIREMENTS.md`, scope corrected from
the originally-described "assisted basket-fill build" - see `DECISIONS.md`'s "MVP 2 scope
correction" entry: there's no API for this app to trigger a Claude in Chrome session, so this
milestone is a small export-format tweak plus in-app guidance, not an automation feature). Built on
`build/mvp2` from latest `main` (after MVP 1.2 merged + its two post-merge hotfixes, below).

- The "copy as plain text" shopping-list export (`ShoppingList.tsx`, now backed by
  `src/lib/shopping/exportText.ts`) is now one flat line per item - `productName - displayQuantity`,
  sorted alphabetically, no aisle-grouped headers - so a linear paste into an agent's chat is easy
  to work through item by item. The on-screen view is unchanged and still aisle-grouped for a human
  shopping in-store.
- A short tip near the copy button explains the actual workflow: open Claude in Chrome on
  Sainsbury's site, paste the list, ask it to add everything to the basket - it confirms anything
  consequential and stops before payment on its own.
- Bonus fix found while manually verifying the new export: `aggregateShoppingList`'s own quantity
  formatting had the same "no space between quantity and unit" bug MVP1.1 fixed for recipe
  ingredient lines (e.g. `3loaf` instead of `3 loaf`) - a second, separate occurrence of the same
  bug class, now fixed by reusing the same `formatIngredientAmount` helper instead of ad hoc string
  concatenation.
- No new schema/migration, no server-side automation, no stored credentials - see `DECISIONS.md`
  for what was explicitly *not* built and why.

## MVP 1.2 - shipped and merged, plus two post-merge hotfixes

Kids meals, family meal cadence & leftover balance (`REQUIREMENTS.md`), built on `build/mvp1.2`
from latest `main` (after MVP 1.1 merged). Everything is built and tested (`tsc`, `eslint`,
`vitest` - 77 tests, `playwright` all green), plus a manual browser pass through Settings, the
intake form, and the Parents/Kids/Family tabs. No open items this time - unlike MVP 1.1, nothing
here needed a live `ANTHROPIC_API_KEY` to verify (all mocked-generation + pure-logic coverage).

**Two issues surfaced from real (non-mocked) generation right after merging, both fixed directly on
`main` - see `DECISIONS.md`'s "Post-merge production hotfixes" entry:**
- Real generation was failing with "Streaming is required for operations that may take longer than
  10 minutes" - MVP 1.2's `max_tokens: 28000` raise pushed Claude's own request-time estimate past
  the Anthropic SDK's non-streaming threshold. Fixed by switching to
  `client.messages.stream(...).finalMessage()`.
- `/api/weeks/[weekId]/retry` was missing `maxDuration = 300` entirely (unlike `/api/generate`),
  so a real retry would have been killed by Vercel's much shorter default duration. Fixed.
- Neither was caught pre-merge because `MOCK_GENERATION=1` (the only way this build sandbox or the
  e2e test exercises generation) bypasses the real Anthropic call - same class of gap as MVP1's
  original `max_tokens` truncation bug.

- **Three family meal occasions** (Saturday breakfast - on but easily skippable, Saturday evening,
  Sunday lunch) replace MVP1's Sunday-only default, editable in Settings and per-week in the intake
  form. Saturday breakfast has no BBQ option; the other two keep sit-down/BBQ/skip.
- **Kids meal track** - a separate, simple Mon-Sat breakfast/lunch/dinner plan, pulled from the
  same canonical ingredient list, allowed to repeat (unlike the adult anti-repeat rule), without
  the adult calorie-deficit/high-protein framing.
- **Weekly leftover cap** - no more than 2 same-week leftover meal-slots across the whole plan
  (adult+kids+family combined), enforced via the existing Zod-validation retry loop.
- **Freezer-batch doubling** - a `freezerPortions` count on batch-cook meals, separate from
  same-week leftovers, shown as a small badge.
- **Parents / Kids / Family recipe-view tabs** - client-side filter over the week's meals; the
  shopping list stays one unified, aisle-grouped list across all three.
- One combined generation call (not split adult/kids) - `max_tokens` raised to 28000 to
  accommodate roughly double the meal count. See `DECISIONS.md` for the cost/complexity reasoning.
- Migration renames+preserves the operator's existing Sunday-era household settings
  (`sunday_default_mode`/`sunday_adults`/`sunday_kids` → `sun_lunch_default_mode`/`family_adults`/
  `family_kids`) rather than dropping them - verified manually against a seeded pre-migration row
  before merging (see `DECISIONS.md`).

## MVP 1.1 - shipped, one item needs the operator to finish it

Consistency/CX milestone (`REQUIREMENTS.md`), built on `claude/build-mvp1-1-pq3e0l`
(session-runner-assigned branch - supersedes `REQUIREMENTS.md`'s suggested `build/mvp1.1` name, same
situation MVP1 hit, see `DECISIONS.md`). Everything is built and tested (`tsc`, `eslint`, `vitest`,
`playwright` all green) **except one item that needs a real Anthropic key, which this build session
doesn't have**:

- Canonical ingredients table (`ingredients_canonical`) - auto-built/grown, fuzzy-matched at
  generation time, so ingredient names are consistent and shopping-list aisle grouping is more
  reliable. Old weeks are untouched/still render fine.
- Ingredient line rendering fixed (bold amount+unit + space + name) - was the "4whole eggs" bug.
- History page duplicate-date bug fixed - `createdAt` is now a tiebreaker everywhere weeks are
  ordered, and shown in the History list itself.
- Failed generations can now be retried in place (same week id, same stored intake) instead of
  restarting the whole intake form.
- Week-level nutrition summary (daily/weekly kcal+protein) on the recipe view.
- Shopping-list checklist (tick items off while shopping), persisted server-side.
- Intake form now pre-fills budget from household settings (was silently ignored before).
- Method-step generation prompt updated to ask for temperatures, doneness cues, technique notes.

**Still open**: the method-step eval requires generating 5+ real recipes through a live Claude call
and scoring them - this sandbox has no `ANTHROPIC_API_KEY` (same gap MVP1 hit with
`UNSPLASH_ACCESS_KEY`/its first live-generation test). Run `ANTHROPIC_API_KEY=... npx tsx
scripts/eval-method-steps.ts` once and paste the results into `EVALS.md`'s "Results" section - see
that file for the rubric and full context.

## Deployed and confirmed working

- **Live app**: Vercel project, deployed from `main`. URL as of last check: `foodplanner-pi.vercel.app` (confirm current one in the Vercel dashboard - custom/preview domains may have changed).
- **Database**: Vercel Postgres (Neon-backed), linked to the project. Migrations run automatically as part of every Vercel build (`vercel-build` script in `package.json`) - no manual migration step needed, ever, including for future schema changes.
- **Confirmed by the operator, live, with a real Anthropic key**: login, Settings (household defaults), the full intake → generate → recipes → shopping list → feedback flow.
- Currently showing `v9` on the login/home pages (see "Version number" below) once MVP 2.1 redeploys - if you see an older number still, it hasn't picked up this push yet.
- **Generation is noticeably slower since MVP 1.2, expectedly** - one call now produces the adult
  track plus a full kids track plus family occasions (roughly 2-3x the meals of a pre-MVP1.2 week),
  and Claude generates output tokens at a roughly fixed rate, so more content is proportionally more
  time. Not a bug/regression to chase; if it becomes a real problem, the options are trimming what's
  generated per call or splitting into separate adult/kids calls (rejected for MVP 1.2, see
  `DECISIONS.md`, but revisitable).
- **Kids meals could use a prompt-tuning pass** (more instructive/varied) - flagged by the operator
  post-MVP1.2, still deferred. (The other half of that original item - an adult breakfast appearing
  when it shouldn't - is resolved as of MVP 2.1: adult breakfast is now an intentional per-week
  toggle, not an always-out-of-scope meal, so it's no longer a bug.)

## What's in the app (v1 scope, per PROJECT.md)

Weekly intake form (days needed, Sunday mode, dish styles, **protein select/unselect - see below**, **meals-needed toggles per track - see below**, avoid-repeats, budget, effort, notes) → Claude API generates a structured 7-day plan (forced tool-use, Zod-validated, retries up to 3x) → recipe view (photo, ingredients, method, macros, batch-cook/leftover badges) → aisle-grouped shopping list (copy as text) → per-meal feedback that steers future generations → editable household settings (now including **favorite proteins - see below**).

## Recently added (beyond original spec, operator-requested)

- **Protein select/unselect** in the intake form - defaults to the household's favorite proteins (MVP 2.1, editable in Settings), deselect/reselect any protein to override just for that week.
- **Meals-needed toggles (MVP 2.1)** - per-week Breakfast/Lunch/Dinner toggles for the Parents and Kids tracks independently; adults can opt into a breakfast, and the kids track can be skipped entirely for the week.
- **Version number** (`src/lib/version.ts`, `APP_VERSION`) shown on login + home pages. **Manually bumped by one on every deploy-bound change** - if you're continuing work in a new session, remember to increment it in any commit that changes behavior, so the operator can visually confirm a deploy picked up new code.
- **History page: delete a week + formatted per-week summary** - each row now shows days needed, the nutrition goal, notes (truncated), and avoid-repeating, instead of just a bare date; a trash-icon button with a two-tap inline confirm deletes the week and everything derived from it (meals, shopping list, feedback - all cascade via FK). See `DECISIONS.md`'s "History page: delete a week, formatted per-week summary" entry.

## Open items / things the operator was mid-way through when this session ended

- **Disabling Vercel auto-deploy** - operator wants to stop every push to `main` from auto-deploying and control deploys manually instead. This is a Vercel dashboard setting (Settings → Git → auto-deploy toggle, or the "Ignored Build Step" field set to `exit 0`), not something in the repo - can't be done from code, only guided.
- **Real recipe photos** - `UNSPLASH_ACCESS_KEY` was not yet set as of last check, so recipes are using the local illustrated-placeholder fallback, not real Unsplash photos. Getting a free key from unsplash.com/developers and adding it as a Vercel env var turns this on; no code change needed.
- **Generation cost** - operator flagged the per-generation Claude API cost as higher than expected ("a few tenths of a penny"). Currently `claude-sonnet-5` with `max_tokens: 16000` (see `src/lib/claude/generate.ts` and the "Bug found on the operator's first real generation call" entry in `DECISIONS.md` for why it's that high - 8000 was truncating full-week responses). If cost matters more than quality, a cheaper model (Haiku-tier) is the lever to pull - not yet decided or actioned, just flagged.

## Key gotchas worth knowing before touching things (full detail in DECISIONS.md)

- **PGlite (local dev/test DB) needs `serverExternalPackages: ["@electric-sql/pglite"]`** in `next.config.ts` or it breaks under Turbopack.
- **The DB client (`src/lib/db/client.ts`) must stay a `globalThis`-cached singleton**, not a plain module-level `const` - Next's per-route bundle chunking re-evaluates plain module consts more than once per process, which is silently fatal for PGlite specifically (see the "e2e test caught" bug in DECISIONS.md).
- **Never run `npm run db:migrate` against a real `DATABASE_URL` from this sandbox/session** - outbound network here is allowlisted and doesn't include Neon's host (or Railway's, previously). Migrations against production run automatically via the `vercel-build` script instead; that's intentional, not a workaround to route around.
- The e2e smoke test (`tests/e2e/smoke.spec.ts`) always mocks generation (`MOCK_GENERATION=1`) - the max_tokens bug above only surfaced on the operator's first *live* generation call, since that path was never exercised by automated tests. Worth keeping in mind if something else about the real Claude call ever needs debugging.
- **`drizzle-kit generate` needs a real TTY when a schema change looks like a column rename** (its interactive resolver can't run in this non-TTY sandbox, and fails hard with no non-interactive fallback). When that happens: use `drizzle-kit generate --custom` to get a correctly-chained empty migration file, write the `ALTER TABLE ... RENAME COLUMN` SQL by hand, then hand-patch the accompanying `meta/000N_snapshot.json` to the new schema shape (`--custom` doesn't diff the schema, so the snapshot is left stale otherwise) - verify with a plain `drizzle-kit generate` afterward reporting "No schema changes, nothing to migrate". See `src/db/migrations/0002_family_meals_kids_tracks.sql` and `DECISIONS.md`'s MVP 1.2 "Migration" entry for a worked example.

## Workflow notes for continuing in a new chat

- MVP1 was built directly on `main` (no feature branches, per explicit operator instruction at the
  time - see DECISIONS.md's "Branching" entry). Starting with MVP 1.1, work goes on a session-runner-
  assigned branch and merges via PR instead (per `REQUIREMENTS.md`'s stated workflow) - check
  `DECISIONS.md`'s MVP 1.1 "Branching" entry for the exact branch name in use.
- Run `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, and `npx playwright test` before pushing - all four should stay green (they are as of this commit).
