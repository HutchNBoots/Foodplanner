# Deploy guide

Copy-paste steps to get Foodplanner live on **Vercel** - app and database both, one platform. See `DECISIONS.md` for why (Vercel Postgres, Neon-backed, resolved the pooling/latency trade-off an earlier two-platform setup had).

## What you'll need

- A GitHub account with this repo pushed to it (already done).
- A [Vercel](https://vercel.com) account (free/Hobby tier is enough).
- An [Anthropic API key](https://console.anthropic.com/) - required, this is what generates the meal plans. Billed separately from Claude.ai/Pro, pay-as-you-go.
- Optionally, an [Unsplash API key](https://unsplash.com/developers) (free tier) for real recipe photos. Without one, recipes just show a local illustrated placeholder instead - the app fully works either way.

## 1. Import the project into Vercel

1. In Vercel, **Add New Project** → import this GitHub repo. Framework preset auto-detects as Next.js - leave build/output settings default.
2. Don't deploy yet - add the database and env vars first (steps below), so the first deploy already has everything it needs.

## 2. Add Vercel Postgres

1. In the project, go to **Storage** → **Create Database** → **Postgres** (this provisions a Neon-backed Postgres instance, fully managed by Vercel - no separate account or dashboard).
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

## 4. Run the first migration

The database starts empty - the app's tables need to exist before the first real request. From your own machine (or this repo checked out anywhere with Node installed):

1. Copy the `DATABASE_URL` value from Vercel's **Storage** tab (the Postgres database's `.env.local` tab shows it, or **Settings → Environment Variables**).
2. Run:

   ```bash
   npm install
   DATABASE_URL="postgres://...neon.tech/..." npm run db:migrate
   ```

You should see `Migrations complete.` This creates the `households`, `weeks`, `meals`, `feedback`, and `shopping_items` tables. Re-run this same command (with the same `DATABASE_URL`) any time the schema changes in the future (i.e. after pulling a change that touches `src/lib/db/schema.ts` and includes a new file under `src/db/migrations/`).

## 5. Deploy

Trigger the deploy (push to `main`, or click Deploy in the Vercel dashboard). Vercel builds with `next build` and serves it - no other configuration needed (there's no `vercel.json`; defaults are fine for this app).

## 6. Verify it worked

1. Open the deployed URL on your phone or laptop, confirm the login screen appears, and log in with `APP_PASSWORD`.
2. Go to **Settings** and confirm you can see/edit the default household (2 adults, 2 kids, Sunday sit-down lunch) - this row is auto-created on first visit.
3. Go to **Plan a new week**, fill in the intake form, and submit. This is the one step that needs your real `ANTHROPIC_API_KEY` to actually work end-to-end (locally/in CI this is mocked - see `README.md`) - expect the first real generation call to take up to a minute or so; the page shows a loading state and polls until it's ready.
4. Confirm recipes show photos (real Unsplash ones if you set that key, illustrated placeholders otherwise), and that the **Shopping list** tab shows an aisle-grouped, copyable list.
5. Leave feedback on a meal (e.g. "Loved it") and confirm it saves - this is what future weeks' generations read back.

If generation fails, the error message shown in the UI is the same one logged server-side (Vercel's function logs) - most likely cause is a missing/invalid `ANTHROPIC_API_KEY`. If the app loads but every page errors, double check the migration in step 4 actually ran against the same `DATABASE_URL` Vercel is using.

## Rotating the household password

Change `APP_PASSWORD` in Vercel's env vars and redeploy (or just wait for the next deploy) - existing login sessions stay valid until their cookie expires (30 days) since the signing secret is `AUTH_SECRET`, not the password itself; to force everyone to re-log-in immediately, rotate `AUTH_SECRET` too.

## If Unsplash rate-limits or you remove the key later

No code changes needed - `UNSPLASH_ACCESS_KEY` is checked per-request at generation time. Meals generated while the key was working keep their cached real photo forever (never re-fetched); meals generated without a working key get a local illustrated placeholder instead. Nothing breaks either way.
