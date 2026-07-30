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

### Data storage: Railway Postgres + Drizzle ORM (supersedes the original Turso decision)

Originally built against Turso (libSQL) — see the reasoning that was here (still valid: SQL over a KV store or a git-backed JSON file, for the same reasons below). The operator then made an explicit, direct infra call: **Vercel hosts the app, Railway hosts the database**, so the DB layer was swapped to Postgres. Drizzle's adapter is a thin swap (schema stays relational, only the dialect/driver changes), so this was a mechanical migration, not a redesign:

- **Schema**: `drizzle-orm/pg-core` instead of `sqlite-core`. JSON columns (ingredients, method steps, plan blobs, etc.) moved from `text(mode:"json")` to native `jsonb` — a straight upgrade, no reason not to use Postgres's real JSON type now that the DB has one. Dates/enums stayed as plain `text` columns (Postgres stores/compares ISO strings fine, and it avoids a Date-object refactor across every page/query for no functional gain in v1).
- **Production**: `drizzle-orm/node-postgres` (`pg`) against Railway's Postgres connection string (`DATABASE_URL`). Railway's Postgres plugin exposes both a private, Railway-internal URL and a public one (proxied through Railway's edge, hostname like `*.proxy.rlwy.net`) — Vercel's serverless functions aren't on Railway's private network, so **the public connection string is the one that goes into Vercel's env vars**. This is a real latency/pooling trade-off versus Turso's HTTP-based client (a TCP connection pool from a stateless serverless function is a worse fit than an HTTP driver designed for exactly this), acceptable for a single-household personal app's traffic level — documented honestly here, not glossed over. The pool is created with a small `max` (5) at module scope so warm Lambda instances reuse it rather than opening a fresh pool per request.
- **Local dev/tests**: rather than requiring a local Postgres install/Docker (extra setup friction, and re-introduces the "needs infrastructure to develop" problem Turso's file mode avoided), local dev and the test suite run against **PGlite** (`@electric-sql/pglite`, an embedded WASM Postgres) via `drizzle-orm/pglite`. Same schema, same SQL dialect, zero network and zero external service needed to run `npm run dev` or the test suite. `src/lib/db/client.ts` picks node-postgres vs PGlite based solely on whether `DATABASE_URL` is set, so there's still exactly one code path in the app itself — only the bottom-most driver differs, same as the old libSQL split.
- **Gotcha found and fixed while wiring this up**: PGlite's WASM asset loading (a `new URL(..., import.meta.url)` pattern) breaks under Next.js/Turbopack's bundler with `TypeError: The "path" argument must be ... Received an instance of URL` — a dual-module-identity issue, not a real bug in the data layer (a standalone `tsx src/lib/db/migrate.ts` run against the same PGlite path worked fine outside Next's bundler). Fixed by adding `@electric-sql/pglite` to `serverExternalPackages` in `next.config.ts`, which tells Next to `require()` it natively at runtime instead of bundling it - confirmed working end-to-end (login → home → settings → history → plan/new all 200) under both `next dev` and a full `next build && next start`. Production never touches this path at all (DATABASE_URL is always set there, routing to `pg` instead), so this only mattered for local dev/test ergonomics - but it's exactly the kind of thing that would've been a confusing dead end for the operator if left undocumented.

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
- **Playwright** for the end-to-end smoke test (intake → generate → recipe view → shopping list), since a Chromium build is already provisioned in this environment. The generation step is mocked in the e2e test (no live Anthropic key needed to prove the flow works end-to-end); a live-key path is documented in `DEPLOY.md` for the operator to smoke-test post-deploy.

## Blocking items surfaced to the operator (not build-blocking, deploy-blocking)

No `ANTHROPIC_API_KEY`, `UNSPLASH_ACCESS_KEY`, or Turso credentials are present in this environment — expected, since §11 says these are provided at deploy time, not during the build. The app is built to run fully with local fallbacks (local SQLite file, illustrated placeholder images) so the whole flow is testable without any of those secrets; real keys are required only for production deploy and for hitting the live Claude/Unsplash APIs. Documented precisely in `DEPLOY.md`.
