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

## Branding, themes, speed
* Brand assets live in `public/brand/` (logo for light and dark mode, app icons) plus `app/icon.png` and `app/apple-icon.png`; colours are the CSS variables at the top of `app/globals.css` (accent = Tashmak teal `#04767b`). The quote PDF uses the logo uploaded in Settings → Business and falls back to `public/brand/logo.png`.
* Light / dark / follow-device theme: toggle in the sidebar (and the top bar on phones and the login page). Saved per browser; also applied inside the embedded calculator screens.
* The app can be installed on a phone home screen (web manifest + icons).
* `vercel.json` pins server functions to London (`lhr1`), next to the Supabase database, which removes most of the page-load delay.

## Roles & permissions (stage 1 of the 2nd upgrade)
* Permissions: view all jobs, manage jobs, work design stage, work production stage, view/manage customers, view/manage employees, manage roles, perform quality checks, view/manage salaries, manage labour time, manage settings, manage notifications, view reports. Owners always hold all of them.
* They are enforced in the database (row-level security and the job functions call `has_perm()`), in server code, and in the menu. Quotes, pricing and products stay owner-only.
* Quality check: **Not Checked / Passed / Not Passed**, separate from job status. Production complete puts a QC job in *Awaiting Quality Check*; only someone with the QC permission can record a result; *Not Passed* sends it back to production with the note.
* Job statuses shown to everyone: **Pending, In Progress, Awaiting Quality Check, Completed** (the detailed design/production/collection/delivery steps still exist and are shown on the job page).
* Notifications: bell opens a live panel; deadline reminders (overdue / due today or tomorrow) are created by the database once per job, person and day.

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
