import Link from 'next/link';
import { requireOwner } from '@/lib/session';
import { Top } from '@/components/ui';
import { staffNames } from '@/lib/jobs';
import { FINAL_JOB, JOB_STATUS, overdueDays, fmtDate, todaySA } from '@/lib/labels';
export const dynamic = 'force-dynamic';
export default async function Reports({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const { sb } = await requireOwner();
  const t = todaySA(); const d = new Date(t + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 30);
  const from = searchParams.from || d.toISOString().slice(0, 10), to = searchParams.to || t;
  const [{ data: jobs }, names] = await Promise.all([sb.from('jobs').select('*, job_items(product_name,category_name,qty_ordered), job_assignments(user_id,stage,active)').is('archived_at', null).limit(2000), staffNames(sb)]);
  const all = jobs || []; const inRange = all.filter((j: any) => j.created_at.slice(0, 10) >= from && j.created_at.slice(0, 10) <= to);
  const completed = all.filter((j: any) => j.completed_at && j.completed_at.slice(0, 10) >= from && j.completed_at.slice(0, 10) <= to);
  const days = completed.length ? completed.reduce((a: number, j: any) => a + (new Date(j.completed_at).getTime() - new Date(j.created_at).getTime()) / 86400000, 0) / completed.length : 0;
  const tally = (fn: (j: any) => string[]) => { const m: Record<string, number> = {}; inRange.forEach((j: any) => fn(j).forEach(k => { m[k] = (m[k] || 0) + 1; })); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const byStatus = tally(j => [JOB_STATUS[j.status]?.label || j.status]);
  const byProduct = tally(j => [...new Set<string>(j.job_items.map((i: any) => i.product_name))]);
  const byCat = tally(j => [...new Set<string>(j.job_items.map((i: any) => i.category_name || 'Other'))]);
  const byEmp = tally(j => [...new Set<string>(j.job_assignments.filter((a: any) => a.active).map((a: any) => names[a.user_id] || 'Unknown'))]);
  const overdue = all.filter((j: any) => overdueDays(j.due_date, j.status) > 0);
  const table = (title: string, rows: [string, number][]) => <div className="card"><h2>{title}</h2>{rows.length ? <table className="tbl"><tbody>{rows.map(([k, v]) => <tr key={k}><td>{k}</td><td className="r"><b>{v}</b></td></tr>)}</tbody></table> : <p className="muted">No data in this period.</p>}</div>;
  const list = (title: string, rows: any[]) => <div className="card"><h2>{title} ({rows.length})</h2>{rows.slice(0, 15).map((j: any) => <div className="linkrow" key={j.id}><Link href={'/jobs/' + j.id}><b>{j.number}</b> · {j.customer_name}</Link><span>{fmtDate(j.due_date)}</span></div>)}{!rows.length && <p className="muted">None.</p>}</div>;
  return (<><Top title="Reports" sub="Operational reports — no accounting" />
    <form className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}><div className="field"><label>From</label><input type="date" name="from" defaultValue={from} /></div><div className="field"><label>To</label><input type="date" name="to" defaultValue={to} /></div><button className="btn primary">Update</button></form>
    <div className="stats"><div className="stat"><div className="k">Jobs created</div><div className="v">{inRange.length}</div></div><div className="stat"><div className="k">Jobs completed</div><div className="v">{completed.length}</div></div><div className="stat"><div className="k">Avg. completion time</div><div className="v">{days.toFixed(1)} d</div></div><div className="stat"><div className="k">Overdue now</div><div className="v">{overdue.length}</div></div></div>
    <div className="grid g2">{table('Jobs by status', byStatus)}{table('Jobs by employee (workload)', byEmp)}{table('Jobs by product', byProduct)}{table('Jobs by product category', byCat)}</div>
    <div className="grid g2">{list('Overdue jobs', overdue)}{list('In production', all.filter((j: any) => ['in_production', 'rework', 'qc'].includes(j.status)))}{list('Ready for collection', all.filter((j: any) => j.status === 'ready_collection'))}{list('Ready for delivery', all.filter((j: any) => j.status === 'ready_delivery'))}{list('Ready for invoice', all.filter((j: any) => j.status === 'ready_invoice'))}</div></>);
}
