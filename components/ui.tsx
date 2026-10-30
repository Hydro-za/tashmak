import Link from 'next/link';
import { JOB_STATUS, QUOTE_STATUS, SIMPLE, QC_LABEL, simpleStatus, dueState, overdueDays } from '@/lib/labels';

export const StatusBadge = ({ status, kind = 'job' }: { status: string; kind?: 'job' | 'quote' }) => {
  const m = (kind === 'job' ? JOB_STATUS : QUOTE_STATUS)[status] || { label: status, tone: 'draft' };
  return <span className={'badge b-' + m.tone}>{m.label}</span>;
};
export const PrioBadge = ({ p }: { p: string }) => <span className={'prio prio-' + p}>{p}</span>;
export const Overdue = ({ due, status }: { due: string | null; status: string }) => { const d = overdueDays(due, status); return d > 0 ? <span className="overdue">OVERDUE — {d} DAY{d > 1 ? 'S' : ''}</span> : null; };
export const Empty = ({ text, action }: { text: string; action?: React.ReactNode }) => <div className="card" style={{ textAlign: 'center', color: 'var(--muted)' }}><p>{text}</p>{action}</div>;
export const Top = ({ title, sub, children }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) =>
  <div className="top page-heading"><div className="page-title-group"><h1>{title}</h1>{sub && <div className="muted">{sub}</div>}</div><div className="actions">{children}</div></div>;
export const Spec = ({ rows }: { rows: { label: string; value: any }[] }) =>
  <dl className="specgrid">{rows.filter(r => r.value !== undefined && r.value !== null && r.value !== '').map((r, i) => <div key={i} style={{ display: 'contents' }}><dt>{r.label}</dt><dd>{String(r.value)}</dd></div>)}</dl>;
export const A = ({ href, children, className = 'btn sm' }: any) => <Link href={href} className={className}>{children}</Link>;

/** Main status chip: the four simple statuses. The detailed stage is shown on hover and on the job page. */
export const JobStatus = ({ job }: { job: { status: string; design_started_at?: string | null } }) => { const k = simpleStatus(job); const m = SIMPLE[k]; return <span className={'badge b-' + m.tone} title={(JOB_STATUS[job.status] || { label: job.status }).label}>{m.label}</span>; };
export const QcBadge = ({ status }: { status: string }) => { const m = QC_LABEL[status] || QC_LABEL.not_checked; return <span className={'badge b-' + m.tone}>QC: {m.label}</span>; };
export const DueFlag = ({ due, status }: { due: string | null; status: string }) => { const d = dueState(due, status); if (!d) return null; const days = overdueDays(due, status); return d === 'overdue' ? <span className="overdue">OVERDUE — {days} DAY{days > 1 ? 'S' : ''}</span> : <span className="badge b-expired">Due soon</span>; };
