-- Remove the obsolete Sage-specific wording from the job completion timeline.
-- Preserve the existing workflow and every other part of job_action.
do $migration$
declare
  definition text;
begin
  select pg_get_functiondef('public.job_action(uuid,text,text,text)'::regprocedure)
    into definition;

  if position('invoice had been entered in Sage and sent.' in definition) = 0 then
    raise exception 'Expected legacy invoice wording was not found in public.job_action.';
  end if;

  definition := replace(
    definition,
    'invoice had been entered in Sage and sent.',
    'invoice had been recorded and sent.'
  );

  execute definition;
end
$migration$;
