# Meal Planning Web App — Project Brief

This is the single file for the whole project — vision, spec, working style, everything. Save it as `PROJECT.md` in the repo root and start Claude Code with: **"Read PROJECT.md and start."**

**Context for Claude Code:** this is being run from a cloud/mobile Claude Code session against a remote GitHub repo (`foodplanner`) — there's no local machine involved, so don't assume a local filesystem outside the repo, local-only tooling, or that I'm watching a terminal. Assume secrets (Anthropic API key, Unsplash API key) are provided as environment variables/secrets in the cloud environment, not a local `.env` file I hand you interactively — if one's missing, say so clearly rather than assuming.

**Repo workflow:** work on a branch (e.g. `build/v1`), not directly on `main`, and open a PR when v1 is ready per the Definition of Done (§12). I'll review and merge it myself — that's the one checkpoint in this whole process, everything else should be autonomous.

**Your first task, before Phase 0 below:** read this whole file, then decide whether it's worth splitting into smaller files (e.g. a `VISION.md`, `SPEC.md`, `DECISIONS.md` stub, `README.md`) versus keeping it as one. If splitting genuinely helps (repo hygiene, clearer PR reviews, standard convention for the stack you choose), do it and note the new structure at the top of `DECISIONS.md`. If one file is honestly fine, say so in `DECISIONS.md` and move on — don't split it just for the sake of it.

---

## 1. Vision

The end-to-end goal, across however many phases it takes to get there:

**Ask → Generate → Optimise → Order.** Answer a short set of weekly questions, get a meal plan generated against real nutrition/household goals, have the shopping list optimised (aisle-grouped, quantity-totalled, de-duplicated, reused across batch-cooked meals), and then have as much of the actual ordering automated as is realistically and safely achievable — ideally ending in "review a pre-filled Sainsbury's basket and just pay," not "manually type 40 items into a search box."

v1 (this build) is **phase 1** of that vision: the ask/generate/optimise loop, fully built, plus a shopping list that's ready for ordering but not yet automated into it. §8 below lays out how later phases get closer to the "automate the order process" end of the vision — build v1 so those later phases are a natural extension, not a rewrite, but don't build them yet.

## 2. What this is

A personal web app that replaces an existing ChatGPT-style weekly meal-planning workflow. It should:
1. Ask a short set of weekly questions (like a form/wizard)
2. Generate a 7-day meal plan (high-protein, calorie-controlled, Sainsbury's ingredients) using the Claude API
3. Show recipes with photos, method, and nutrition per portion
4. Produce a shopping list grouped by supermarket aisle, with quantities and "used in" cross-references
5. Remember standing household preferences and a feedback/history log between weeks
6. Be usable from a phone, from anywhere (deployed, not local-only)

**Explicitly out of scope for v1:** actually placing an order or adding items to a Sainsbury's basket. Sainsbury's has no public ordering API, so real checkout integration means fragile browser automation against a site that can change or block it at any time. v1 instead produces a clean, copyable shopping list (grouped to match how the store is laid out) that the user pastes into Sainsbury's own site/app themselves. §9 lays out how later phases move toward real automation — build with that in mind, but don't build it now.

## 3. Household context (bake this into the system prompt / seed data)

- 2 adults on the plan; kids eat separately Mon–Sat, join for family meals on **Saturday
  breakfast (softer/skippable), Saturday evening, and Sunday lunch** (updated default, see
  `REQUIREMENTS.md` MVP 1.2 — was Sunday-only in the original spec). Regular weekday breakfasts
  stay simple and eaten separately — a shared sit-down breakfast doesn't fit weekday mornings.
- Family meal occasions (currently Saturday breakfast, Saturday evening, Sunday lunch): **surface
  as editable settings, don't hardcode** — same principle as the Sunday headcount below
- Sunday headcount: assumed 2 adults + 2 kids — **surface this as an editable setting, don't hardcode it**
- Store: Sainsbury's (UK) — standard stock, including their High Protein and Small But Mighty ranges as convenient options, not the backbone of meals
- Goal: moderate calorie deficit, high protein (~25–35g/adult main meal), high fibre, minimal ultra-processed food, sustainable long-term — not a crash diet
- Batch-cook proteins and reuse ingredients across 2–3 meals where sensible
- Vary meals week to week; don't repeat the previous week's dinners unless the user asks to keep a favourite
- Seasonal awareness: avoid heavy/hot dishes (soups, stews) in warm months; lean toward salads, bowls, tray bakes, wraps

## 4. Weekly flow (the core user journey)

**Step 1 — Quick intake form**, asked each time a new week is started:
- Which week / how many days needed (full 7, weekdays only, Mon–Sat)
- Family meals this week — Saturday breakfast, Saturday evening dinner, and Sunday lunch, each
  independently sit-down / BBQ (evening only) / skip (updated from the original Sunday-only
  question — see `REQUIREMENTS.md` MVP 1.2)
- Dish style this week — salads / soups / tray bakes / bowls / stir-fries / no preference (skip or de-emphasise soup-type options automatically if the app detects it's currently a warm month — a simple month check is enough, no need for a weather API)
- Anything to avoid repeating from recent weeks (pre-fill suggestions by pulling the last 2–3 weeks' dinners from history so the user can just confirm rather than type)
- Budget this week (free text or a rough £ figure)
- Effort level: quick/easy, mixed, happy to cook more
- Anything else (guests, leftovers to use up, cravings) — free text, optional

**Step 2 — Generate.** Call the Claude API server-side with a system prompt encoding §2 plus the week's answers plus recent history (to avoid repeats), and get back structured JSON (see §6 for shape) covering all meals, macros, and the shopping list. Show a loading state — this call will take a while.

**Step 3 — Review & display**, two views:
- **Recipe view**: day-by-day, meal-by-meal cards — title, a representative photo, ingredients with quantities, numbered method, kcal/protein/carbs/fat/fibre per adult portion. Batch-cook / leftover relationships should be visually obvious (e.g. "makes 4, 2 saved for Wednesday's lunch").
- **Shopping list view**: grouped by aisle (fresh produce, meat & fish, chilled & dairy, store cupboard, frozen), each ingredient showing total weekly quantity and which meals it's used in. Include a "copy as plain text" button formatted for pasting into a supermarket app search/notes.

**Step 4 — Feedback.** After the week (or at any time), let the user mark a meal loved / too much effort / too bland / repeat this. Store it — future generations should read this history and use it to steer the system prompt (avoid disliked meals, prioritise loved ones periodically, respect effort feedback).

## 5. Images

Use a stock food photo API (e.g. Unsplash's API, which is straightforward to integrate and has a generous free tier) to fetch a representative photo per recipe, keyed off the recipe title/main ingredient. This is a normal web app running with normal internet access, so this isn't the sandboxed-PDF limitation from earlier — real photos are genuinely available here. Cache the chosen image per recipe so repeat views don't re-fetch. If a suitable free image API isn't available or rate limits become a problem, document the fallback you chose (e.g. a curated local set of category photos) rather than silently degrading to no images.

## 6. Nutrition

Per adult portion, on every meal: kcal, protein (g), carbs (g), fat (g), fibre (g). These can be Claude-estimated at generation time (ask for them explicitly in the structured output) — precision to the gram isn't the goal, reasonable estimates are fine, same as a human meal-planner would give.

## 7. Suggested tech stack (reasoning included — deviate if you have a better reason, but document why)

- **Framework**: Next.js (App Router, TypeScript) — good fit for a mobile-first app with both UI and small server-side API routes (for the Claude API call, which needs a server-side key), deploys cleanly to Vercel.
- **Styling**: Tailwind CSS — fast to build a clean mobile-first UI.
- **Hosting**: Vercel — free tier is enough for personal use, gives an HTTPS URL usable from a phone anywhere, zero-config deploys from GitHub.
- **Data storage — flag this trade-off explicitly, then pick one and document the choice**: the user asked for "simple, file-based, nothing fancy" *and* "properly deployed, usable from my phone from anywhere." Plain browser `localStorage` satisfies the first but not the second (it's per-device/per-browser, so a phone and laptop wouldn't see the same data, and Vercel's serverless functions don't have a persistent filesystem, so a real local file won't survive between requests either). Resolve this by using the *simplest thing that actually persists centrally* — a hosted SQLite-compatible option such as Turso (libSQL) is a good fit: it's still "just a SQLite file" conceptually, has a generous free tier, and works fine from Vercel's serverless functions. If you pick something else (Vercel KV, a Postgres free tier, plain JSON in a GitHub-backed store, etc.), that's fine — just record the reasoning in `DECISIONS.md`.
- **AI generation**: Claude API (`@anthropic-ai/sdk`), called from a Next.js API route (never exposed client-side). Request structured JSON output (either via a tool-call / JSON-schema style prompt, or clear "respond only with JSON" instructions — your call, document which and why).
- **Auth**: this is a single-household personal app. A single shared password (simple env-var-based gate) is enough for v1 — don't build full multi-user auth. Document this assumption.

## 8. Data model (rough sketch — adjust as needed)

- `households` — the standing context from §2, editable via a settings page (adult count, kid count/Sunday attendance, budget default, store)
- `weeks` — one row per generated week: intake answers, generated plan JSON, created date
- `meals` — normalised out of the plan JSON if useful for querying history/repeats (day, meal slot, title, macros, ingredients, method, image URL, batch/leftover links)
- `feedback` — meal reference, rating/tag (loved / too much effort / too bland / repeat), free-text note, date
- `shopping_items` — derived per week from meals, or generated fresh each time — your call

## 9. Roadmap toward full automation (not built in v1)

Later phases, in roughly increasing order of automation — architect v1 so these are extensions, not rewrites, but don't build them now:

- **Phase 2 — Assisted basket-fill.** A human-in-the-loop browser flow (e.g. a Claude-in-Chrome-style assistant, or a Playwright script the user runs themselves) that searches Sainsbury's for each shopping-list item and adds it to the basket, but stops before payment for the user to review and check out manually. Keeps a human confirming both the substitutions (out-of-stock items, pack sizes) and the actual purchase.
- **Phase 3 — Delta ordering.** Compare this week's optimised list against last week's (or a saved "usual basket"), and only surface/add the items that changed, so a recurring shop becomes mostly one-click review rather than 40 items every time.
- **Not planned, flag if it ever comes up:** fully unattended automated checkout (no human click, stored payment credentials, running headless on a schedule). Automating purchases against a retailer's own site like this usually sits outside their terms of service and adds real financial/security risk from storing payment details — not something to build without Sainsbury's offering an official, sanctioned way to do it (a partner API, if one ever exists). If this ever seems worth revisiting, that's a conversation, not a default to code toward.
- Multi-household / multi-user support
- Push notifications / reminders ("start Monday's batch cook")
- A "swap this meal" regenerate-single-meal action instead of regenerating the whole week

For v1, the concrete hook to leave in place for this: store each shopping-list item with a clean, searchable product name/quantity (not just free text baked into a sentence), since that's what Phase 2's search-and-add step would need to work against later.

## 10. How to work

This should run fully hands-off from my side — I'm not available to be pinged for build decisions, only for things that are genuinely blocking. Specifically:

**Phase 0 — Brainstorm before building.** Before writing any code, use your own planning capabilities properly: extended thinking / plan mode to explore more than one architectural approach (e.g. different takes on the data model, the JSON-schema shape for the generation call, how strictly to normalise meals vs. storing plan JSON as a blob), and subagents to research or draft-compare options in parallel where that's genuinely faster than one linear pass. Don't just take the first reasonable design — spend real effort weighing 2–3 options against this spec's constraints (mobile-first, cross-device persistence, single Claude API call producing structured output) before committing. Write the brainstorm outcome and *why* you picked what you picked into `DECISIONS.md` before starting implementation, not just the final decisions with no comparison.

**Phase 1 — Build.** Work through implementation autonomously. Where this spec leaves a decision open (exact DB choice, exact image API, JSON schema shape, component structure, etc.), make the call yourself rather than stopping to ask. Log every non-trivial decision and its reasoning to `DECISIONS.md` as you go.

**Phase 2 — Test.** Write and run real tests yourself — unit tests for the generation/parsing logic, and at least a scripted end-to-end smoke test of the core flow (intake → generate → view plan → view shopping list). If something fails, debug and fix it yourself and keep iterating until it passes; don't stop to report a failing test and wait for direction. I want to be handed a working, self-verified app, not a partially-tested one.

**Phase 3 — Handoff, not deploy.** I'll do the actual deployment myself (I have the Vercel/GitHub accounts and don't want you needing my credentials). Your job stops at: the repo is deploy-ready, `main` is green, and you've written a short `DEPLOY.md` with the exact steps I need to run (env vars to set, any CLI commands, any account/service sign-ups required) — not to do the deploy, just to make it a copy-paste job for me.

Only interrupt me directly, mid-build, for things that actually block progress — missing credentials (Anthropic API key, Unsplash API key, or similar), or a decision that meaningfully changes cost/privacy/scope in a way this spec doesn't already resolve (e.g. "this feature needs a paid tier to work at all"). Everything else: decide, document in `DECISIONS.md`, keep going.

Commit incrementally with clear messages rather than one giant commit.

At the end, give me a summary: what you built, the key decisions from `DECISIONS.md` worth knowing about without reading the whole file, confirmation of what you tested and that it passes, and point me to `DEPLOY.md` for the handoff steps.

## 11. What I'll need to provide

- An Anthropic API key (for the generation calls) — billed separately from Claude.ai/Claude Pro, pay-as-you-go on usage
- An Unsplash (or chosen alternative) API key, if you go that route — free tier
- My own Vercel account and GitHub repo — I'll run the actual deploy myself from your `DEPLOY.md` instructions

## 12. Definition of done for v1

- I can open the app on my phone via a real URL, no local setup
- I can run through the weekly intake form and get a generated 7-day plan with Sunday BBQ/lunch handled separately
- Every meal shows a photo, ingredients, method, and full macros
- The shopping list is aisle-grouped, quantity-totalled, cross-referenced to meals, and copyable as text
- Feedback I leave on a meal actually influences next week's generation
- Preferences (household size, Sunday headcount, etc.) are editable in a settings screen, not hardcoded
- All of this is in a PR from `build/v1` into `main`, ready for me to review and merge
