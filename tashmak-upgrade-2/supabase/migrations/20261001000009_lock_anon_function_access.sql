-- Anonymous visitors can call no database function; signed-in users get exactly the application functions.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.current_role_name(), public.is_owner(), public.is_assigned(uuid), public.job_stage_assigned(uuid, text), public.can_access_path(text), public.job_overdue_days(date, text),
  public.password_changed(), public.staff_directory(), public.staff_directory_v2(), public.has_perm(text), public.my_permissions(), public.set_qc_result(uuid, text, text), public.refresh_deadline_notifications(),
  public.save_quote(jsonb, jsonb), public.set_quote_status(uuid, text, text), public.start_job(uuid, date, text, boolean, boolean, uuid, uuid[], jsonb, text),
  public.job_action(uuid, text, text, text), public.record_qc(uuid, uuid, text, numeric, numeric, text), public.update_item_progress(uuid, numeric, numeric, numeric, numeric),
  public.job_assign(uuid, text, uuid[]), public.job_update_details(uuid, jsonb, int), public.add_job_note(uuid, text), public.record_supplied_item(uuid, uuid, text, numeric, text, text),
  public.register_file(uuid, uuid, uuid, uuid, text, text, text, text, bigint), public.set_final_file(uuid, boolean, text), public.mark_notifications_read(uuid[]),
  public.generate_overdue_notifications(), public.dashboard_counts(), public.employee_workload(), public.global_search(text),
  public.create_employee(text, text, text, text), public.reset_employee_password(uuid, text), public.set_employee_active(uuid, boolean), public.update_employee(uuid, text, text, text),
  public.archive_record(text, uuid, boolean) to authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
