# Deploy guide

Copy-paste steps to get Foodplanner live on **Vercel** - app and database both, one platform. See `DECISIONS.md` for why (Vercel Postgres, Neon-backed, resolved the pooling/latency trade-off an earlier two-platform setup had).

## What you'll need

- A GitHub account with this repo pushed to it (already done).
- A [Vercel](https://vercel.com) account (free/Hobby tier is enough).
- An [Anthropic API key](https://console.anthropic.com/) - required, this is what generates the meal plans. Billed separately from Claude.ai/Pro, pay-as-you-go.
- Optionally, an [Unsplash API key](https://unsplash.com/developers) (free tier) for real recipe photos. Without one, recipes just show a local illustrated placeholder instead - the app fully works either way.

## 1. Import the project into Vercel

1. In Vercel, **Add New Project** → import this GitHub repo. Framework preset auto-detects as Next.js - leave build/output settings default.
2. Let this first deploy actually run. It won't be usable yet (no database or API key attached), and that's fine - **Vercel only lets you attach Storage to a project that already has a deployment**, so this deploy's only job is to make the project exist. Don't worry about its build/runtime state yet.

## 2. Add Vercel Postgres

1. Now that the project exists, go to its **Storage** tab → **Create Database** → **Postgres** (this provisions a Neon-backed Postgres instance, fully managed by Vercel - no separate account or dashboard). If you don't see a **Storage** tab, look for **Marketplace** instead and search "Postgres" there - Vercel has moved this around between account types/versions, but it ends the same way.
2. Connect it to the project when prompted. Vercel automatically adds a `DATABASE_URL` environment variable (plus a few Postgres-specific variants) to the project - **you don't need to copy/paste a connection string yourself**.
3. Pick the same region as your Vercel deployment (or close to it) when creating the database, to keep query latency low.

## 3. Set the remaining environment variables

In **Settings → Environment Variables** (Production, and Preview too if you want preview deploys to fully work), add:

| Variable | Value |
| --- | --- |
| `APP_PASSWORD` | The sign-up invite code (see "Accounts" below) - not a login password itself since the sign-up journey |
| `AUTH_SECRET` | A long random string (e.g. `openssl rand -hex 32`) - signs the login session cookie |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `ANTHROPIC_MODEL` | Optional - leave unset to use the code's current default |
| `UNSPLASH_ACCESS_KEY` | Optional - omit to use local illustration fallbacks instead of real photos |

(`DATABASE_URL` is already set from step 2 - leave it as-is.)

## 4. Redeploy

No separate migration step needed - the database migration runs automatically as part of Vercel's own build (via the `vercel-build` script in `package.json`, which Vercel picks up in place of the default build command with zero config). It runs on every deploy and is safe to repeat (already-applied migrations are skipped), so this also keeps the schema in sync automatically whenever the code changes in the future.

The placeholder deploy from step 1 ran before any of the env vars in step 3 (or `DATABASE_URL` from step 2) existed - environment variable changes only apply to deployments made *after* they're set. Trigger a fresh one now: **Deployments** tab → **...** on the latest deployment → **Redeploy**, or just push any commit to `main`. Watch the build logs for this deployment - you should see `Running migrations against Vercel Postgres (Neon) DATABASE_URL...` followed by `Migrations complete.` before the normal Next.js build output starts.

## 5. Verify it worked

1. Open the deployed URL on your phone or laptop, confirm the login screen appears, click **Create a household**, enter `APP_PASSWORD` as the invite code, and pick a password - you'll be assigned a username (`family1`, `family2`, ...) and walked through a short onboarding wizard.
2. Go to **Settings** and confirm your household details saved correctly, and that your username is shown there.
3. Go to **Plan a new week**, fill in the intake form, and submit. This is the one step that needs your real `ANTHROPIC_API_KEY` to actually work end-to-end (locally/in CI this is mocked - see `README.md`) - expect the first real generation call to take up to a minute or so; the page shows a loading state and polls until it's ready.
4. Confirm recipes show photos (real Unsplash ones if you set that key, illustrated placeholders otherwise), and that the **Shopping list** tab shows an aisle-grouped, copyable list.
5. Leave feedback on a meal (e.g. "Loved it") and confirm it saves - this is what future weeks' generations read back.

If generation fails, the error message shown in the UI is the same one logged server-side (Vercel's function logs) - most likely cause is a missing/invalid `ANTHROPIC_API_KEY`. If the app loads but every page errors, check the step 4 deployment's build logs for the `Migrations complete.` line - if it's missing or errored, the build didn't reach the database (usually a `DATABASE_URL` that's missing or pointing somewhere unreachable).

## Accounts (sign-up journey)

Each household is its own account: an auto-generated username (`family1`, `family2`, ...) plus a
password they choose at `/signup` - no email involved, see `DECISIONS.md`'s "Sign-up journey" entry.
Creating a *new* account requires the shared `APP_PASSWORD` as an invite code, so signups stay limited
to people you've actually given the code to (each generated week costs real Claude API money). Once an
account exists, its own password is what it logs in with going forward - `APP_PASSWORD` is never
needed again for that household. There's no password-reset flow yet (deliberately deferred - needs an
email-sending provider); if a tester forgets their password, you'd need to reset it directly in the
database (`households.password_hash` - set to `null` to fall back to the transparent-upgrade path
below, or hash a new one the same way `src/lib/auth/password.ts` does).

**Rotating the invite code**: change `APP_PASSWORD` in Vercel's env vars and redeploy - this only
affects *new* sign-ups, not any already-created account's login.

**The pre-existing single-household deploy** (if you were running this app before the sign-up journey
shipped) keeps working automatically: the migration backfills it with username `family1` and no
password, and its first successful login with the (old) shared `APP_PASSWORD` transparently upgrades
it into a real account with that as its password - no manual migration step needed. Log in with
username `family1` and whatever `APP_PASSWORD` already was.

## If Unsplash rate-limits or you remove the key later

No code changes needed - `UNSPLASH_ACCESS_KEY` is checked per-request at generation time. Meals generated while the key was working keep their cached real photo forever (never re-fetched); meals generated without a working key get a local illustrated placeholder instead. Nothing breaks either way.

## One follow-up from MVP 1.1: run the method-step eval once

The build session for MVP 1.1 had no `ANTHROPIC_API_KEY` to test against, so the "more instructive
method steps" prompt change is untested against a real generation. Once you have a working key
(locally, with it set in your shell, or anywhere with `ANTHROPIC_API_KEY` set and network access to
`api.anthropic.com`), run:

```
ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/eval-method-steps.ts
```

and paste the printed table into `EVALS.md`'s "Results" section (see that file for the rubric).
This doesn't block using the app - it's just closing out the one MVP 1.1 checklist item that needed
a real key to verify.
