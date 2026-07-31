# Current status (read this first in a new chat)

Start here for "where are we" - the other docs are: `PROJECT.md` (original spec), `DECISIONS.md` (full decision-by-decision log with reasoning), `README.md` (local dev), `DEPLOY.md` (deploy steps). This file is just the up-to-date summary of where things actually stand.

## Deployed and confirmed working

- **Live app**: Vercel project, deployed from `main`. URL as of last check: `foodplanner-pi.vercel.app` (confirm current one in the Vercel dashboard - custom/preview domains may have changed).
- **Database**: Vercel Postgres (Neon-backed), linked to the project. Migrations run automatically as part of every Vercel build (`vercel-build` script in `package.json`) - no manual migration step needed, ever, including for future schema changes.
- **Confirmed by the operator, live, with a real Anthropic key**: login, Settings (household defaults), the full intake → generate → recipes → shopping list → feedback flow.
- Currently showing `v2` on the login/home pages (see "Version number" below) - if you don't see that on the live app, it means it hasn't been redeployed since the last push yet.

## What's in the app (v1 scope, per PROJECT.md)

Weekly intake form (days needed, Sunday mode, dish styles, **protein select/unselect - see below**, avoid-repeats, budget, effort, notes) → Claude API generates a structured 7-day plan (forced tool-use, Zod-validated, retries once) → recipe view (photo, ingredients, method, macros, batch-cook/leftover badges) → aisle-grouped shopping list (copy as text) → per-meal feedback that steers future generations → editable household settings.

## Recently added (beyond original spec, operator-requested)

- **Protein select/unselect** in the intake form - all protein types on by default, deselect one (e.g. Beef) to exclude it entirely that week.
- **Version number** (`src/lib/version.ts`, `APP_VERSION`) shown on login + home pages. **Manually bumped by one on every deploy-bound change** - if you're continuing work in a new session, remember to increment it in any commit that changes behavior, so the operator can visually confirm a deploy picked up new code.

## Open items / things the operator was mid-way through when this session ended

- **Disabling Vercel auto-deploy** - operator wants to stop every push to `main` from auto-deploying and control deploys manually instead. This is a Vercel dashboard setting (Settings → Git → auto-deploy toggle, or the "Ignored Build Step" field set to `exit 0`), not something in the repo - can't be done from code, only guided.
- **Real recipe photos** - `UNSPLASH_ACCESS_KEY` was not yet set as of last check, so recipes are using the local illustrated-placeholder fallback, not real Unsplash photos. Getting a free key from unsplash.com/developers and adding it as a Vercel env var turns this on; no code change needed.
- **Generation cost** - operator flagged the per-generation Claude API cost as higher than expected ("a few tenths of a penny"). Currently `claude-sonnet-5` with `max_tokens: 16000` (see `src/lib/claude/generate.ts` and the "Bug found on the operator's first real generation call" entry in `DECISIONS.md` for why it's that high - 8000 was truncating full-week responses). If cost matters more than quality, a cheaper model (Haiku-tier) is the lever to pull - not yet decided or actioned, just flagged.

## Key gotchas worth knowing before touching things (full detail in DECISIONS.md)

- **PGlite (local dev/test DB) needs `serverExternalPackages: ["@electric-sql/pglite"]`** in `next.config.ts` or it breaks under Turbopack.
- **The DB client (`src/lib/db/client.ts`) must stay a `globalThis`-cached singleton**, not a plain module-level `const` - Next's per-route bundle chunking re-evaluates plain module consts more than once per process, which is silently fatal for PGlite specifically (see the "e2e test caught" bug in DECISIONS.md).
- **Never run `npm run db:migrate` against a real `DATABASE_URL` from this sandbox/session** - outbound network here is allowlisted and doesn't include Neon's host (or Railway's, previously). Migrations against production run automatically via the `vercel-build` script instead; that's intentional, not a workaround to route around.
- The e2e smoke test (`tests/e2e/smoke.spec.ts`) always mocks generation (`MOCK_GENERATION=1`) - the max_tokens bug above only surfaced on the operator's first *live* generation call, since that path was never exercised by automated tests. Worth keeping in mind if something else about the real Claude call ever needs debugging.

## Workflow notes for continuing in a new chat

- All work happens directly on `main` - no feature branches, per explicit operator instruction (see DECISIONS.md's "Branching" entry). The `claude/project-file-setup-8e1k5n` branch is kept in sync alongside it but `main` is what Vercel deploys from.
- Run `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, and `npx playwright test` before pushing - all four should stay green (they are as of this commit).
