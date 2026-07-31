# Requirements — broken down by MVP

This restates the requirements already captured in `PROJECT.md` (original spec, §1–12) and
`STATUS.md` (current build state), organised by MVP milestone instead of by topic, so it's easy to
see what's shipped vs. what's still ahead. `PROJECT.md` remains the source of truth for full
detail and reasoning — this file is a status-oriented index into it.

Status key: ✅ Shipped & confirmed working · 🟡 Shipped but incomplete/open · ⬜ Not started

---

## MVP 1 (v1) — Ask → Generate → Optimise loop

**Status: ✅ Shipped, live, confirmed working end-to-end with a real Anthropic key.**

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

---

## MVP 2 (Phase 2) — Assisted basket-fill

**Status: ⬜ Not started.** Per `PROJECT.md` §9.

A human-in-the-loop flow (browser assistant or a Playwright script the user runs themselves) that:

- ⬜ Takes the MVP 1 shopping list (already stored with clean, searchable `product_name`/`quantity`
  per row, per the v1 data-model hook left for this) and searches Sainsbury's for each item
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
