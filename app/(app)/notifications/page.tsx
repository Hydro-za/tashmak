import Link from 'next/link';
import { requireMe } from '@/lib/session';
import { Empty } from '@/components/ui';
import ActionButton from '@/components/ActionButton';
import { markNotificationsRead } from '@/lib/actions';
import { fmtDateTime } from '@/lib/labels';
export const dynamic = 'force-dynamic';
export default async function Notifications() {
  const { sb, user, profile } = await requireMe();
  const { data } = await sb.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100);
  const href = (n: any) => n.job_id ? (profile.role === 'owner' ? '/jobs/' : '/my-jobs/') + n.job_id : n.quote_id && profile.role === 'owner' ? '/quotes/' + n.quote_id : null;
  const unread = (data || []).filter((n: any) => !n.read_at).length;
  return (<><div className="top"><h1>Notifications</h1>{unread > 0 && <ActionButton className="btn" label="Mark all as read" action={markNotificationsRead} args={[]} successText="All read" />}</div>
    {!data?.length ? <Empty text="You're all caught up." /> : <div className="card">{data.map((n: any) => { const h = href(n); const inner = <><div><b>{n.title}</b>{!n.read_at && <span className="badge b-sent" style={{ marginLeft: 8 }}>new</span>}</div>{n.body && <div className="muted">{n.body}</div>}<div className="muted" style={{ fontSize: 12 }}>{fmtDateTime(n.created_at)}</div></>;
      return <div className="linkrow" key={n.id} style={{ background: n.read_at ? undefined : 'var(--info-bg)', borderRadius: 8, padding: '10px' }}>{h ? <Link href={h} style={{ textDecoration: 'none', flex: 1 }}>{inner}</Link> : <div style={{ flex: 1 }}>{inner}</div>}{!n.read_at && <ActionButton className="btn sm" label="Read" action={markNotificationsRead} args={[[n.id]]} />}</div>; })}</div>}</>);
}
