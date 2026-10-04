# PrintOps — printing quote & production management

Next.js 14 (App Router) on Vercel · Supabase (PostgreSQL, Auth, Storage, Row Level Security).
Covers general printing **and** DTF/clothing: existing calculator → saved quote → PDF → (WhatsApp, manual) → accepted → job → design → production → QC → collection/delivery → ready for invoice.

## What is where
| Path | Purpose |
|---|---|
| `calculator/src/*` | The existing quote calculator (engine + UI), **unchanged**. `python3 calculator/build.py` rebuilds `public/calculator.html` (quote builder + DTF/Paper/Large-format calculators) and `public/pricing.html` (Products & Pricing screens). `bridge*.js` is the only glue: it hands finished quotes / catalogue edits to the host page. |
| `app/`, `components/`, `lib/` | Management system (owner & employee screens, server actions). |
| `supabase/migrations/*.sql` | Complete schema, workflow functions, RLS policies, storage bucket. |
| `supabase/seed_owner.sql` | One-time creation of the initial Owner (no password). |
| `tests/` | Engine, embedded-calculator, PDF/spec tests. |

## Setup (about 15 minutes)
1. **Supabase**: create a project (free plan is fine). SQL editor → run the files in `supabase/migrations/` in order, then `supabase/seed_owner.sql` (edit the email first).
2. **GitHub → Vercel**: push this folder to a (private) GitHub repo → Vercel → *Add New Project* → import it (framework: Next.js, nothing else to configure).
3. **Environment variables** (Vercel → Settings → Environment Variables; see `.env.example`):
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the *publishable/anon* key). **Never** add a service-role key — the app does not need one.
4. **Supabase → Authentication → URL Configuration**: Site URL = your Vercel URL; add `https://YOUR-URL/auth/callback` to Redirect URLs.
5. Open `/login` → *Forgot password (Owner)* → set your password from the email → sign in.
6. Products & Pricing → *Load demo defaults* (placeholder prices!) or add your own materials/machines/labour/finishing/products; set VAT, markup, rounding. Settings → business details, logo, quote/job numbering and terms.
7. Employees → add designers / production staff (you choose a username + temporary password; they must change it at first sign-in).

## Security model
* Roles: **owner**, **designer**, **production**. Enforced in the database (RLS + SECURITY DEFINER functions), in server actions, and in the UI.
* Employees can only read jobs assigned to them. They can never read quotes, prices, costs, customers or pricing settings. Job "specs" given to employees are built server-side without any prices.
* All state changes go through database functions (`job_action`, `save_quote`, `start_job`, …) that lock the row, validate the transition, are idempotent (double-presses do nothing twice) and write the immutable activity log + notifications.
* `job_activity` cannot be updated or deleted by anyone (trigger + no privileges). Quotes/jobs/customers are never deleted — they are archived.
* Saved quotes store the exact calculation snapshot and VAT settings; later price changes never alter them. Accepted quotes are frozen.
* Employee accounts live in Supabase Auth as `username@employees.invalid` (a reserved, non-routable domain). Passwords are bcrypt-hashed by the database; no plain text is stored.
* Files: private bucket `job-files`, paths `jobs/<job_id>/…`; access follows job assignment; signed URLs expire after 1 hour.

## Tests
`npm test` runs the calculator engine (106 checks), the embedded calculator and pricing screens (32 checks) and the PDF / spec logic (19 checks).
Database behaviour (permissions, workflow, notifications, numbering) was verified with transactional SQL tests against Supabase — see `PROGRESS.md`.

## Known limits (v1)
* In-app notifications only (no push). The app refreshes data every 20–30 s and on navigation (no websockets).
* Quote PDFs are generated in the browser (jsPDF) from the saved quote; on phones the native share sheet is used when the browser supports sharing files.
* Supabase's built-in email is rate-limited; only the Owner password reset uses it. Configure custom SMTP if you need more.
