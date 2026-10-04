-- PrintOps schema, part 4: row-level security, privileges, private file bucket.
-- Reads are allowed by policy; every workflow WRITE goes through the audited SECURITY DEFINER functions above.
create policy profiles_read on public.profiles for select to authenticated using (id = (select auth.uid()) or (select public.is_owner()));
create policy profiles_owner_update on public.profiles for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));

create policy customers_owner_read on public.customers for select to authenticated using ((select public.is_owner()));
create policy customers_owner_insert on public.customers for insert to authenticated with check ((select public.is_owner()));
create policy customers_owner_update on public.customers for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));

do $$ declare t text; begin
  foreach t in array array['product_categories','products','materials','machines','labour_types','finishing_options'] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select public.is_owner()))', t || '_r', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_owner()))', t || '_i', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()))', t || '_u', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.is_owner()))', t || '_d', t);
  end loop;
end $$;
create policy pricing_r on public.pricing_settings for select to authenticated using ((select public.is_owner()));
create policy pricing_u on public.pricing_settings for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy sys_r on public.system_settings for select to authenticated using ((select public.is_owner()) or key in ('business', 'workflow'));
create policy sys_u on public.system_settings for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy audit_r on public.config_audit for select to authenticated using ((select public.is_owner()));

create policy quotes_r on public.quotes for select to authenticated using ((select public.is_owner()));
create policy quote_items_r on public.quote_items for select to authenticated using ((select public.is_owner()));
create policy jobs_r on public.jobs for select to authenticated using ((select public.is_owner()) or (select public.is_assigned(id)));
create policy job_items_r on public.job_items for select to authenticated using ((select public.is_owner()) or (select public.is_assigned(job_id)));
create policy job_assign_r on public.job_assignments for select to authenticated using ((select public.is_owner()) or (select public.is_assigned(job_id)));
create policy job_activity_r on public.job_activity for select to authenticated using ((select public.is_owner()) or (job_id is not null and (select public.is_assigned(job_id))));
create policy job_notes_r on public.job_notes for select to authenticated using ((select public.is_owner()) or (select public.is_assigned(job_id)));
create policy files_r on public.file_attachments for select to authenticated using ((select public.is_owner()) or (job_id is not null and archived_at is null and (select public.is_assigned(job_id))));
create policy notif_r on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy qc_r on public.qc_checks for select to authenticated using ((select public.is_owner()) or (select public.is_assigned(job_id)));
create policy supplied_r on public.customer_supplied_items for select to authenticated using ((select public.is_owner()) or (select public.is_assigned(job_id)));

-- privileges
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from public, anon;
revoke insert, update, delete, truncate on public.quotes, public.quote_items, public.jobs, public.job_items, public.job_assignments, public.job_activity, public.job_notes,
  public.file_attachments, public.notifications, public.qc_checks, public.customer_supplied_items, public.counters, public.config_audit from authenticated;
revoke insert, delete, truncate on public.profiles from authenticated;
revoke all on public.counters from authenticated;
revoke delete, truncate on public.customers, public.pricing_settings, public.system_settings from authenticated;
revoke insert on public.pricing_settings, public.system_settings from authenticated;

-- internal helpers are only reachable from other SECURITY DEFINER functions, never directly by app users
revoke execute on function public.log_activity(uuid, uuid, uuid, text, text, text, jsonb), public.notify(uuid, text, text, text, uuid, uuid, text),
  public.notify_owners(text, text, text, uuid, uuid, text), public.notify_stage(uuid, text, text, text, text, text), public.next_number(text), public.person_name(uuid),
  public.touch_updated_at(), public.activity_immutable(), public.freeze_quote_items(), public.log_config_change(), public.protect_last_owner(), public.set_file_version(), public.sync_catalogue()
  from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- functions the app calls (each one checks the caller's role inside)
grant execute on function public.current_role_name(), public.is_owner(), public.is_assigned(uuid), public.job_stage_assigned(uuid, text), public.can_access_path(text), public.job_overdue_days(date, text),
  public.password_changed(), public.staff_directory(),
  public.save_quote(jsonb, jsonb), public.set_quote_status(uuid, text, text), public.start_job(uuid, date, text, boolean, boolean, uuid, uuid[], jsonb, text),
  public.job_action(uuid, text, text, text), public.record_qc(uuid, uuid, text, numeric, numeric, text), public.update_item_progress(uuid, numeric, numeric, numeric, numeric),
  public.job_assign(uuid, text, uuid[]), public.job_update_details(uuid, jsonb, int), public.add_job_note(uuid, text), public.record_supplied_item(uuid, uuid, text, numeric, text, text),
  public.register_file(uuid, uuid, uuid, uuid, text, text, text, text, bigint), public.set_final_file(uuid, boolean, text), public.mark_notifications_read(uuid[]),
  public.generate_overdue_notifications(), public.dashboard_counts(), public.employee_workload(), public.global_search(text),
  public.create_employee(text, text, text, text), public.reset_employee_password(uuid, text), public.set_employee_active(uuid, boolean), public.update_employee(uuid, text, text, text),
  public.archive_record(text, uuid, boolean) to authenticated;

-- storage: one private bucket; access follows job assignment
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
 ('job-files', 'job-files', false, 26214400,
  array['image/png','image/jpeg','image/webp','image/gif','image/tiff','application/pdf','application/postscript','application/illustrator','image/vnd.adobe.photoshop','application/zip','application/x-zip-compressed','text/plain'])
on conflict (id) do nothing;
create policy "job files read" on storage.objects for select to authenticated using (bucket_id = 'job-files' and (select public.can_access_path(name)));
create policy "job files upload" on storage.objects for insert to authenticated with check (bucket_id = 'job-files' and (select public.can_access_path(name)));
