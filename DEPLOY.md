# Deploy guide

Copy-paste steps to get Foodplanner live on **Vercel** (app) + **Railway** (Postgres database). This is written for you to run yourself - nothing here needs me to have your credentials. See `DECISIONS.md` for why this split (Vercel/Railway) was chosen.

## What you'll need

- A GitHub account with this repo pushed to it (already done).
- A [Vercel](https://vercel.com) account (free tier is enough).
- A [Railway](https://railway.app) account (free/starter tier is enough for personal use).
- An [Anthropic API key](https://console.anthropic.com/) - required, this is what generates the meal plans. Billed separately from Claude.ai/Pro, pay-as-you-go.
- Optionally, an [Unsplash API key](https://unsplash.com/developers) (free tier) for real recipe photos. Without one, recipes just show a local illustrated placeholder instead - the app fully works either way.

## 1. Railway: create the Postgres database

1. Create a new Railway project.
2. Add a **Postgres** database to it (Railway's "New" → "Database" → "Add PostgreSQL").
3. Open the Postgres service → **Variables** tab. You'll see a `DATABASE_URL` (and related `PG*` vars). By default this is Railway's **private/internal** URL - it only works from *inside* Railway's own network, and **Vercel's serverless functions are not on that network**.
4. Find the **public** connection string instead: on the Postgres service, go to **Settings** → **Networking** → enable/copy the **public networking** / TCP proxy connection string. It'll look like `postgresql://postgres:<password>@<something>.proxy.rlwy.net:<port>/railway` (hostname containing `proxy.rlwy.net`, not the short internal one). **This is the URL you'll use everywhere below** - copy it somewhere safe.
5. Pick a Railway project region close to where Vercel will run (e.g. both in a US or EU region) to keep query latency down - a serverless function opening a fresh Postgres connection on every cold start already has more round-trip overhead than the previous Turso setup, so region locality actually matters here (see `DECISIONS.md`).

## 2. Run the first migration against Railway

From your own machine (or this repo checked out anywhere with Node installed), with the **public** URL from step 1:

```bash
npm install
DATABASE_URL="postgresql://...proxy.rlwy.net:PORT/railway" npm run db:migrate
```

You should see `Migrations complete.` This creates the `households`, `weeks`, `meals`, `feedback`, and `shopping_items` tables. Re-run this same command (with the same `DATABASE_URL`) any time the schema changes in the future (i.e. after pulling a change that touches `src/lib/db/schema.ts` and includes a new file under `src/db/migrations/`).

## 3. Vercel: import and configure the project

1. In Vercel, **Add New Project** → import this GitHub repo. Framework preset should auto-detect as Next.js - leave build/output settings default.
2. Before the first deploy, go to **Settings → Environment Variables** and add (Production, and Preview if you want preview deploys to work too):

   | Variable | Value |
   | --- | --- |
   | `APP_PASSWORD` | Whatever household password you want to log in with |
   | `AUTH_SECRET` | A long random string (e.g. `openssl rand -hex 32`) - signs the login session cookie |
   | `DATABASE_URL` | The **public** Railway Postgres URL from step 1 |
   | `ANTHROPIC_API_KEY` | Your Anthropic API key |
   | `ANTHROPIC_MODEL` | Optional - leave unset to use the code's current default |
   | `UNSPLASH_ACCESS_KEY` | Optional - omit to use local illustration fallbacks instead of real photos |

3. Deploy. Vercel will build with `next build` and serve it - no other configuration needed (there's no `vercel.json`; defaults are fine for this app).

## 4. Verify it worked

1. Open the deployed URL on your phone or laptop, confirm the login screen appears, and log in with `APP_PASSWORD`.
2. Go to **Settings** and confirm you can see/edit the default household (2 adults, 2 kids, Sunday sit-down lunch) - this row is auto-created on first visit.
3. Go to **Plan a new week**, fill in the intake form, and submit. This is the one step that needs your real `ANTHROPIC_API_KEY` to actually work end-to-end (locally/in CI this is mocked - see `README.md`) - expect the first real generation call to take up to a minute or so; the page shows a loading state and polls until it's ready.
4. Confirm recipes show photos (real Unsplash ones if you set that key, illustrated placeholders otherwise), and that the **Shopping list** tab shows an aisle-grouped, copyable list.
5. Leave feedback on a meal (e.g. "Loved it") and confirm it saves - this is what future weeks' generations read back.

If generation fails, the error message shown in the UI is the same one logged server-side (Vercel's function logs) - most likely causes are a missing/invalid `ANTHROPIC_API_KEY` or a `DATABASE_URL` that's Railway's private (not public) URL.

## Rotating the household password

Change `APP_PASSWORD` in Vercel's env vars and redeploy (or just wait for the next deploy) - existing login sessions stay valid until their cookie expires (30 days) since the signing secret is `AUTH_SECRET`, not the password itself; to force everyone to re-log-in immediately, rotate `AUTH_SECRET` too.

## If Unsplash rate-limits or you remove the key later

No code changes needed - `UNSPLASH_ACCESS_KEY` is checked per-request at generation time. Meals generated while the key was working keep their cached real photo forever (never re-fetched); meals generated without a working key get a local illustrated placeholder instead. Nothing breaks either way.
