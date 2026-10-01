# Insightly — production build

What changed from the prototype you uploaded:

- No more "paste your API key" screen. The Gemini key lives only in a Vercel
  environment variable and is called from a server route (`/api/analyze`) —
  it is never sent to the browser.
- Email + password login/signup, backed by Supabase Auth. Sign-up also
  captures name, organisation and purpose into a `profiles` table.
- One free trial run per user per week, enforced **server-side** (the check
  happens again inside `/api/analyze` right before calling Gemini, using the
  Supabase service-role key, so it can't be bypassed from the browser).
- Same dashboard UI/UX (KPIs, charts, chart-type switch, color themes,
  table view) — ported into Next.js, still 100% client-rendered after the
  AI response comes back.

## 1. Supabase

1. Open your project → SQL Editor → paste and run `supabase/schema.sql`.
2. Authentication → Providers → Email: for the simplest flow, turn **off**
   "Confirm email" so sign-up logs the user in immediately (the app creates
   the `profiles` row right after sign-up, which needs an active session).
   If you'd rather keep email confirmation on, that's fine too — the app
   shows "check your email" and the user just signs in afterwards; you'll
   want to also create the `profiles` row on first login in that case (a
   small addition to `app/page.jsx`'s `handleLogin`).
3. Grab these from Project Settings → API:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only, secret)

## 2. Gemini

Get a key at https://aistudio.google.com/app/apikey → `GEMINI_API_KEY`.
Model defaults to `gemini-3.1-flash-lite` (`GEMINI_MODEL`, free tier).

## 3. Environment variables

Copy `.env.local.example` to `.env.local` for local dev, and add the same
five variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, and optionally
`TRIAL_COOLDOWN_DAYS`) under Vercel → Project → Settings → Environment
Variables. Redeploy after adding them.

## 4. Run locally / deploy

```bash
npm install
npm run dev        # http://localhost:3000
```

To deploy: push this folder to a Git repo and import it in Vercel (it auto-
detects Next.js), or run `vercel` from inside the folder. Add the env vars
in the Vercel dashboard before the first deploy.

## Notes on the trial limit

`last_trial_at` and `trial_count` on `profiles` are only ever written by the
server (service-role key bypasses RLS); there is intentionally no `update`
RLS policy for regular users, so a user can't reset their own trial by
calling the Supabase client directly from devtools. To change the trial
period, edit `TRIAL_COOLDOWN_DAYS` (defaults to 7).

## Extending later

- Swap the free weekly trial for a paid plan by adding a `plan` column to
  `profiles` and branching in `lib/trial.js`.
- Add Anthropic back as a second provider by adding `ANTHROPIC_API_KEY` and
  a second branch in `app/api/analyze/route.js`.
 
