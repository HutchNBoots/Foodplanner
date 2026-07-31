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

## Blocking items surfaced to the operator (not build-blocking, deploy-blocking)

No `ANTHROPIC_API_KEY`, `UNSPLASH_ACCESS_KEY`, or production database credentials are present in this environment — expected, since §11 says these are provided at deploy time, not during the build. The app is built to run fully with local fallbacks (embedded PGlite database, illustrated placeholder images) so the whole flow is testable without any of those secrets; real keys/DB are required only for production deploy and for hitting the live Claude/Unsplash APIs. Documented precisely in `DEPLOY.md`.
