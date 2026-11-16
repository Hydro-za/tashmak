-- Enforce invoice tracker state in the database, not only in the page UI.
-- A job cannot be completed unless its latest invoice version is sent and still
-- matches the current saved quote snapshot. A stale invoice cannot be marked sent.
do $migration$
declare
  job_action_definition text;
  mark_sent_definition text;
  old_completion_line text := '    finished_at := now();';
  new_completion_line text := $replacement$
    if not exists (
      select 1
      from public.job_invoices i
      where i.job_id = p_job
        and i.version = (
          select max(latest.version)
          from public.job_invoices latest
          where latest.job_id = p_job
        )
        and i.status = 'invoice_sent'
        and i.source_snapshot = completed_snapshot
    ) then
      raise exception 'invoice_record_not_sent';
    end if;
    finished_at := now();$replacement$;
  old_mark_sent_check text := ' if inv.status<>''ready_for_invoice'' then raise exception ''invoice_not_ready''; end if;';
  new_mark_sent_check text := old_mark_sent_check || E'\n if inv.source_snapshot is distinct from public.invoice_job_snapshot(inv.job_id) then raise exception ''invoice_source_changed''; end if;';
begin
  select pg_get_functiondef('public.job_action(uuid,text,text,text)'::regprocedure)
    into job_action_definition;
  if position(old_completion_line in job_action_definition) = 0 then
    raise exception 'Could not find the job completion insertion point.';
  end if;
  job_action_definition := replace(job_action_definition, old_completion_line, new_completion_line);
  execute job_action_definition;

  select pg_get_functiondef('public.mark_job_invoice_sent(uuid)'::regprocedure)
    into mark_sent_definition;
  if position(old_mark_sent_check in mark_sent_definition) = 0 then
    raise exception 'Could not find the invoice send validation point.';
  end if;
  mark_sent_definition := replace(mark_sent_definition, old_mark_sent_check, new_mark_sent_check);
  execute mark_sent_definition;
end
$migration$;
