import Link from 'next/link';
import { requirePerm } from '@/lib/session';
import { Top, JobStatus, QcBadge, PrioBadge, DueFlag, Empty } from '@/components/ui';
import { SIMPLE, simpleStatus, isCompletedJob, fmtDate, type SimpleKey } from '@/lib/labels';
import { sortJobs, staffNames } from '@/lib/jobs';

export const dynamic = 'force-dynamic';

type SearchParams = { q?: string; status?: string; archived?: string };

export default async function Jobs({ searchParams }: { searchParams: SearchParams }) {
  const me = await requirePerm('jobs.view_all');
  let query = me.sb
    .from('jobs')
    .select('*, quotes(number), job_items(product_name), job_assignments(user_id,stage,active)')
    .order('created_at', { ascending: false })
    .limit(600);

  query = searchParams.archived
    ? query.not('archived_at', 'is', null)
    : query.is('archived_at', null);

  const [{ data }, names] = await Promise.all([query, staffNames(me.sb)]);
  const all = data || [];
  const term = (searchParams.q || '').trim().toLowerCase();
  const status = searchParams.status || 'all';

  const rows = all.filter((job: any) => {
    if (term) {
      const searchable = [
        job.number,
        job.title,
        job.customer_name,
        job.quotes?.number,
        ...job.job_items.map((item: any) => item.product_name),
      ].join(' ').toLowerCase();
      if (!searchable.includes(term)) return false;
    }

    if (status === 'active' && isCompletedJob(job)) return false;
    if (status === 'completed' && !isCompletedJob(job)) return false;
    if (status !== 'all' && status !== 'active' && status !== 'completed') {
      if (simpleStatus(job) !== status) return false;
    }
    return true;
  }).sort(status === 'completed' ? (a: any, b: any) =>
    String(b.completed_at || b.updated_at).localeCompare(String(a.completed_at || a.updated_at))
  : sortJobs);

  const activeCount = all.filter((job: any) => !isCompletedJob(job)).length;
  const completedCount = all.length - activeCount;
  const getTeam = (job: any) => job.job_assignments
    .filter((assignment: any) => assignment.active)
    .map((assignment: any) => names[assignment.user_id])
    .filter(Boolean);
  const getName = (job: any) => job.title
    || job.job_items.map((item: any) => item.product_name).slice(0, 2).join(', ')
    || job.number;

  const chip = (label: string, value: string, selected: boolean, archived = !!searchParams.archived) => (
    <Link
      key={value}
      className={selected ? 'on' : ''}
      href={{
        pathname: '/jobs',
        query: {
          ...(searchParams.q ? { q: searchParams.q } : {}),
          ...(archived ? { archived: '1' } : {}),
          ...(value !== 'all' ? { status: value } : {}),
        },
      }}
    >
      {label}
    </Link>
  );

  return (
    <div className="page-jobs">
      <Top title="Jobs">
        {me.can('jobs.manage') && <Link href="/jobs/new" className="btn primary">+ New job</Link>}
      </Top>

      <form className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} action="/jobs">
        {searchParams.status && <input type="hidden" name="status" value={searchParams.status} />}
        {searchParams.archived && <input type="hidden" name="archived" value="1" />}
        <input
          name="q"
          defaultValue={searchParams.q || ''}
          placeholder="Job number, name, customer or product"
          aria-label="Search jobs"
          style={{ flex: 1, minWidth: 200 }}
        />
        <button className="btn">Search</button>
      </form>

      <div className="chips">
        {chip('All', 'all', !status || status === 'all')}
        {chip(`Active (${activeCount})`, 'active', status === 'active')}
        {chip(`Completed (${completedCount})`, 'completed', status === 'completed')}
        {(Object.keys(SIMPLE) as SimpleKey[]).filter((key) => key !== 'completed').map((key) =>
          chip(SIMPLE[key].label, key, status === key)
        )}
        {chip('Archived', 'all', !!searchParams.archived, !searchParams.archived)}
      </div>

      {!rows.length ? (
        <Empty
          text={searchParams.archived ? 'No archived jobs found.' : 'No jobs found.'}
          action={!searchParams.archived && me.can('jobs.manage')
            ? <Link className="btn primary" href="/jobs/new">Create a job</Link>
            : undefined}
        />
      ) : (
        <div className="card">
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Customer</th>
                  <th>Assigned to</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>{status === 'completed' ? 'Completed' : 'Due'}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((job: any) => {
                  const team = getTeam(job);
                  return (
                    <tr key={job.id} className="click">
                      <td>
                        <Link href={'/jobs/' + job.id}><b>{getName(job)}</b></Link>
                        <div className="muted">
                          {job.number}
                          {job.quotes?.number ? ' · ' + job.quotes.number : ''}
                          {' '}<PrioBadge p={job.priority} />
                        </div>
                      </td>
                      <td>{job.customer_name}</td>
                      <td className="muted">
                        {team.length ? team.join(', ') : <span className="overdue">Not assigned</span>}
                      </td>
                      <td>
                        <JobStatus job={job} />
                        {(job.qc_status !== 'not_checked' || job.status === 'qc') && (
                          <div style={{ marginTop: 4 }}><QcBadge status={job.qc_status} /></div>
                        )}
                      </td>
                      <td>{fmtDate(job.created_at)}</td>
                      <td>
                        {status === 'completed'
                          ? fmtDate(job.completed_at || job.updated_at)
                          : <>{fmtDate(job.due_date)}<div><DueFlag due={job.due_date} status={job.status} /></div></>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
