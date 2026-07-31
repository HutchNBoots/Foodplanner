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
| `APP_PASSWORD` | Whatever household password you want to log in with |
| `AUTH_SECRET` | A long random string (e.g. `openssl rand -hex 32`) - signs the login session cookie |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `ANTHROPIC_MODEL` | Optional - leave unset to use the code's current default |
| `UNSPLASH_ACCESS_KEY` | Optional - omit to use local illustration fallbacks instead of real photos |

(`DATABASE_URL` is already set from step 2 - leave it as-is.)

## 4. Redeploy

No separate migration step needed - the database migration runs automatically as part of Vercel's own build (via the `vercel-build` script in `package.json`, which Vercel picks up in place of the default build command with zero config). It runs on every deploy and is safe to repeat (already-applied migrations are skipped), so this also keeps the schema in sync automatically whenever the code changes in the future.

The placeholder deploy from step 1 ran before any of the env vars in step 3 (or `DATABASE_URL` from step 2) existed - environment variable changes only apply to deployments made *after* they're set. Trigger a fresh one now: **Deployments** tab → **...** on the latest deployment → **Redeploy**, or just push any commit to `main`. Watch the build logs for this deployment - you should see `Running migrations against Vercel Postgres (Neon) DATABASE_URL...` followed by `Migrations complete.` before the normal Next.js build output starts.

## 5. Verify it worked

1. Open the deployed URL on your phone or laptop, confirm the login screen appears, and log in with `APP_PASSWORD`.
2. Go to **Settings** and confirm you can see/edit the default household (2 adults, 2 kids, Sunday sit-down lunch) - this row is auto-created on first visit.
3. Go to **Plan a new week**, fill in the intake form, and submit. This is the one step that needs your real `ANTHROPIC_API_KEY` to actually work end-to-end (locally/in CI this is mocked - see `README.md`) - expect the first real generation call to take up to a minute or so; the page shows a loading state and polls until it's ready.
4. Confirm recipes show photos (real Unsplash ones if you set that key, illustrated placeholders otherwise), and that the **Shopping list** tab shows an aisle-grouped, copyable list.
5. Leave feedback on a meal (e.g. "Loved it") and confirm it saves - this is what future weeks' generations read back.

If generation fails, the error message shown in the UI is the same one logged server-side (Vercel's function logs) - most likely cause is a missing/invalid `ANTHROPIC_API_KEY`. If the app loads but every page errors, check the step 4 deployment's build logs for the `Migrations complete.` line - if it's missing or errored, the build didn't reach the database (usually a `DATABASE_URL` that's missing or pointing somewhere unreachable).

## Rotating the household password

Change `APP_PASSWORD` in Vercel's env vars and redeploy (or just wait for the next deploy) - existing login sessions stay valid until their cookie expires (30 days) since the signing secret is `AUTH_SECRET`, not the password itself; to force everyone to re-log-in immediately, rotate `AUTH_SECRET` too.

## If Unsplash rate-limits or you remove the key later

No code changes needed - `UNSPLASH_ACCESS_KEY` is checked per-request at generation time. Meals generated while the key was working keep their cached real photo forever (never re-fetched); meals generated without a working key get a local illustrated placeholder instead. Nothing breaks either way.
