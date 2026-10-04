# PrintOps — build progress (update this file at every stop)

## Environment (already created — do NOT recreate)
- Supabase project: `printing-management` ref `lhookagjqucbpabpdhsk`, region eu-west-2, FREE plan ($0).
  URL https://lhookagjqucbpabpdhsk.supabase.co  (publishable key: sb_publishable_Dk8pCtf4yWhtAkP9cvI3iQ_lmEI6amG)
- Owner auth user created: munusamydamian7@gmail.com (username `owner`), NO password yet.
  -> after deploy: set Supabase Auth Site URL + redirect URLs to the Vercel domain, then use "Forgot password" on /login.
- Old claude.ai artifact calculator (reference, DO NOT rebuild): /home/claude/pq (engine.js, seed.js tested 106/106) also published artifact.
- User has a GitHub account (will host repo). Vercel + Supabase MCP tools available (tool_search to load).

## DONE (database, all applied & tested via rolled-back SQL test: 57/57 pass)
Migrations applied: 001_core_tables, 002_quotes_jobs_tables, 003a_helpers_quotes_start_job, 003b_job_workflow_functions,
004_rls_grants_storage (applied earlier, differs slightly from drafts: has jobs_overview view, password_changed(), can_access_path()),
005_lock_internal_functions, 006_staff_directory_function.
- Tables: profiles, customers, product_categories/products/materials/machines/labour_types/finishing_options (id text, data jsonb in calculator shape),
  pricing_settings, system_settings, counters, config_audit, quotes, quote_items, jobs, job_items, job_assignments, job_activity (immutable),
  job_notes, file_attachments, notifications, qc_checks, customer_supplied_items. RLS everywhere; writes via SECURITY DEFINER RPCs.
- RPCs: save_quote, set_quote_status, start_job, job_action(design_start|design_complete|design_approve|design_reject|production_start|production_complete|
  ready_collection|ready_delivery|collected|delivered|ready_invoice|cancel|reopen_design|reopen_queued|reopen_production), record_qc, update_item_progress,
  job_assign, job_update_details, add_job_note, record_supplied_item, register_file, set_final_file, mark_notifications_read,
  generate_overdue_notifications, dashboard_counts, employee_workload, global_search, staff_directory(), password_changed().
- Storage bucket `job-files` (private, 25MB, path jobs/<job_id>/..., quotes/<id>/..., customers/<id>/...).
- Security advisor: only intended findings remain (RPCs executable by authenticated, each checks role inside).

## DONE — application code (/home/claude/printops, `next build` passes, `tsc` clean)
- Migration 007 applied: create_employee / reset_employee_password / set_employee_active / update_employee / archive_record (tested 11/11 in DB).
- Next.js 14 App Router app: login (username or owner email), change-password, auth callback, middleware route protection, role-aware shell (owner nav / employee nav, mobile bottom nav, global search, bell).
- Calculator: UNCHANGED engine + UI embedded as /calculator.html (built by `python3 calculator/build.py` from calculator/src). Bridge hands finished quotes to host -> save_quote RPC.
  Existing Settings/catalogue/product-wizard screens embedded as /pricing.html (Products & Pricing) with persistence redirected to Postgres.
- Pages: dashboard, jobs (queue/list/filters/remembered filters), job detail (work order, QC, files+versions+FINAL, supplied items, notes, timeline, assign, reopen/cancel/archive),
  quotes (list, new, edit, duplicate, detail with PDF generate/download/share, accept/decline, start-job form), customers, employees (create/reset/deactivate), my-jobs, my-job screen (big buttons), completed, notifications, profile, reports, settings.
- Tests (all pass): `node tests/engine.test.js` 106; `node tests/calc_embed.test.js` 21; `node tests/pricing_embed.test.js` 11; DB tests 57 + 11 (run via Supabase SQL, rolled back).

## DONE (continued)
- Export-ready migrations in supabase/migrations (5 files, squashed = exactly what is live). Verified: apply cleanly to an empty Postgres and a smoke workflow passes there.
- README.md, .env.example, supabase/seed_owner.sql, tests (npm test).
- DB tests total: 57 + 11 + 52 = 120 checks passed against the live Supabase project (rolled back, no residue).
- Local production server smoke: /login 200, all protected routes 307 -> /login, security headers present.

## TODO
1. Push repo to GitHub (user) -> I call create_git_project (needs owner/repo + Vercel teamId via list_teams) -> set env vars NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY on the Vercel project -> deploy.
2. Supabase Auth: Site URL + Redirect URL (https://<vercel-domain>/auth/callback) — dashboard step (no API available to me).
3. Owner: Forgot password -> set password -> Load demo defaults / enter real pricing.
4. Live click-through by the user on phone + desktop of the 6 workflows (printing, DTF, no design, delivery, customer-supplied garment, multi-product).
